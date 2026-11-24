import type { EntityManager } from '@mikro-orm/postgresql'
import { emitCrudSideEffects } from '@open-mercato/shared/lib/commands/helpers'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import { transportVehicleEvents, transportVehicleIndexer } from '../commands/transport'

/**
 * The vehicle register (`transport_vehicles.current_odometer`) is the single
 * odometer master. Consumers (rentals, fuel logs, work orders) emit the reading
 * they observed; this module — the owner — advances the register monotonically.
 * A lower late-arriving reading can never roll the register back.
 */

export type OdometerEventPayload = {
  id?: string | null
  tenantId?: string | null
  organizationId?: string | null
  vehicleId?: string | null
  odometer?: number | string | null
}

type SubscriberContext = {
  resolve: <T = unknown>(name: string) => T
  tenantId?: string | null
  organizationId?: string | null
}

function isMissingRelationError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return message.includes('42P01') || /relation .* does not exist/i.test(message)
}

export async function applyOdometerReading(
  payload: OdometerEventPayload,
  ctx: SubscriberContext,
): Promise<void> {
  const vehicleId = typeof payload?.vehicleId === 'string' ? payload.vehicleId : null
  const tenantId = typeof payload?.tenantId === 'string' ? payload.tenantId : ctx.tenantId ?? null
  const organizationId = typeof payload?.organizationId === 'string' ? payload.organizationId : ctx.organizationId ?? null
  const reading = Number(payload?.odometer)
  if (!vehicleId || !tenantId || !organizationId) return
  if (!Number.isFinite(reading) || reading < 0) return

  const em = (ctx.resolve('em') as EntityManager).fork()
  const now = new Date()
  try {
    await em.getConnection().execute(
      `update transport_vehicles
          set current_odometer = greatest(coalesce(current_odometer, 0), ?), updated_at = ?
        where id = ? and tenant_id = ? and organization_id = ? and deleted_at is null`,
      [Math.trunc(reading), now, vehicleId, tenantId, organizationId],
    )
  } catch (err) {
    if (isMissingRelationError(err)) return
    throw err
  }

  // A raw register update bypasses the CRUD side effects, so refresh the index
  // and the list caches the vehicle screens read.
  try {
    const dataEngine = ctx.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine,
      action: 'updated',
      entity: { id: vehicleId, tenantId, organizationId, updatedAt: now } as never,
      identifiers: { id: vehicleId, tenantId, organizationId },
      actorUserId: null,
      events: transportVehicleEvents,
      indexer: transportVehicleIndexer,
    })
  } catch {
    // Best effort: the reading is stored; a missed cache refresh must not fail the event.
  }
}
