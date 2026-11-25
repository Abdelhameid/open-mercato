import { expect, test } from '@playwright/test'
import { apiRequest, getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { getTokenContext, readJsonSafe } from '@open-mercato/core/helpers/integration/generalFixtures'
import { createCompanyFixture } from '@open-mercato/core/helpers/integration/crmFixtures'
import {
  createRoleFixture,
  createUserFixture,
  deleteRoleIfExists,
  deleteUserIfExists,
  setRoleAclFeatures,
} from '@open-mercato/core/helpers/integration/authFixtures'
import {
  createChecklistTemplateFixture,
  createDeliveryNoteFixture,
  createFreightOrderFixture,
  createTransportDriverFixture,
  createTransportVehicleFixture,
  deleteFreightEntityIfExists,
  getChecklistRunsFixture,
  getDeliveryNoteFixture,
  runDeliveryNoteAction,
  runFreightOrderAction,
  uniqueFreightSuffix,
  uploadDriverAttachmentFixture,
} from '@open-mercato/core/helpers/integration/freightFixtures'
import {
  deleteAttachmentIfExists,
  uploadAttachmentFixture,
} from '@open-mercato/core/helpers/integration/attachmentsFixtures'

export const integrationMeta = {
  dependsOnModules: ['freight_operations', 'transport_operations', 'customers', 'auth', 'attachments'],
}

const WORK = '/api/freight_operations/driver/work'
const ACTIONS = '/api/freight_operations/driver/actions'
const ORDERS = '/api/freight_operations/orders'
const DRIVERS = '/api/transport_operations/drivers'
const VEHICLES = '/api/transport_operations/vehicles'
const COMPANIES = '/api/customers/companies'
const TEMPLATES = '/api/freight_operations/checklist-templates'
const RUNS = '/api/freight_operations/checklist-runs'
const DELIVERY_NOTES = '/api/freight_operations/delivery-notes'

const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

type WorkResponse = {
  driver: { id: string }
  checklist: {
    templateId: string
    name: string
    items: Array<{ key: string; label: string; required: boolean; requiresAttachment: boolean }>
  } | null
  orders: Array<{ id: string; status: string }>
}

type OrderRow = {
  id: string
  status: string
  pod_document_id?: string | null
  pod_signature_document_id?: string | null
}

type ChecklistRunRow = {
  id: string
  templateName: string
  status: string
  items: Array<{ key: string; checked: boolean; attachmentId?: string | null }>
}

test.describe('TC-FREIGHT-021: driver checklist and POD capture', () => {
  test('a default checklist blocks delivery until completed, records attachments, and stores the POD', async ({ request }) => {
    test.setTimeout(90_000)
    const adminToken = await getAuthToken(request)
    const { tenantId, organizationId } = getTokenContext(adminToken)
    const suffix = uniqueFreightSuffix()
    const password = `Aa1!chk${suffix.replace(/[^a-zA-Z0-9]/g, '').slice(-8)}`
    const email = `qa-checklist-${suffix}@test.local`

    let roleId: string | null = null
    let userId: string | null = null
    let company: string | null = null
    let vehicle: string | null = null
    let driver: string | null = null
    let order: string | null = null
    let templateId: string | null = null
    let noteId: string | null = null
    let checklistAttachmentId: string | null = null
    let signatureAttachmentId: string | null = null
    let noteAttachmentId: string | null = null

    try {
      roleId = await createRoleFixture(request, adminToken, {
        name: `qa-checklist-${suffix}`,
        tenantId,
      })
      await setRoleAclFeatures(request, adminToken, {
        roleId,
        features: ['freight.driver_app'],
      })
      userId = await createUserFixture(request, adminToken, {
        email,
        password,
        organizationId,
        roles: [roleId],
        name: `QA checklist driver ${suffix}`,
      })

      const template = await createChecklistTemplateFixture(request, adminToken, {
        name: `Delivery checklist ${suffix}`,
        isDefault: true,
        items: [
          { key: 'seal', label: 'Seal intact', required: true, requiresAttachment: false },
          { key: 'photo', label: 'Cargo photo', required: true, requiresAttachment: true },
        ],
      })
      templateId = template.id

      company = await createCompanyFixture(request, adminToken, `Checklist POD TC ${suffix}`)
      vehicle = await createTransportVehicleFixture(request, adminToken)
      driver = await createTransportDriverFixture(request, adminToken, { userId })
      const created = await createFreightOrderFixture(request, adminToken, {
        customerId: company,
        customerSnapshot: { id: company, kind: 'company', displayName: `Checklist POD TC ${suffix}` },
        cargoDescription: `Checklist cargo ${suffix}`,
      })
      order = created.id
      expect((await runFreightOrderAction(request, adminToken, order, 'confirm')).ok).toBeTruthy()
      expect((await runFreightOrderAction(request, adminToken, order, 'assign', {
        vehicleId: vehicle,
        driverId: driver,
      })).ok).toBeTruthy()

      const driverToken = await getAuthToken(request, email, password)
      const start = await apiRequest(request, 'POST', ACTIONS, {
        token: driverToken,
        data: { type: 'order_dispatch', orderId: order },
        retryTransport: false,
      })
      expect(start.ok(), `driver start failed with ${start.status()}`).toBeTruthy()

      const workResponse = await apiRequest(request, 'GET', WORK, { token: driverToken })
      const work = await readJsonSafe<WorkResponse>(workResponse)
      expect(workResponse.ok(), JSON.stringify(work)).toBeTruthy()
      expect(work?.checklist?.templateId).toBe(templateId)
      expect(work?.checklist?.items.map((item) => item.key)).toEqual(['seal', 'photo'])

      const missing = await apiRequest(request, 'POST', ACTIONS, {
        token: driverToken,
        data: {
          type: 'order_deliver',
          orderId: order,
          podReference: `TEMP-${suffix}`,
        },
        retryTransport: false,
      })
      expect(missing.status(), 'delivery without a checklist should be refused').toBe(409)

      const noPod = await apiRequest(request, 'POST', ACTIONS, {
        token: driverToken,
        data: { type: 'order_deliver', orderId: order },
        retryTransport: false,
      })
      expect(noPod.status(), 'delivery without any POD artifact should be refused').toBe(400)

      const incomplete = await apiRequest(request, 'POST', ACTIONS, {
        token: driverToken,
        data: {
          type: 'order_deliver',
          orderId: order,
          podReference: `TEMP-${suffix}`,
          checklist: {
            templateId,
            items: [{ key: 'seal', checked: false }],
          },
        },
        retryTransport: false,
      })
      expect(incomplete.status(), 'an unchecked required item should be refused').toBe(409)

      const missingAttachment = await apiRequest(request, 'POST', ACTIONS, {
        token: driverToken,
        data: {
          type: 'order_deliver',
          orderId: order,
          podReference: `TEMP-${suffix}`,
          checklist: {
            templateId,
            items: [
              { key: 'seal', checked: true },
              { key: 'photo', checked: true },
            ],
          },
        },
        retryTransport: false,
      })
      expect(missingAttachment.status(), 'a missing required attachment should be refused').toBe(409)

      const checklistAttachment = await uploadDriverAttachmentFixture(request, driverToken, {
        targetKind: 'order',
        targetId: order,
        fileName: 'cargo.png',
        mimeType: 'image/png',
        buffer: PNG_BYTES,
      })
      checklistAttachmentId = checklistAttachment.id
      const signature = await uploadDriverAttachmentFixture(request, driverToken, {
        targetKind: 'order',
        targetId: order,
        fileName: 'signature.png',
        mimeType: 'image/png',
        buffer: PNG_BYTES,
      })
      signatureAttachmentId = signature.id

      const deliver = await apiRequest(request, 'POST', ACTIONS, {
        token: driverToken,
        data: {
          type: 'order_deliver',
          orderId: order,
          podSignatureDocumentId: signatureAttachmentId,
          podReceivedByName: `Receiver ${suffix}`,
          checklist: {
            templateId,
            items: [
              { key: 'seal', checked: true },
              { key: 'photo', checked: true, attachmentId: checklistAttachmentId },
            ],
          },
        },
        retryTransport: false,
      })
      expect(deliver.ok(), `driver deliver failed with ${deliver.status()}: ${JSON.stringify(await readJsonSafe(deliver))}`).toBeTruthy()

      const orderResponse = await apiRequest(request, 'GET', `${ORDERS}?ids=${encodeURIComponent(order)}&pageSize=1`, { token: adminToken })
      const orderBody = await readJsonSafe<{ items?: OrderRow[] }>(orderResponse)
      const stored = orderBody?.items?.[0]
      expect(stored?.status).toBe('delivered')
      expect(stored?.pod_signature_document_id).toBe(signatureAttachmentId)

      const runs = await getChecklistRunsFixture(request, adminToken, { orderId: order })
      expect(runs).toHaveLength(1)
      const run = runs[0] as unknown as ChecklistRunRow
      expect(run.status).toBe('completed')
      expect(run.templateName).toBe(`Delivery checklist ${suffix}`)
      expect(run.items.find((item) => item.key === 'photo')?.attachmentId).toBe(checklistAttachmentId)

      const runsResponse = await apiRequest(request, 'GET', `${RUNS}?orderId=${encodeURIComponent(order)}`, { token: adminToken })
      expect(runsResponse.ok()).toBeTruthy()

      const note = await createDeliveryNoteFixture(request, adminToken, { freightOrderId: order })
      noteId = note.id
      const issued = await runDeliveryNoteAction(request, adminToken, noteId, 'issue')
      expect(issued.ok, `note issue failed with ${issued.status}: ${JSON.stringify(issued.body)}`).toBeTruthy()

      const noteAttachment = await uploadAttachmentFixture(request, adminToken, {
        entityId: 'freight_operations:freight_delivery_note',
        recordId: noteId,
        fileName: 'pod.png',
        mimeType: 'image/png',
        buffer: PNG_BYTES,
      })
      noteAttachmentId = noteAttachment.id

      const deliveredNote = await runDeliveryNoteAction(request, adminToken, noteId, 'deliver', {
        receivedByName: `Note receiver ${suffix}`,
        podDocumentId: noteAttachmentId,
      })
      expect(deliveredNote.ok, `note deliver failed with ${deliveredNote.status}: ${JSON.stringify(deliveredNote.body)}`).toBeTruthy()

      const storedNote = await getDeliveryNoteFixture(request, adminToken, noteId)
      expect(storedNote?.pod_document_id).toBe(noteAttachmentId)
    } finally {
      await deleteAttachmentIfExists(request, adminToken, noteAttachmentId)
      await deleteAttachmentIfExists(request, adminToken, signatureAttachmentId)
      await deleteAttachmentIfExists(request, adminToken, checklistAttachmentId)
      await deleteFreightEntityIfExists(request, adminToken, DELIVERY_NOTES, noteId)
      await deleteFreightEntityIfExists(request, adminToken, ORDERS, order)
      await deleteFreightEntityIfExists(request, adminToken, TEMPLATES, templateId)
      await deleteFreightEntityIfExists(request, adminToken, DRIVERS, driver)
      await deleteFreightEntityIfExists(request, adminToken, VEHICLES, vehicle)
      await deleteFreightEntityIfExists(request, adminToken, COMPANIES, company)
      await deleteUserIfExists(request, adminToken, userId)
      await deleteRoleIfExists(request, adminToken, roleId)
    }
  })
})
