import type { EntityManager } from '@mikro-orm/postgresql'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import { emitCrudSideEffects } from '@open-mercato/shared/lib/commands/helpers'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { FreightTrip } from '../data/entities'
import { freightTripEvents, freightTripIndexer } from '../commands/entities'

const logger = createLogger('freight_operations').child({ subscriber: 'transport-trip-status' })

/**
 * When a freight trip is linked to a transport schedule, the transport board is
 * the dispatch authority. Mirror its lifecycle onto the freight trip so the two
 * records cannot disagree: transport `in_progress` marks the freight trip
 * dispatched, `completed` delivers it and `cancelled` cancels it. Billing state
 * is owned by freight and is never changed here.
 */

export const metadata = {
  event: 'transport_operations.trip_schedule.updated',
  persistent: true,
  id: 'freight_operations:transport-trip-status',
}

type Payload = {
  id?: string | null
  tenantId?: string | null
  organizationId?: string | null
}

type ScheduleRow = {
  status: string
  actual_start_time: Date | string | null
  actual_end_time: Date | string | null
}

function isMissingRelationError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return message.includes('42P01') || /relation .* does not exist/i.test(message)
}

function readDate(value: Date | string | null): Date | null {
  if (!value) return null
  const parsed = value instanceof Date ? value : new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export default async function handler(payload: Payload, ctx: { resolve: <T = unknown>(name: string) => T }): Promise<void> {
  const scheduleId = typeof payload?.id === 'string' ? payload.id : null
  const tenantId = typeof payload?.tenantId === 'string' ? payload.tenantId : null
  const organizationId = typeof payload?.organizationId === 'string' ? payload.organizationId : null
  if (!scheduleId || !tenantId || !organizationId) return

  const em = (ctx.resolve('em') as EntityManager).fork()
  let rows: ScheduleRow[]
  try {
    rows = await em.getConnection().execute<ScheduleRow[]>(
      `select status, actual_start_time, actual_end_time
         from transport_trip_schedules
        where id = ? and tenant_id = ? and organization_id = ? and deleted_at is null
        limit 1`,
      [scheduleId, tenantId, organizationId],
    )
  } catch (err) {
    if (isMissingRelationError(err)) return
    throw err
  }
  const schedule = rows[0]
  if (!schedule) return

  const trips = await em.find(FreightTrip, {
    transportTripId: scheduleId,
    tenantId,
    organizationId,
    deletedAt: null,
  })
  if (!trips.length) return

  const startedAt = readDate(schedule.actual_start_time)
  const endedAt = readDate(schedule.actual_end_time)
  const now = new Date()
  const updated: FreightTrip[] = []

  for (const trip of trips) {
    if (schedule.status === 'in_progress') {
      if (trip.executionStatus === 'planned') trip.executionStatus = 'dispatched'
      trip.actualStartAt = trip.actualStartAt ?? startedAt ?? now
    } else if (schedule.status === 'completed') {
      if (trip.executionStatus !== 'cancelled') trip.executionStatus = 'delivered'
      trip.actualEndAt = trip.actualEndAt ?? endedAt ?? now
    } else if (schedule.status === 'cancelled') {
      if (trip.billingStatus !== 'unbilled') {
        logger.warn('Skipped cancelling a billed freight trip from the transport board', {
          freightTripId: trip.id,
          scheduleId,
        })
        continue
      }
      trip.executionStatus = 'cancelled'
      trip.actualEndAt = trip.actualEndAt ?? endedAt ?? now
    } else {
      continue
    }
    trip.updatedAt = now
    updated.push(trip)
  }

  if (!updated.length) return
  await em.flush()

  const dataEngine = ctx.resolve('dataEngine') as DataEngine
  for (const trip of updated) {
    await emitCrudSideEffects({
      dataEngine,
      action: 'updated',
      entity: trip,
      identifiers: { id: trip.id, tenantId, organizationId },
      actorUserId: null,
      events: freightTripEvents,
      indexer: freightTripIndexer,
    })
  }
}
