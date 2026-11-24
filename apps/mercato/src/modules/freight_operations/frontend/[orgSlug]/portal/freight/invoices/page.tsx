"use client"

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { PortalPageHeader } from '@open-mercato/ui/portal/components/PortalPageHeader'
import { formatFreightAmount, formatFreightDate } from '../../../../../components/freightOptions'

type Props = { params: { orgSlug: string } }

type InvoiceRow = {
  id: string
  invoiceNumber: string
  status: string | null
  issueDate: string | null
  dueDate: string | null
  currencyCode: string
  grandTotalGrossAmount: string
  paidTotalAmount: string
  outstandingAmount: string
}

function statusVariant(status: string | null): 'success' | 'warning' | 'error' | 'neutral' | 'info' {
  if (!status) return 'neutral'
  if (status === 'paid' || status === 'completed') return 'success'
  if (status === 'overdue' || status === 'cancelled' || status === 'voided') return 'error'
  if (status === 'partial' || status === 'sent') return 'warning'
  return 'info'
}

export default function PortalFreightInvoicesPage({ params }: Props) {
  const t = useT()
  const [rows, setRows] = React.useState<InvoiceRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    apiCall<{ items?: InvoiceRow[] }>('/api/portal/freight/invoices')
      .then((response) => {
        if (cancelled) return
        if (response.ok && response.result) {
          setRows(Array.isArray(response.result.items) ? response.result.items : [])
          return
        }
        setError(t('freight_operations.portal.invoices.loadError', 'Failed to load your invoices.'))
      })
      .catch(() => {
        if (!cancelled) setError(t('freight_operations.portal.invoices.loadError', 'Failed to load your invoices.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [t])

  return (
    <div className="flex flex-col gap-6">
      <PortalPageHeader
        label={t('freight_operations.portal.invoices.title', 'Invoices')}
        title={t('freight_operations.portal.invoices.heading', 'Your invoices and balances')}
      />
      <DataTable<InvoiceRow>
        title={t('freight_operations.portal.invoices.title', 'Invoices')}
        columns={[
          {
            id: 'number',
            header: t('freight_operations.portal.invoices.number', 'Invoice'),
            accessorFn: (row) => row.invoiceNumber,
          },
          {
            id: 'status',
            header: t('freight_operations.portal.invoices.status', 'Status'),
            cell: ({ row }) => (
              <StatusBadge variant={statusVariant(row.original.status)} dot>
                {row.original.status?.replaceAll('_', ' ') ?? '—'}
              </StatusBadge>
            ),
          },
          {
            id: 'issueDate',
            header: t('freight_operations.portal.invoices.issued', 'Issued'),
            accessorFn: (row) => formatFreightDate(row.issueDate),
          },
          {
            id: 'dueDate',
            header: t('freight_operations.portal.invoices.due', 'Due'),
            accessorFn: (row) => formatFreightDate(row.dueDate),
          },
          {
            id: 'gross',
            header: t('freight_operations.portal.invoices.total', 'Total'),
            accessorFn: (row) => formatFreightAmount(row.grandTotalGrossAmount, row.currencyCode),
          },
          {
            id: 'outstanding',
            header: t('freight_operations.portal.invoices.outstanding', 'Outstanding'),
            accessorFn: (row) => formatFreightAmount(row.outstandingAmount, row.currencyCode),
          },
        ]}
        data={rows}
        isLoading={loading}
        error={error ?? undefined}
        emptyState={t('freight_operations.portal.invoices.empty', 'No invoices have been issued to you yet.')}
        rowActions={() => []}
      />
    </div>
  )
}
