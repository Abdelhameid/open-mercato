import { NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { getCustomerAuthFromRequest } from '@open-mercato/core/modules/customer_accounts/lib/customerAuth'
import type { CustomerRbacService } from '@open-mercato/core/modules/customer_accounts/services/customerRbacService'
import { FreightContract, FreightContractRoute } from '../../../../data/entities'

const logger = createLogger('freight_operations')

export const metadata = {
  path: '/portal/freight/contracts',
  GET: { requireAuth: false },
}

const PORTAL_VIEW_FEATURE = 'portal.freight.view'
const VISIBLE_STATUSES = ['active', 'suspended', 'terminated'] as const

function customerIds(customerEntityId: string | null | undefined, personEntityId: string | null | undefined): string[] {
  return [customerEntityId, personEntityId].filter((id): id is string => Boolean(id))
}

/**
 * The customer's own freight contracts, including the negotiated route rates.
 * Drafts stay internal; active, suspended and terminated contracts are visible
 * so the customer can see the history and why billing changed.
 */
export async function GET(req: Request) {
  try {
    const auth = await getCustomerAuthFromRequest(req)
    if (!auth) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    if (!auth.orgId) return NextResponse.json({ error: 'Organization context is required' }, { status: 400 })
    const di = await createRequestContainer()
    const rbac = di.resolve('customerRbacService') as CustomerRbacService
    const allowed = await rbac.userHasAllFeatures(auth.sub, [PORTAL_VIEW_FEATURE], {
      tenantId: auth.tenantId,
      organizationId: auth.orgId,
    })
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const ids = customerIds(auth.customerEntityId, auth.personEntityId)
    if (!ids.length) return NextResponse.json({ items: [], total: 0 })
    const em = di.resolve('em') as EntityManager
    const scope = { tenantId: auth.tenantId, organizationId: auth.orgId }

    const contracts = await findWithDecryption(em, FreightContract, {
      ...scope,
      customerId: { $in: ids },
      status: { $in: VISIBLE_STATUSES },
      deletedAt: null,
    }, { orderBy: { validFrom: 'desc' }, limit: 100 }, scope) as FreightContract[]

    const routes = contracts.length
      ? await findWithDecryption(em, FreightContractRoute, {
          ...scope,
          contract: { $in: contracts },
          isActive: true,
          deletedAt: null,
        }, { orderBy: { lineNumber: 'asc' } }, scope) as FreightContractRoute[]
      : []
    const routesByContract = new Map<string, FreightContractRoute[]>()
    for (const route of routes) {
      const contractId = route.contract.id
      const list = routesByContract.get(contractId) ?? []
      list.push(route)
      routesByContract.set(contractId, list)
    }

    return NextResponse.json({
      items: contracts.map((contract) => ({
        id: contract.id,
        contractNumber: contract.contractNumber,
        status: contract.status,
        validFrom: contract.validFrom,
        validTo: contract.validTo,
        billingCycle: contract.billingCycle,
        paymentTermsDays: contract.paymentTermsDays,
        currencyCode: contract.currencyCode,
        requiresCustomerApproval: contract.requiresCustomerApproval,
        signedAt: contract.signedAt ?? null,
        routes: (routesByContract.get(contract.id) ?? []).map((route) => ({
          id: route.id,
          lineNumber: route.lineNumber,
          code: route.routeCodeSnapshot ?? null,
          origin: route.origin,
          destination: route.destination,
          rateBasis: route.rateBasis,
          rateAmount: route.rateAmount,
          minimumCharge: route.minimumCharge ?? null,
          currencyCode: route.currencyCode,
          includesTolls: route.includesTolls,
          includesWaiting: route.includesWaiting,
        })),
      })),
      total: contracts.length,
    })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    logger.error('freight_operations.portal_contracts.failed', { err })
    return NextResponse.json({ error: 'Failed to load contracts' }, { status: 500 })
  }
}
