"use client"

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Printer } from 'lucide-react'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Button } from '@open-mercato/ui/primitives/button'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { ErrorMessage, RecordNotFoundState } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { customerNameOf, formatFreightAmount, formatFreightDate } from './freightOptions'

type PaymentRow = {
  id: string
  receipt_number?: string | null
  order_id?: string | null
  abstract_id?: string | null
  customer_id: string
  currency_code: string
  amount: string
  method: string
  reference?: string | null
  received_at: string
  status: string
  voided_at?: string | null
  void_reason?: string | null
}

type VatSettings = {
  sellerName?: string
  vatRegistrationNumber?: string
}

type OrderRow = {
  id: string
  order_number?: string | null
  customer_snapshot?: Record<string, unknown> | null
}

type AbstractRow = {
  id: string
  abstract_number?: string | null
  customer_snapshot?: Record<string, unknown> | null
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground">{value}</dd>
    </div>
  )
}

export default function FreightPaymentReceipt({ id }: { id: string }) {
  const t = useT()
  const paymentQuery = useQuery({
    queryKey: ['freight-payment-receipt', id],
    queryFn: async () => {
      const call = await apiCall<{ items?: PaymentRow[] }>(`/api/freight_operations/payments?id=${encodeURIComponent(id)}&pageSize=1`)
      return { ok: call.ok, status: call.response.status, row: call.result?.items?.[0] ?? null }
    },
  })
  const payment = paymentQuery.data?.row ?? null

  const vatQuery = useQuery({
    queryKey: ['freight-receipt-vat-settings'],
    queryFn: async () => {
      const call = await apiCall<VatSettings>('/api/saudi_localization/vat-settings')
      return call.ok ? call.result : null
    },
    staleTime: 5 * 60 * 1000,
  })

  const orderQuery = useQuery({
    queryKey: ['freight-receipt-order', payment?.order_id],
    enabled: Boolean(payment?.order_id),
    queryFn: async () => {
      const call = await apiCall<{ items?: OrderRow[] }>(
        `/api/freight_operations/orders?ids=${encodeURIComponent(String(payment?.order_id))}&pageSize=1`,
      )
      return call.ok ? call.result?.items?.[0] ?? null : null
    },
  })

  const abstractQuery = useQuery({
    queryKey: ['freight-receipt-abstract', payment?.abstract_id],
    enabled: Boolean(payment?.abstract_id),
    queryFn: async () => {
      const call = await apiCall<{ items?: AbstractRow[] }>(
        `/api/freight_operations/abstracts?ids=${encodeURIComponent(String(payment?.abstract_id))}&pageSize=1`,
      )
      return call.ok ? call.result?.items?.[0] ?? null : null
    },
  })

  if (paymentQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Spinner className="size-4" />
        {t('common.loading', 'Loading…')}
      </div>
    )
  }
  if (paymentQuery.isError || (paymentQuery.data && !paymentQuery.data.ok && paymentQuery.data.status !== 404)) {
    return <ErrorMessage label={t('freight_operations.payments.receipt.loadError', 'Unable to load the payment.')} />
  }
  if (!payment) {
    return (
      <RecordNotFoundState
        label={t('freight_operations.payments.receipt.notFound', 'Payment not found.')}
        backHref="/backend/freight"
        backLabel={t('freight_operations.payments.receipt.back', 'Back to freight')}
      />
    )
  }

  const reference = orderQuery.data?.order_number ?? abstractQuery.data?.abstract_number ?? null
  const customerName = customerNameOf(
    orderQuery.data?.customer_snapshot ?? abstractQuery.data?.customer_snapshot,
    '',
  )

  return (
    <div className="mx-auto w-full max-w-2xl p-4 sm:p-6">
      <div className="no-print mb-4 flex justify-end">
        <Button type="button" variant="outline" onClick={() => window.print()}>
          <Printer aria-hidden className="me-2 size-4" />
          {t('freight_operations.payments.receipt.print', 'Print')}
        </Button>
      </div>

      <article className="rounded-lg border border-border bg-card p-6 print:border-0">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
          <div>
            <p className="text-lg font-semibold text-foreground">
              {vatQuery.data?.sellerName ?? t('freight_operations.payments.receipt.sellerFallback', 'Payment receipt')}
            </p>
            {vatQuery.data?.vatRegistrationNumber ? (
              <p className="text-xs text-muted-foreground">
                {t('freight_operations.payments.receipt.vatNumber', 'VAT')}: {vatQuery.data.vatRegistrationNumber}
              </p>
            ) : null}
          </div>
          <div className="text-end">
            <p className="text-sm font-semibold text-foreground">
              {t('freight_operations.payments.receipt.title', 'Payment receipt')}
            </p>
            <p className="font-mono text-sm text-foreground">{payment.receipt_number ?? '—'}</p>
            <Badge variant={payment.status === 'recorded' ? 'success' : 'error'}>{payment.status}</Badge>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t('freight_operations.payments.receipt.customer', 'Customer')} value={customerName || '—'} />
          <Field label={t('freight_operations.payments.receipt.reference', 'Reference')} value={reference} />
          <Field label={t('freight_operations.payments.receipt.receivedAt', 'Received')} value={formatFreightDate(payment.received_at)} />
          <Field label={t('freight_operations.payments.receipt.method', 'Method')} value={payment.method.replaceAll('_', ' ')} />
          <Field label={t('freight_operations.payments.receipt.referenceNumber', 'Payment reference')} value={payment.reference} />
          <Field
            label={t('freight_operations.payments.receipt.amount', 'Amount received')}
            value={<span className="text-base font-semibold">{formatFreightAmount(payment.amount, payment.currency_code)}</span>}
          />
        </dl>

        {payment.status !== 'recorded' ? (
          <div className="mt-5 rounded-md border border-status-error-border bg-status-error-bg p-3 text-sm text-status-error-text">
            <p className="font-medium">
              {t('freight_operations.payments.receipt.voided', 'This payment was voided.')}
            </p>
            {payment.void_reason ? <p className="mt-1">{payment.void_reason}</p> : null}
            {payment.voided_at ? <p className="mt-1 text-xs">{formatFreightDate(payment.voided_at)}</p> : null}
          </div>
        ) : null}

        <div className="mt-8 grid grid-cols-2 gap-8 text-xs text-muted-foreground">
          <div className="border-t border-border pt-2">{t('freight_operations.payments.receipt.signature', 'Received by')}</div>
          <div className="border-t border-border pt-2">{t('freight_operations.payments.receipt.stamp', 'Stamp')}</div>
        </div>
      </article>
    </div>
  )
}
