import { applyOdometerReading, type OdometerEventPayload } from '../lib/odometerSync'

export const metadata = {
  event: 'fleet_operations.work_order.completed',
  persistent: true,
  id: 'transport_operations:odometer-from-work-order',
}

export default async function handler(payload: OdometerEventPayload, ctx: { resolve: <T = unknown>(name: string) => T; tenantId?: string | null; organizationId?: string | null }): Promise<void> {
  await applyOdometerReading(payload, ctx)
}
