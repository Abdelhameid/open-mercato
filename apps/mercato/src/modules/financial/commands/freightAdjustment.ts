import { z } from 'zod'
import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { ModuleConfigService } from '@open-mercato/core/modules/configs/lib/module-config-service'
import { registerCommand, type CommandHandler } from '@open-mercato/shared/lib/commands'
import { GlJournalEntry } from '../data/entities'
import {
  createPostedEntry,
  emitEntrySideEffects,
  lineDraftsOf,
  loadPostingAccounts,
  POSTING_SETTINGS_KEY,
  POSTING_SETTINGS_MODULE,
  reversePostedEntry,
  type PostingScope,
} from './posting'
import { PostingConfigurationError, postingLinesMatch, type PostingLineDraft, type PostingSettings } from '../lib/postingMap'
import { raiseFinancialError } from '../lib/errors'
import { roundDecimalHalfUp } from '../lib/money'

/**
 * Post a freight credit/debit note to the general ledger.
 *
 * A credit note reduces revenue, output VAT and the receivable; a debit note
 * increases them. The command is invoked by the financial module's subscriber on
 * the freight note events, never by an HTTP route. Idempotency uses the same
 * source columns and partial unique index as the sales postings, so a retried
 * event is a no-op and a cancel reverses the original entry.
 */

export const freightAdjustmentPostingSchema = z.object({
  tenantId: z.string().uuid(),
  organizationId: z.string().uuid(),
  sourceEntityId: z.string().uuid(),
  noteNumber: z.string().min(1),
  noteType: z.enum(['credit', 'debit']),
  operation: z.enum(['upsert', 'reverse']).default('upsert'),
  currencyCode: z.string().trim().length(3),
  postingDate: z.string().datetime().or(z.date()),
  netAmount: z.union([z.string(), z.number()]),
  taxAmount: z.union([z.string(), z.number()]),
  grossAmount: z.union([z.string(), z.number()]),
  description: z.string().trim().min(1).max(2000),
  actorUserId: z.string().uuid().optional().nullable(),
})

export type FreightAdjustmentPostingInput = z.infer<typeof freightAdjustmentPostingSchema>

export type FreightAdjustmentPostingResult = {
  action: 'posted' | 'reversed' | 'unchanged'
  entryId: string | null
  reversalId: string | null
}

const FREIGHT_ADJUSTMENT_SOURCE_TYPE = 'freight_adjustment_note'

function amount(value: string | number): string {
  return roundDecimalHalfUp(String(value), 2)
}

function toDate(value: string | Date): Date {
  const parsed = value instanceof Date ? value : new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

export function buildLines(
  input: FreightAdjustmentPostingInput,
  accounts: { receivable: { id: string }; revenue: { id: string }; outputVat: { id: string } },
): PostingLineDraft[] {
  const net = amount(input.netAmount)
  const tax = amount(input.taxAmount)
  const gross = amount(input.grossAmount)
  const description = input.description
  const line = (accountId: string, debitAmount: string, creditAmount: string): PostingLineDraft => ({
    accountId,
    debitAmount,
    creditAmount,
    description,
    taxCode: null,
  })

  if (input.noteType === 'credit') {
    return [
      line(accounts.revenue.id, net, '0'),
      line(accounts.outputVat.id, tax, '0'),
      line(accounts.receivable.id, '0', gross),
    ].filter((draft) => Number(draft.debitAmount) !== 0 || Number(draft.creditAmount) !== 0)
  }
  return [
    line(accounts.receivable.id, gross, '0'),
    line(accounts.revenue.id, '0', net),
    line(accounts.outputVat.id, '0', tax),
  ].filter((draft) => Number(draft.debitAmount) !== 0 || Number(draft.creditAmount) !== 0)
}

async function readPostingSettings(
  ctxContainer: { resolve: (name: string) => unknown },
  scope: PostingScope,
): Promise<PostingSettings> {
  try {
    const configService = ctxContainer.resolve('moduleConfigService') as ModuleConfigService
    return ((await configService.getValue<PostingSettings>(POSTING_SETTINGS_MODULE, POSTING_SETTINGS_KEY, {
      defaultValue: {},
      scope: { tenantId: scope.tenantId },
    })) ?? {})
  } catch {
    return {}
  }
}

const freightAdjustmentPostingCommand: CommandHandler<FreightAdjustmentPostingInput, FreightAdjustmentPostingResult> = {
  id: 'financial.freight_adjustment.post',
  async execute(rawInput, ctx) {
    const input = freightAdjustmentPostingSchema.parse(rawInput)
    const scope: PostingScope = { tenantId: input.tenantId, organizationId: input.organizationId }
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const settings = await readPostingSettings(ctx.container, scope)

    let accounts: Awaited<ReturnType<typeof loadPostingAccounts>>
    try {
      accounts = await loadPostingAccounts(em, scope, settings, null)
    } catch (error) {
      if (error instanceof PostingConfigurationError) {
        return raiseFinancialError(409, 'posting_accounts_missing')
      }
      throw error
    }

    const sourceKind = input.noteType === 'credit' ? 'credit_note' : 'debit_note'
    const lines = buildLines(input, accounts)
    if (!lines.length) return { action: 'unchanged', entryId: null, reversalId: null }

    const result = await em.transactional(async (trx) => {
      const now = new Date()
      const existing = await trx.findOne(GlJournalEntry, {
        ...scope,
        sourceEntityType: FREIGHT_ADJUSTMENT_SOURCE_TYPE,
        sourceEntityId: input.sourceEntityId,
        sourceKind,
        status: { $ne: 'reversed' },
      }, { populate: ['lines'], lockMode: LockMode.PESSIMISTIC_WRITE })

      if (input.operation === 'reverse') {
        if (!existing) return { action: 'unchanged' as const, entry: null, original: null }
        const reversal = await reversePostedEntry(trx, scope, existing, input.actorUserId ?? null, now)
        return { action: 'reversed' as const, entry: reversal, original: existing }
      }

      if (existing && postingLinesMatch(lineDraftsOf(existing), lines)) {
        return { action: 'unchanged' as const, entry: existing, original: null }
      }

      const original = existing
        ? await reversePostedEntry(trx, scope, existing, input.actorUserId ?? null, now)
        : null
      const entry = await createPostedEntry(
        trx,
        scope,
        {
          kind: sourceKind,
          currencyCode: input.currencyCode,
          postingDate: toDate(input.postingDate),
          description: input.description,
          lines,
        },
        FREIGHT_ADJUSTMENT_SOURCE_TYPE,
        input.sourceEntityId,
        input.actorUserId ?? null,
        now,
      )
      return { action: 'posted' as const, entry, original: original ? existing : null }
    })

    if (result.action !== 'unchanged' && result.entry) {
      await emitEntrySideEffects(
        ctx,
        scope,
        input.actorUserId ?? null,
        result.action,
        result.entry,
        result.original,
      )
    }

    return {
      action: result.action,
      entryId: result.entry?.id ?? null,
      reversalId: result.action === 'reversed' ? result.entry?.id ?? null : null,
    }
  },
}

registerCommand(freightAdjustmentPostingCommand)
