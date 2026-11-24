import { NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { getCustomerAuthFromRequest } from '@open-mercato/core/modules/customer_accounts/lib/customerAuth'
import type { CustomerRbacService } from '@open-mercato/core/modules/customer_accounts/services/customerRbacService'

const logger = createLogger('freight_operations')
const PORTAL_VIEW_FEATURE = 'portal.freight.view'

export const metadata = {
  path: '/portal/freight/invoices',
  GET: { requireAuth: false },
}

type InvoiceRow = {
  id: string
  invoice_number: string
  status: string | null
  issue_date: string | Date | null
  due_date: string | Date | null
  currency_code: string
  grand_total_gross_amount: string
  paid_total_amount: string
  outstanding_amount: string
}

function customerIds(customerEntityId: string | null | undefined, personEntityId: string | null | undefined): string[] {
  return [customerEntityId, personEntityId].filter((id): id is string => Boolean(id))
}

function isMissingRelationError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return message.includes('42P01') || /relation .* does not exist/i.test(message)
}

/**
 * Read-only invoice list for the signed-in customer. Sales is a peer module, so
 * this reads its tables through a scoped raw query (no cross-module ORM import)
 * and degrades to an empty list when the module is absent. Invoices carry no
 * customer column of their own — the customer is reached through the order.
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
    const placeholders = ids.map(() => '?').join(', ')
    let rows: InvoiceRow[]
    try {
      rows = await em.getConnection().execute<InvoiceRow[]>(
        `select i.id, i.invoice_number, i.status, i.issue_date, i.due_date, i.currency_code,
                i.grand_total_gross_amount, i.paid_total_amount, i.outstanding_amount
           from sales_invoices i
           join sales_orders o on o.id = i.order_id
          where i.tenant_id = ? and i.organization_id = ?
            and o.customer_entity_id in (${placeholders})
            and i.deleted_at is null
          order by coalesce(i.issue_date, i.created_at::date) desc, i.created_at desc
          limit 100`,
        [auth.tenantId, auth.orgId, ...ids],
      )
    } catch (err) {
      if (isMissingRelationError(err)) return NextResponse.json({ items: [], total: 0 })
      throw err
    }
    return NextResponse.json({
      items: rows.map((row) => ({
        id: row.id,
        invoiceNumber: row.invoice_number,
        status: row.status,
        issueDate: row.issue_date,
        dueDate: row.due_date,
        currencyCode: row.currency_code,
        grandTotalGrossAmount: row.grand_total_gross_amount,
        paidTotalAmount: row.paid_total_amount,
        outstandingAmount: row.outstanding_amount,
      })),
      total: rows.length,
    })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    logger.error('freight_operations.portal_invoices.failed', { err })
    return NextResponse.json({ error: 'Failed to load invoices' }, { status: 500 })
  }
}
