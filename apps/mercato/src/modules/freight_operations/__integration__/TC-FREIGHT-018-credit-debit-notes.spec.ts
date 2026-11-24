import { expect, test, type APIRequestContext } from '@playwright/test'
import { apiRequest, getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { readJsonSafe } from '@open-mercato/core/helpers/integration/generalFixtures'
import { createCompanyFixture, deleteEntityIfExists } from '@open-mercato/core/helpers/integration/crmFixtures'
import {
  createFreightOrderFixture,
  deleteFreightEntityIfExists,
  isoInstant,
  uniqueFreightSuffix,
} from '@open-mercato/core/helpers/integration/freightFixtures'

export const integrationMeta = {
  dependsOnModules: ['freight_operations', 'financial', 'customers', 'sales'],
}

const NOTES = '/api/freight_operations/adjustment-notes'
const ORDERS = '/api/freight_operations/orders'
const JOURNAL = '/api/financial/journal-entries'
const PERIODS = '/api/financial/periods'

type ListPayload = { items?: Array<Record<string, unknown>> }

async function listNotes(request: APIRequestContext, token: string, id: string): Promise<Record<string, unknown> | null> {
  const response = await apiRequest(request, 'GET', `${NOTES}?ids=${encodeURIComponent(id)}&pageSize=1`, { token })
  const payload = await readJsonSafe<ListPayload>(response)
  return payload?.items?.[0] ?? null
}

async function waitForJournalEntry(
  request: APIRequestContext,
  token: string,
  noteId: string,
  predicate: (item: Record<string, unknown>) => boolean,
): Promise<Record<string, unknown> | null> {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    const response = await apiRequest(
      request,
      'GET',
      `${JOURNAL}?sourceEntityType=freight_adjustment_note&sourceEntityId=${encodeURIComponent(noteId)}&pageSize=10`,
      { token },
    )
    const payload = await readJsonSafe<ListPayload>(response)
    const match = (payload?.items ?? []).find(predicate)
    if (match) return match
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return null
}

/**
 * Finds a document date inside an open accounting period. A note's issue date
 * defaults to today, so a tenant whose current month is not open would otherwise
 * have nothing to post against. Creates the current month's period when the
 * tenant has none — the same operation an operator performs before the first
 * posting.
 */
async function ensureTodayIsPostable(request: APIRequestContext, token: string): Promise<string> {
  const today = new Date().toISOString().slice(0, 10)
  const response = await apiRequest(request, 'GET', `${PERIODS}?status=open&pageSize=100`, { token })
  const payload = await readJsonSafe<ListPayload>(response)
  const items = payload?.items ?? []
  const covering = items.find((period) =>
    String(period.start_date ?? '') <= today && String(period.end_date ?? '') >= today)
  if (covering) return today

  const now = new Date()
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() + 1
  const pad = (value: number) => String(value).padStart(2, '0')
  const startDate = `${year}-${pad(month)}-01`
  const endDate = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
  const created = await apiRequest(request, 'POST', PERIODS, {
    token,
    data: {
      fiscalYear: year,
      periodNumber: month,
      periodName: `${year}-${pad(month)}`,
      startDate,
      endDate,
    },
  })
  expect(created.ok(), `period create failed with ${created.status()}`).toBeTruthy()
  return today
}

/**
 * TC-FREIGHT-018: a credit note reduces the ledger (revenue/VAT debit, AR
 * credit) and a cancel reverses it. The posting is driven by the freight event
 * and lands under `freight_adjustment_note` with the note id as its source.
 */
test.describe('TC-FREIGHT-018: freight credit/debit notes', () => {
  test('issues a credit note, posts it to the ledger, then reverses it', async ({ request }) => {
    const token = await getAuthToken(request)
    const suffix = uniqueFreightSuffix()
    const company = await createCompanyFixture(request, token, `Note TC ${suffix}`)
    const snapshot = { id: company, kind: 'company' as const, displayName: `Note TC ${suffix}` }

    let orderId: string | null = null
    let noteId: string | null = null

    try {
      const order = await createFreightOrderFixture(request, token, {
        customerId: company,
        customerSnapshot: snapshot,
        cargoDescription: `Note cargo ${suffix}`,
        agreedAmountNet: '1000',
        requestedPickupAt: isoInstant(1),
        requestedDeliveryAt: isoInstant(1.5),
      })
      orderId = order.id

      const postingDate = await ensureTodayIsPostable(request, token)
      const created = await apiRequest(request, 'POST', NOTES, {
        token,
        data: {
          noteType: 'credit',
          orderId,
          netAmount: '100',
          vatRate: 15,
          reason: `Damage discount ${suffix}`,
          issueDate: postingDate,
        },
      })
      const createdBody = await readJsonSafe<{ id?: string }>(created)
      expect(created.ok(), `note create failed with ${created.status()}`).toBeTruthy()
      noteId = createdBody?.id ?? null
      expect(noteId).toBeTruthy()

      const draft = await listNotes(request, token, String(noteId))
      expect(draft?.status).toBe('draft')
      expect(Number(draft?.net_amount)).toBe(100)
      expect(Number(draft?.tax_amount)).toBe(15)
      expect(Number(draft?.gross_amount)).toBe(115)

      const issued = await apiRequest(request, 'POST', `${NOTES}/issue`, { token, data: { id: noteId } })
      expect(issued.ok(), `note issue failed with ${issued.status()}`).toBeTruthy()
      const issuedNote = await listNotes(request, token, String(noteId))
      expect(issuedNote?.status).toBe('issued')
      expect(String(issuedNote?.note_number)).toMatch(/^AN-/)

      const posted = await waitForJournalEntry(request, token, String(noteId), (item) => item.entry_type === 'standard')
      expect(posted, 'the credit note did not reach the ledger').toBeTruthy()
      expect(posted?.status).toBe('posted')
      expect(posted?.source_entity_type).toBe('freight_adjustment_note')

      const cancelled = await apiRequest(request, 'POST', `${NOTES}/cancel`, { token, data: { id: noteId } })
      expect(cancelled.ok(), `note cancel failed with ${cancelled.status()}`).toBeTruthy()
      const cancelledNote = await listNotes(request, token, String(noteId))
      expect(cancelledNote?.status).toBe('cancelled')

      const reversal = await waitForJournalEntry(request, token, String(noteId), (item) => item.entry_type === 'reversing')
      expect(reversal, 'cancelling the note did not reverse its ledger entry').toBeTruthy()
    } finally {
      await deleteFreightEntityIfExists(request, token, NOTES, noteId).catch(() => undefined)
      await deleteFreightEntityIfExists(request, token, ORDERS, orderId)
      await deleteEntityIfExists(request, token, '/api/customers/companies', company).catch(() => undefined)
    }
  })
})
