import type { AwilixContainer } from 'awilix'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { createLogger } from '@open-mercato/shared/lib/logger'

const logger = createLogger('financial').child({ subscriber: 'freight-adjustment-posting' })

/**
 * Posts freight credit/debit notes into the general ledger.
 *
 * The freight module owns the note and emits `adjustment_note.issued` /
 * `.cancelled`; this subscriber owns the accounting glue. The event carries the
 * amounts, so no cross-module read is needed. A 4xx is a configuration/data gap
 * that a retry cannot fix (the persistent subscription would retry forever), so
 * it is logged and swallowed; a 5xx is rethrown for retry.
 */

export const metadata = {
  event: 'freight_operations.adjustment_note.*',
  persistent: true,
  id: 'financial:freight-adjustment-posting',
}

type ResolverContext = {
  resolve: <T = unknown>(name: string) => T
  container?: { resolve: <T = unknown>(name: string) => T }
  tenantId?: string | null
  organizationId?: string | null
  eventName?: string | null
}

type Payload = Record<string, unknown>

function readString(record: Payload, key: string): string | null {
  const value = record[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function resolveContainer(ctx: ResolverContext) {
  return ctx.container ?? { resolve: ctx.resolve }
}

function commandContext(container: ReturnType<typeof resolveContainer>, organizationId: string): CommandRuntimeContext {
  return {
    container: container as unknown as AwilixContainer,
    auth: null,
    organizationScope: null,
    selectedOrganizationId: organizationId,
    organizationIds: [organizationId],
  }
}

export default async function handler(rawPayload: unknown, ctx: ResolverContext): Promise<void> {
  const eventName = ctx.eventName ?? ''
  if (!eventName.endsWith('.issued') && !eventName.endsWith('.cancelled')) return

  const payload = rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)
    ? rawPayload as Payload
    : {}
  const sourceEntityId = readString(payload, 'id')
  const tenantId = readString(payload, 'tenantId') ?? ctx.tenantId ?? null
  const organizationId = readString(payload, 'organizationId') ?? ctx.organizationId ?? null
  const noteType = readString(payload, 'noteType')
  const noteNumber = readString(payload, 'noteNumber')
  const currencyCode = readString(payload, 'currencyCode')
  const issueDate = readString(payload, 'issueDate')
  const description = readString(payload, 'description')
  const netAmount = readString(payload, 'netAmount')
  const taxAmount = readString(payload, 'taxAmount')
  const grossAmount = readString(payload, 'grossAmount')
  if (
    !sourceEntityId || !tenantId || !organizationId || !noteType || !noteNumber ||
    !currencyCode || !issueDate || !description || !netAmount || !taxAmount || !grossAmount ||
    (noteType !== 'credit' && noteType !== 'debit')
  ) {
    logger.warn('financial.freight_adjustment.skipped_payload', { eventName, payload })
    return
  }

  const container = resolveContainer(ctx)
  const commandBus = container.resolve<CommandBus>('commandBus')
  try {
    await commandBus.execute('financial.freight_adjustment.post', {
      input: {
        tenantId,
        organizationId,
        sourceEntityId,
        noteNumber,
        noteType,
        operation: eventName.endsWith('.cancelled') ? 'reverse' : 'upsert',
        currencyCode,
        postingDate: issueDate,
        netAmount,
        taxAmount,
        grossAmount,
        description,
      },
      ctx: commandContext(container, organizationId),
    })
  } catch (err) {
    logger.error('financial.freight_adjustment.failed', {
      err,
      errorName: err instanceof Error ? err.name : typeof err,
      errorMessage: err instanceof Error ? err.message : String(err),
      errorStack: err instanceof Error ? err.stack : undefined,
      sourceEntityId,
      eventName,
    })
    if (isCrudHttpError(err) && err.status < 500) return
    throw err
  }
}
