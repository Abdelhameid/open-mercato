"use client"

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { PortalPageHeader } from '@open-mercato/ui/portal/components/PortalPageHeader'

type Props = { params: { orgSlug: string } }

type ContractRoute = {
  id: string
  lineNumber: number
  code: string | null
  origin: string
  destination: string
  rateBasis: string
  rateAmount: string
  minimumCharge: string | null
  currencyCode: string
}

type ContractRow = {
  id: string
  contractNumber: string
  status: string
  validFrom: string
  validTo: string
  billingCycle: string
  paymentTermsDays: number
  currencyCode: string
  requiresCustomerApproval: boolean
  routes: ContractRoute[]
}

function statusVariant(status: string): 'success' | 'warning' | 'error' | 'neutral' | 'info' {
  if (status === 'active') return 'success'
  if (status === 'suspended') return 'warning'
  if (status === 'terminated') return 'neutral'
  return 'info'
}

export default function PortalFreightContractsPage({ params }: Props) {
  const t = useT()
  const [rows, setRows] = React.useState<ContractRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    apiCall<{ items?: ContractRow[] }>('/api/portal/freight/contracts')
      .then((response) => {
        if (cancelled) return
        if (response.ok && response.result) {
          setRows(Array.isArray(response.result.items) ? response.result.items : [])
          return
        }
        setError(t('freight_operations.portal.contracts.loadError', 'Failed to load your contracts.'))
      })
      .catch(() => {
        if (!cancelled) setError(t('freight_operations.portal.contracts.loadError', 'Failed to load your contracts.'))
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
        label={t('freight_operations.portal.contracts.title', 'Contracts')}
        title={t('freight_operations.portal.contracts.heading', 'Your freight contracts and rates')}
      />
      <DataTable<ContractRow>
        title={t('freight_operations.portal.contracts.title', 'Contracts')}
        columns={[
          {
            id: 'number',
            header: t('freight_operations.portal.contracts.number', 'Contract'),
            accessorFn: (row) => row.contractNumber,
          },
          {
            id: 'status',
            header: t('freight_operations.portal.contracts.status', 'Status'),
            cell: ({ row }) => (
              <StatusBadge variant={statusVariant(row.original.status)} dot>
                {t(`freight_operations.contracts.status.${row.original.status}`, row.original.status)}
              </StatusBadge>
            ),
          },
          {
            id: 'validity',
            header: t('freight_operations.portal.contracts.validity', 'Validity'),
            accessorFn: (row) => `${row.validFrom?.slice(0, 10)} – ${row.validTo?.slice(0, 10)}`,
          },
          {
            id: 'billing',
            header: t('freight_operations.portal.contracts.billing', 'Billing'),
            accessorFn: (row) => t(`freight_operations.billing_cycles.${row.billingCycle}`, row.billingCycle),
          },
          {
            id: 'rates',
            header: t('freight_operations.portal.contracts.rates', 'Routes'),
            cell: ({ row }) => (
              <div className="flex flex-col gap-1 text-xs">
                {row.original.routes.length === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : row.original.routes.slice(0, 3).map((route) => (
                  <span key={route.id}>
                    {route.origin} → {route.destination}: {route.rateAmount} {route.currencyCode}
                  </span>
                ))}
                {row.original.routes.length > 3 ? (
                  <span className="text-muted-foreground">
                    {t('freight_operations.portal.contracts.moreRoutes', '+{count} more', { count: row.original.routes.length - 3 })}
                  </span>
                ) : null}
              </div>
            ),
          },
        ]}
        data={rows}
        isLoading={loading}
        error={error ?? undefined}
        emptyState={t('freight_operations.portal.contracts.empty', 'No contracts have been shared with you yet.')}
        rowActions={() => []}
      />
    </div>
  )
}
