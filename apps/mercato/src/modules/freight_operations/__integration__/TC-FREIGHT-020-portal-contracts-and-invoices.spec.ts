import { expect, test } from '@playwright/test'
import { apiRequest, getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { getTokenContext, readJsonSafe } from '@open-mercato/core/helpers/integration/generalFixtures'
import {
  createCustomerCompanyFixture,
  createCustomerRoleFixture,
  createCustomerUserFixture,
  deleteCustomerCompanyFixture,
  deleteCustomerRoleFixture,
  deleteCustomerUserFixture,
  portalCookieHeaders,
  portalLogin,
} from '@open-mercato/core/helpers/integration/customerAccountsFixtures'
import {
  activateFreightContractFixture,
  createFreightContractFixture,
  createFreightContractRouteFixture,
  deleteFreightEntityIfExists,
  uniqueFreightSuffix,
} from '@open-mercato/core/helpers/integration/freightFixtures'

export const integrationMeta = {
  dependsOnModules: ['freight_operations', 'customers', 'customer_accounts', 'sales'],
}

const PORTAL_CONTRACTS = '/api/portal/freight/contracts'
const PORTAL_INVOICES = '/api/portal/freight/invoices'
const CONTRACTS = '/api/freight_operations/contracts'
const CONTRACT_ROUTES = '/api/freight_operations/contract-routes'
const SALES_ORDERS = '/api/sales/orders'
const SALES_INVOICES = '/api/sales/invoices'

type PortalContract = {
  id: string
  contractNumber: string
  status: string
  routes: Array<{ origin: string; destination: string; rateAmount: string }>
}

type PortalInvoice = {
  id: string
  invoiceNumber: string
  grandTotalGrossAmount: string
  outstandingAmount: string
}

type CreatedDocument = { orderId?: string; id?: string; invoiceId?: string }

/**
 * TC-FREIGHT-020: the signed-in portal customer sees the freight contracts
 * shared with them and the sales invoices raised for their company, while a
 * portal user without the freight feature gets a 403 from both endpoints.
 */
test.describe('TC-FREIGHT-020: portal freight contracts and invoices', () => {
  test('a customer reads only their own contracts and invoices', async ({ request }) => {
    test.setTimeout(90_000)
    const adminToken = await getAuthToken(request)
    const { tenantId } = getTokenContext(adminToken)
    const suffix = uniqueFreightSuffix()

    const roleIds: string[] = []
    const userIds: string[] = []
    let companyId: string | null = null
    let contractId: string | null = null
    let routeId: string | null = null
    let salesOrderId: string | null = null
    let salesInvoiceId: string | null = null

    try {
      const viewRole = await createCustomerRoleFixture(request, adminToken, {
        features: ['portal.freight.view'],
      })
      roleIds.push(viewRole.id)
      const noViewRole = await createCustomerRoleFixture(request, adminToken, { features: [] })
      roleIds.push(noViewRole.id)

      companyId = await createCustomerCompanyFixture(request, adminToken, `Portal contracts TC ${suffix}`)
      const viewUser = await createCustomerUserFixture(request, adminToken, {
        roleIds: [viewRole.id],
        customerEntityId: companyId,
      })
      userIds.push(viewUser.id)
      const noViewUser = await createCustomerUserFixture(request, adminToken, {
        roleIds: [noViewRole.id],
        customerEntityId: companyId,
      })
      userIds.push(noViewUser.id)

      const contract = await createFreightContractFixture(request, adminToken, {
        customerId: companyId,
        customerSnapshot: { id: companyId, kind: 'company', displayName: `Portal contracts TC ${suffix}` },
        paymentTermsDays: 30,
      })
      contractId = contract.id
      routeId = await createFreightContractRouteFixture(request, adminToken, contract.id, {
        origin: 'Riyadh',
        destination: 'Dammam',
        rateAmount: '450',
      })
      await activateFreightContractFixture(request, adminToken, contract.id)

      const line = {
        kind: 'service',
        name: `Freight invoice ${suffix}`,
        quantity: 1,
        currencyCode: 'SAR',
        unitPriceNet: 1000,
        unitPriceGross: 1150,
        taxRate: 15,
        taxAmount: 150,
        totalNetAmount: 1000,
        totalGrossAmount: 1150,
      }
      const totals = {
        subtotalNetAmount: 1000,
        subtotalGrossAmount: 1150,
        taxTotalAmount: 150,
        grandTotalNetAmount: 1000,
        grandTotalGrossAmount: 1150,
        outstandingAmount: 1150,
      }
      const orderResponse = await apiRequest(request, 'POST', SALES_ORDERS, {
        token: adminToken,
        data: {
          customerEntityId: companyId,
          customerSnapshot: { displayName: `Portal contracts TC ${suffix}` },
          currencyCode: 'SAR',
          lines: [line],
          ...totals,
        },
        retryTransport: false,
      })
      const orderBody = await readJsonSafe<CreatedDocument>(orderResponse)
      expect(orderResponse.ok(), JSON.stringify(orderBody)).toBeTruthy()
      salesOrderId = orderBody?.orderId ?? orderBody?.id ?? null
      expect(salesOrderId).toBeTruthy()

      const invoiceResponse = await apiRequest(request, 'POST', SALES_INVOICES, {
        token: adminToken,
        data: {
          orderId: salesOrderId,
          currencyCode: 'SAR',
          issueDate: new Date().toISOString().slice(0, 10),
          lines: [line],
          ...totals,
        },
        retryTransport: false,
      })
      const invoiceBody = await readJsonSafe<CreatedDocument>(invoiceResponse)
      expect(invoiceResponse.ok(), JSON.stringify(invoiceBody)).toBeTruthy()
      salesInvoiceId = invoiceBody?.invoiceId ?? invoiceBody?.id ?? null
      expect(salesInvoiceId).toBeTruthy()

      const session = await portalLogin(request, {
        email: viewUser.email,
        password: viewUser.password,
        tenantId,
      })

      const contractsResponse = await request.get(PORTAL_CONTRACTS, { headers: portalCookieHeaders(session) })
      const contractsBody = await readJsonSafe<{ items?: PortalContract[] }>(contractsResponse)
      expect(contractsResponse.status(), JSON.stringify(contractsBody)).toBe(200)
      const contractRow = contractsBody?.items?.find((row) => row.id === contractId)
      expect(contractRow, 'the shared contract must be visible').toBeTruthy()
      expect(contractRow?.contractNumber).toBe(contract.contractNumber)
      expect(contractRow?.status).toBe('active')
      const routeRow = contractRow?.routes.find((row) => row.origin === 'Riyadh' && row.destination === 'Dammam')
      expect(routeRow?.rateAmount, 'the negotiated rate must be visible').toBe('450.0000')

      const invoicesResponse = await request.get(PORTAL_INVOICES, { headers: portalCookieHeaders(session) })
      const invoicesBody = await readJsonSafe<{ items?: PortalInvoice[] }>(invoicesResponse)
      expect(invoicesResponse.status(), JSON.stringify(invoicesBody)).toBe(200)
      const invoiceRow = invoicesBody?.items?.find((row) => row.id === salesInvoiceId)
      expect(invoiceRow, 'the invoice raised for the company must be visible').toBeTruthy()
      expect(Number(invoiceRow?.grandTotalGrossAmount)).toBeCloseTo(1150, 2)
      expect(Number(invoiceRow?.outstandingAmount)).toBeCloseTo(1150, 2)

      const deniedSession = await portalLogin(request, {
        email: noViewUser.email,
        password: noViewUser.password,
        tenantId,
      })
      const deniedContracts = await request.get(PORTAL_CONTRACTS, { headers: portalCookieHeaders(deniedSession) })
      expect(deniedContracts.status()).toBe(403)
      const deniedInvoices = await request.get(PORTAL_INVOICES, { headers: portalCookieHeaders(deniedSession) })
      expect(deniedInvoices.status()).toBe(403)
    } finally {
      await deleteFreightEntityIfExists(request, adminToken, SALES_INVOICES, salesInvoiceId)
      await deleteFreightEntityIfExists(request, adminToken, SALES_ORDERS, salesOrderId)
      await deleteFreightEntityIfExists(request, adminToken, CONTRACT_ROUTES, routeId)
      await deleteFreightEntityIfExists(request, adminToken, CONTRACTS, contractId)
      for (const userId of userIds) {
        await deleteCustomerUserFixture(request, adminToken, userId)
      }
      for (const roleId of roleIds) {
        await deleteCustomerRoleFixture(request, adminToken, roleId)
      }
      await deleteCustomerCompanyFixture(request, adminToken, companyId)
    }
  })
})
