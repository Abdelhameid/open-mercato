import { expect, test, type APIRequestContext } from '@playwright/test'
import { apiRequest, getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { readJsonSafe } from '@open-mercato/core/helpers/integration/generalFixtures'
import { createCompanyFixture } from '@open-mercato/core/helpers/integration/crmFixtures'
import {
  createDeliveryNoteFixture,
  createFreightOrderFixture,
  createTransportDriverFixture,
  createTransportVehicleFixture,
  deleteFreightEntityIfExists,
  isoInstant,
  runDeliveryNoteAction,
  runFreightOrderAction,
  uniqueFreightSuffix,
} from '@open-mercato/core/helpers/integration/freightFixtures'

export const integrationMeta = {
  dependsOnModules: ['freight_operations', 'customers', 'transport_operations', 'saudi_localization'],
}

const ORDERS = '/api/freight_operations/orders'
const NOTES = '/api/freight_operations/delivery-notes'
const SHARE = '/api/freight_operations/delivery-notes/share'
const PUBLIC = '/api/freight_operations/public/delivery-note'
const VAT_SETTINGS = '/api/saudi_localization/vat-settings'
const VEHICLES = '/api/transport_operations/vehicles'
const DRIVERS = '/api/transport_operations/drivers'

async function configureSeller(request: APIRequestContext, token: string, suffix: string) {
  const response = await apiRequest(request, 'PUT', VAT_SETTINGS, {
    token,
    data: {
      sellerName: `Delivery share seller ${suffix}`,
      vatRegistrationNumber: '300000000000003',
      commercialRegistrationNumber: null,
      vatRate: 0.15,
      invoiceQrEnabled: true,
      filingFrequency: 'quarterly',
    },
  })
  expect(response.ok(), `PUT ${VAT_SETTINGS} failed with ${response.status()}`).toBeTruthy()
}

/**
 * TC-FREIGHT-019: staff mint a public delivery-note link for an issued note and
 * the unauthenticated endpoint returns only the document fields a consignee
 * needs — never internal ids, prices or contact details.
 */
test.describe('TC-FREIGHT-019: public delivery-note share link', () => {
  test('a share token exposes the issued document without authentication', async ({ request }) => {
    const token = await getAuthToken(request)
    const suffix = uniqueFreightSuffix()
    const company = await createCompanyFixture(request, token, `Delivery share TC ${suffix}`)
    const snapshot = { id: company, kind: 'company' as const, displayName: `Delivery share TC ${suffix}` }

    let order: string | null = null
    let vehicle: string | null = null
    let driver: string | null = null

    try {
      await configureSeller(request, token, suffix)
      vehicle = await createTransportVehicleFixture(request, token)
      driver = await createTransportDriverFixture(request, token)

      const created = await createFreightOrderFixture(request, token, {
        customerId: company,
        customerSnapshot: snapshot,
        cargoDescription: `Share cargo ${suffix}`,
        requestedPickupAt: isoInstant(1),
        requestedDeliveryAt: isoInstant(1.5),
      })
      order = created.id
      expect((await runFreightOrderAction(request, token, order, 'confirm')).ok).toBeTruthy()
      expect((await runFreightOrderAction(request, token, order, 'assign', { vehicleId: vehicle, driverId: driver })).ok).toBeTruthy()

      const draft = await createDeliveryNoteFixture(request, token, {
        freightOrderId: order,
        consigneeName: `Share receiver ${suffix}`,
      })
      expect((await runDeliveryNoteAction(request, token, draft.id, 'issue')).ok).toBeTruthy()

      // A draft cannot be shared; an issued note can.
      const shareResponse = await apiRequest(request, 'POST', SHARE, {
        token,
        data: { id: draft.id },
        retryTransport: false,
      })
      const shareBody = await readJsonSafe<{ token?: string; path?: string }>(shareResponse)
      expect(shareResponse.ok(), JSON.stringify(shareBody)).toBeTruthy()
      expect(shareBody?.token).toBeTruthy()
      expect(shareBody?.path).toBe(`/track/note/${shareBody?.token}`)

      const publicResponse = await request.get(`${PUBLIC}?token=${encodeURIComponent(String(shareBody?.token))}`)
      const publicBody = await readJsonSafe<Record<string, unknown>>(publicResponse)
      expect(publicResponse.status(), JSON.stringify(publicBody)).toBe(200)
      expect(publicBody?.noteNumber).toBe(draft.noteNumber)
      expect(publicBody?.status).toBe('issued')
      expect(publicBody?.cargoDescription).toBe(`Share cargo ${suffix}`)
      expect(publicBody?.origin).toBe('Riyadh')
      expect(publicBody?.destination).toBe('Dammam')
      expect(publicBody?.consigneeName).toBe(`Share receiver ${suffix}`)
      expect(publicBody?.vehiclePlate).toBeTruthy()
      expect(publicBody?.driverName).toBeTruthy()
      // Internal identifiers and contact details stay out of the public payload.
      expect(publicBody?.tenant_id).toBeUndefined()
      expect(publicBody?.organization_id).toBeUndefined()
      expect(publicBody?.customer_id).toBeUndefined()
      expect(publicBody?.consigneePhone).toBeUndefined()

      const invalid = await request.get(`${PUBLIC}?token=not-a-real-token`)
      expect(invalid.status()).toBe(404)
    } finally {
      await deleteFreightEntityIfExists(request, token, ORDERS, order)
      await deleteFreightEntityIfExists(request, token, VEHICLES, vehicle)
      await deleteFreightEntityIfExists(request, token, DRIVERS, driver)
      await deleteFreightEntityIfExists(request, token, '/api/customers/companies', company)
    }
  })
})
