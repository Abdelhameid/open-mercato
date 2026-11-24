import { applyOdometerReading, type OdometerEventPayload } from '../lib/odometerSync'

export const metadata = {
  event: 'vehicle_rentals.rental.*',
  persistent: true,
  id: 'transport_operations:odometer-from-rental',
}

export default async function handler(payload: OdometerEventPayload, ctx: { resolve: <T = unknown>(name: string) => T; tenantId?: string | null; organizationId?: string | null }): Promise<void> {
  await applyOdometerReading(payload, ctx)
}
