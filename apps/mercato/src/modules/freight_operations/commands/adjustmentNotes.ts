import { randomUUID } from 'node:crypto'
import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { ModuleConfigService } from '@open-mercato/core/modules/configs/lib/module-config-service'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { emitCrudSideEffects } from '@open-mercato/shared/lib/commands/helpers'
import { enforceCommandOptimisticLockWithGuards } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import { z } from 'zod'
import { FreightAdjustmentNote, FreightOrder } from '../data/entities'
import { createAdjustmentNoteSchema, updateAdjustmentNoteSchema } from '../data/validators'
import { registerCrudCommands, resolveScope, type CrudCommandConfig } from './crud'
import {
  FREIGHT_ADJUSTMENT_NOTE_ENTITY_ID,
  freightAdjustmentNoteEvents,
  freightAdjustmentNoteIndexer,
} from './entities'
import { raiseFreightError } from '../lib/errors'
import { readFreightSettings, type FreightScope } from '../lib/freightSettings'
import { allocateDocumentNumber } from '../lib/documentNumber'
import { amountToString, computeLineEnvelope, toAmountNumber } from '../lib/money'
import { emitFreightEvent } from '../events'

/**
 * Freight credit/debit notes.
 *
 * A note starts as a draft against an order (or an explicit customer), then is
 * issued with a sequential number. The issue event is what the financial module
 * posts: a credit reduces revenue, output VAT and the receivable; a debit
 * increases them. Amounts are computed here from net + VAT, so the printed
 * document and the journal entry share one arithmetic path.
 */

function entityManager(ctx: CommandRuntimeContext): EntityManager {
  return (ctx.container.resolve('em') as EntityManager).fork()
}

async function loadSettings(ctx: CommandRuntimeContext, scope: FreightScope) {
  const configService = ctx.container.resolve('moduleConfigService') as ModuleConfigService
  return readFreightSettings(configService, scope)
}

function toDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

type NoteSource = {
  customerId: string
  customerSnapshot: Record<string, unknown> | null
  currencyCode: string
}

async function resolveNoteSource(
  em: EntityManager,
  scope: FreightScope,
  input: { orderId?: string | null; customerId?: string | null; customerSnapshot?: Record<string, unknown> | null; currencyCode?: string },
): Promise<NoteSource> {
  if (input.orderId) {
    const order = await em.findOne(FreightOrder, {
      id: input.orderId,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      deletedAt: null,
    })
    if (!order) return raiseFreightError(404, 'order_not_found', 'Freight order not found.')
    return {
      customerId: order.customerId,
      customerSnapshot: order.customerSnapshot ?? null,
      currencyCode: input.currencyCode ?? order.currencyCode,
    }
  }
  if (!input.customerId) {
    return raiseFreightError(400, 'note_source_required', 'Choose an order or a customer for the note.')
  }
  return {
    customerId: input.customerId,
    customerSnapshot: input.customerSnapshot ?? null,
    currencyCode: input.currencyCode ?? 'SAR',
  }
}

function computeAmounts(input: {
  netAmount: string | number
  taxAmount?: string | number | null
  vatRate?: number | null
}, fallbackVatPercent: number) {
  if (input.taxAmount !== undefined && input.taxAmount !== null) {
    const net = toAmountNumber(input.netAmount)
    const tax = toAmountNumber(input.taxAmount)
    return { netAmount: amountToString(net), taxAmount: amountToString(tax), grossAmount: amountToString(net + tax) }
  }
  const envelope = computeLineEnvelope(input.netAmount, input.vatRate ?? fallbackVatPercent)
  return {
    netAmount: amountToString(envelope.net),
    taxAmount: amountToString(envelope.tax),
    grossAmount: amountToString(envelope.gross),
  }
}

function toIsoInstant(value: Date | string | null | undefined, fallback: Date): string {
  if (!value) return fallback.toISOString()
  const parsed = value instanceof Date
    ? value
    : new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value)
  return Number.isNaN(parsed.getTime()) ? fallback.toISOString() : parsed.toISOString()
}

function noteEventPayload(note: FreightAdjustmentNote, scope: FreightScope, operation?: 'reverse') {
  return {
    id: note.id,
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    noteNumber: note.noteNumber,
    noteType: note.noteType,
    currencyCode: note.currencyCode,
    issueDate: toIsoInstant(note.issueDate ?? note.issuedAt, new Date()),
    netAmount: note.netAmount,
    taxAmount: note.taxAmount,
    grossAmount: note.grossAmount,
    description: `Freight ${note.noteType} note ${note.noteNumber}${note.reason ? ` — ${note.reason}` : ''}`,
    ...(operation ? { operation } : {}),
  }
}

const adjustmentNoteCrudConfig: CrudCommandConfig<FreightAdjustmentNote> = {
  entity: FreightAdjustmentNote,
  entityId: FREIGHT_ADJUSTMENT_NOTE_ENTITY_ID,
  resource: 'adjustment_notes',
  createSchema: createAdjustmentNoteSchema,
  updateSchema: updateAdjustmentNoteSchema,
  toCreateData: async (input, ctx) => {
    const scope = resolveScope(ctx)
    const em = entityManager(ctx)
    const settings = await loadSettings(ctx, scope)
    const source = await resolveNoteSource(em, scope, input as {
      orderId?: string | null
      customerId?: string | null
      customerSnapshot?: Record<string, unknown> | null
      currencyCode?: string
    })
    const amounts = computeAmounts(
      {
        netAmount: String(input.netAmount),
        taxAmount: input.taxAmount as string | number | null | undefined,
        vatRate: input.vatRate as number | null | undefined,
      },
      settings.defaultVatRate * 100,
    )
    return {
      noteNumber: `DRAFT-${randomUUID().slice(0, 8).toUpperCase()}`,
      noteType: input.noteType,
      status: 'draft' as const,
      orderId: (input.orderId as string | null | undefined) ?? null,
      tripId: (input.tripId as string | null | undefined) ?? null,
      abstractId: (input.abstractId as string | null | undefined) ?? null,
      salesInvoiceId: (input.salesInvoiceId as string | null | undefined) ?? null,
      customerId: source.customerId,
      customerSnapshot: source.customerSnapshot,
      currencyCode: source.currencyCode,
      netAmount: amounts.netAmount,
      taxAmount: amounts.taxAmount,
      grossAmount: amounts.grossAmount,
      vatRate: input.vatRate === undefined || input.vatRate === null ? String(settings.defaultVatRate * 100) : String(input.vatRate),
      reason: (input.reason as string | null | undefined) ?? null,
      issueDate: toDateOnly(input.issueDate as string | null | undefined),
    } as never
  },
  toUpdateData: async (input, current, ctx) => {
    const note = current as FreightAdjustmentNote
    const scope = resolveScope(ctx)
    const em = entityManager(ctx)
    const settings = await loadSettings(ctx, scope)
    const merged = {
      netAmount: input.netAmount === undefined ? note.netAmount : String(input.netAmount),
      taxAmount: input.taxAmount === undefined ? note.taxAmount : (input.taxAmount as string | number | null),
      vatRate: input.vatRate === undefined ? (note.vatRate ? Number(note.vatRate) : null) : (input.vatRate as number | null),
    }
    const amounts = computeAmounts(merged, settings.defaultVatRate * 100)
    const source = input.orderId === undefined && input.customerId === undefined && input.customerSnapshot === undefined
      ? null
      : await resolveNoteSource(em, scope, {
        orderId: input.orderId as string | null | undefined,
        customerId: input.customerId as string | null | undefined,
        customerSnapshot: input.customerSnapshot as Record<string, unknown> | null | undefined,
        currencyCode: input.currencyCode as string | undefined,
      })
    return {
      ...(input.noteType !== undefined ? { noteType: input.noteType } : {}),
      ...(input.orderId !== undefined ? { orderId: input.orderId } : {}),
      ...(input.tripId !== undefined ? { tripId: input.tripId } : {}),
      ...(input.abstractId !== undefined ? { abstractId: input.abstractId } : {}),
      ...(input.salesInvoiceId !== undefined ? { salesInvoiceId: input.salesInvoiceId } : {}),
      ...(source ? { customerId: source.customerId, customerSnapshot: source.customerSnapshot, currencyCode: source.currencyCode } : {}),
      ...(input.currencyCode !== undefined && !source ? { currencyCode: input.currencyCode } : {}),
      ...(input.netAmount !== undefined || input.taxAmount !== undefined || input.vatRate !== undefined
        ? {
            netAmount: amounts.netAmount,
            taxAmount: amounts.taxAmount,
            grossAmount: amounts.grossAmount,
            vatRate: merged.vatRate === null || merged.vatRate === undefined ? null : String(merged.vatRate),
          }
        : {}),
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      ...(input.issueDate !== undefined ? { issueDate: toDateOnly(input.issueDate as string | null | undefined) } : {}),
    } as never
  },
  events: freightAdjustmentNoteEvents,
  indexer: freightAdjustmentNoteIndexer,
  beforeUpdate: async (_input, current) => {
    const note = current as FreightAdjustmentNote
    if (note.status !== 'draft') return raiseFreightError(409, 'note_not_editable', 'Only draft notes can be changed.')
  },
  beforeDelete: async (current) => {
    const note = current as FreightAdjustmentNote
    if (note.status !== 'draft') return raiseFreightError(409, 'note_not_deletable', 'Only draft notes can be deleted.')
  },
}

registerCrudCommands(adjustmentNoteCrudConfig)

const noteActionSchema = z.object({ id: z.string().uuid() })

async function findNoteForAction(
  ctx: CommandRuntimeContext,
  em: EntityManager,
  scope: FreightScope,
  id: string,
): Promise<FreightAdjustmentNote> {
  const note = await em.findOne(
    FreightAdjustmentNote,
    { id, tenantId: scope.tenantId, organizationId: scope.organizationId, deletedAt: null },
    { lockMode: LockMode.PESSIMISTIC_WRITE },
  )
  if (!note) return raiseFreightError(404, 'note_not_found', 'Adjustment note not found.')
  await enforceCommandOptimisticLockWithGuards(ctx.container, {
    resourceKind: FREIGHT_ADJUSTMENT_NOTE_ENTITY_ID,
    resourceId: note.id,
    current: note.updatedAt,
    request: ctx.request ?? null,
  })
  return note
}

const issueAdjustmentNoteCommand: CommandHandler<{ id: string }, { noteId: string; noteNumber: string }> = {
  id: 'freight_operations.adjustment_notes.issue',
  async execute(rawInput, ctx) {
    const input = noteActionSchema.parse(rawInput)
    const scope = resolveScope(ctx)
    const em = entityManager(ctx)
    const settings = await loadSettings(ctx, scope)
    const note = await em.transactional(async (tx) => {
      const locked = await findNoteForAction(ctx, tx, scope, input.id)
      if (locked.status !== 'draft') {
        return raiseFreightError(409, 'note_not_draft', 'Only draft notes can be issued.')
      }
      const noteNumber = await allocateDocumentNumber(tx, scope, 'adjustment_note', settings)
      locked.noteNumber = noteNumber
      locked.status = 'issued'
      locked.issuedAt = new Date()
      locked.issueDate = locked.issueDate ?? new Date(new Date().toISOString().slice(0, 10))
      locked.updatedAt = new Date()
      await tx.persist(locked).flush()
      return locked
    })

    const dataEngine = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine,
      action: 'updated',
      entity: note,
      identifiers: { id: note.id, ...scope },
      actorUserId: ctx.auth?.sub ?? null,
      events: freightAdjustmentNoteEvents,
      indexer: freightAdjustmentNoteIndexer,
    })
    // Persistent + enqueue-only: the financial posting runs in the events worker
    // (retried on failure), not on the request path.
    await emitFreightEvent('freight_operations.adjustment_note.issued', noteEventPayload(note, scope), {
      persistent: true,
      deliverInline: false,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
    })
    return { noteId: note.id, noteNumber: note.noteNumber }
  },
  buildLog: ({ input, ctx }) => {
    const scope = resolveScope(ctx)
    return {
      actionLabel: 'Issue credit/debit note',
      resourceKind: FREIGHT_ADJUSTMENT_NOTE_ENTITY_ID,
      resourceId: input.id,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
    }
  },
}

const cancelAdjustmentNoteCommand: CommandHandler<{ id: string }, { noteId: string }> = {
  id: 'freight_operations.adjustment_notes.cancel',
  async execute(rawInput, ctx) {
    const input = noteActionSchema.parse(rawInput)
    const scope = resolveScope(ctx)
    const em = entityManager(ctx)
    const note = await em.transactional(async (tx) => {
      const locked = await findNoteForAction(ctx, tx, scope, input.id)
      if (locked.status === 'cancelled') return locked
      if (locked.status !== 'issued') {
        return raiseFreightError(409, 'note_not_issued', 'Only issued notes can be cancelled.')
      }
      locked.status = 'cancelled'
      locked.cancelledAt = new Date()
      locked.updatedAt = new Date()
      await tx.persist(locked).flush()
      return locked
    })

    const dataEngine = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine,
      action: 'updated',
      entity: note,
      identifiers: { id: note.id, ...scope },
      actorUserId: ctx.auth?.sub ?? null,
      events: freightAdjustmentNoteEvents,
      indexer: freightAdjustmentNoteIndexer,
    })
    await emitFreightEvent('freight_operations.adjustment_note.cancelled', noteEventPayload(note, scope, 'reverse'), {
      persistent: true,
      deliverInline: false,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
    })
    return { noteId: note.id }
  },
  buildLog: ({ input, ctx }) => {
    const scope = resolveScope(ctx)
    return {
      actionLabel: 'Cancel credit/debit note',
      resourceKind: FREIGHT_ADJUSTMENT_NOTE_ENTITY_ID,
      resourceId: input.id,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
    }
  },
}

registerCommand(issueAdjustmentNoteCommand)
registerCommand(cancelAdjustmentNoteCommand)
