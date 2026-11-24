"use client"

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Printer } from 'lucide-react'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Button } from '@open-mercato/ui/primitives/button'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { formatFreightDate } from './freightOptions'

type PublicDeliveryNote = {
  noteNumber: string
  status: string
  sellerName?: string | null
  customerName?: string | null
  consigneeName?: string | null
  orderNumber?: string | null
  tripNumber?: string | null
  origin: string
  destination: string
  cargoDescription: string
  cargoQuantity?: string | null
  cargoUnit?: string | null
  cargoWeightKg?: string | null
  cargoVolumeM3?: string | null
  cargoHazardous: boolean
  cargoRefrigerated: boolean
  sealNumber?: string | null
  driverName?: string | null
  vehiclePlate?: string | null
  issuedAt?: string | null
  deliveredAt?: string | null
  receivedByName?: string | null
  podReference?: string | null
  updatedAt?: string | null
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

export default function PublicDeliveryNoteView({ token }: { token: string }) {
  const t = useT()
  const query = useQuery({
    queryKey: ['public-delivery-note', token],
    queryFn: async () => {
      const call = await apiCall<PublicDeliveryNote>(
        `/api/freight_operations/public/delivery-note?token=${encodeURIComponent(token)}`,
      )
      return { ok: call.ok, status: call.response.status, data: call.result }
    },
  })

  const result = query.data
  const notFound = result && !result.ok && result.status === 404

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 bg-background p-4 sm:p-8">
      <header className="no-print flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            {t('freight_operations.public_delivery_note.brand', 'Delivery document')}
          </p>
          <h1 className="text-2xl font-semibold text-foreground">
            {t('freight_operations.public_delivery_note.title', 'Delivery note')}
          </h1>
        </div>
        {result?.ok && result.data ? (
          <Button type="button" variant="outline" onClick={() => window.print()}>
            <Printer aria-hidden className="me-2 size-4" />
            {t('freight_operations.public_delivery_note.print', 'Print')}
          </Button>
        ) : null}
      </header>

      {query.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          {t('common.loading', 'Loading…')}
        </div>
      ) : query.isError || (result && !result.ok && !notFound) ? (
        <p className="text-sm text-status-error-text">
          {t('freight_operations.public_delivery_note.loadError', 'Unable to load the document.')}
        </p>
      ) : notFound || !result?.data ? (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-foreground">
            {t('freight_operations.public_delivery_note.notFound', 'This document link is invalid or has expired.')}
          </p>
        </div>
      ) : (
        <article className="rounded-lg border border-border bg-card p-5 print:border-0 print:shadow-none">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
            <div>
              <p className="text-lg font-semibold text-foreground">{result.data.sellerName ?? '—'}</p>
              <p className="text-xs text-muted-foreground">
                {t('freight_operations.public_delivery_note.number', 'Delivery note')} {result.data.noteNumber}
              </p>
            </div>
            <Badge variant="secondary">{result.data.status.replaceAll('_', ' ')}</Badge>
          </div>

          <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t('freight_operations.public_delivery_note.consignee', 'Consignee')} value={result.data.consigneeName ?? result.data.customerName} />
            <Field
              label={t('freight_operations.public_delivery_note.reference', 'Reference')}
              value={[result.data.orderNumber, result.data.tripNumber].filter(Boolean).join(' · ')}
            />
            <Field label={t('freight_operations.public_delivery_note.origin', 'Origin')} value={result.data.origin} />
            <Field label={t('freight_operations.public_delivery_note.destination', 'Destination')} value={result.data.destination} />
            <Field label={t('freight_operations.public_delivery_note.issued', 'Issued')} value={formatFreightDate(result.data.issuedAt)} />
            <Field label={t('freight_operations.public_delivery_note.delivered', 'Delivered')} value={formatFreightDate(result.data.deliveredAt)} />
          </dl>

          <div className="mt-5 border-t border-border pt-4">
            <h2 className="text-sm font-semibold text-foreground">{t('freight_operations.public_delivery_note.cargo', 'Cargo')}</h2>
            <p className="mt-1 text-sm text-foreground">{result.data.cargoDescription}</p>
            <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field
                label={t('freight_operations.public_delivery_note.quantity', 'Quantity')}
                value={[result.data.cargoQuantity, result.data.cargoUnit].filter(Boolean).join(' ')}
              />
              <Field label={t('freight_operations.public_delivery_note.weight', 'Weight (kg)')} value={result.data.cargoWeightKg} />
              <Field label={t('freight_operations.public_delivery_note.volume', 'Volume (m³)')} value={result.data.cargoVolumeM3} />
              <Field label={t('freight_operations.public_delivery_note.seal', 'Seal')} value={result.data.sealNumber} />
            </dl>
            {result.data.cargoHazardous ? (
              <p className="mt-2 text-xs font-medium text-status-warning-text">
                {t('freight_operations.public_delivery_note.hazardous', 'Hazardous cargo')}
              </p>
            ) : null}
            {result.data.cargoRefrigerated ? (
              <p className="mt-1 text-xs font-medium text-status-info-text">
                {t('freight_operations.public_delivery_note.refrigerated', 'Refrigerated cargo')}
              </p>
            ) : null}
          </div>

          <div className="mt-5 border-t border-border pt-4">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t('freight_operations.public_delivery_note.driver', 'Driver')} value={result.data.driverName} />
              <Field label={t('freight_operations.public_delivery_note.vehicle', 'Vehicle')} value={result.data.vehiclePlate} />
              <Field label={t('freight_operations.public_delivery_note.receivedBy', 'Received by')} value={result.data.receivedByName} />
              <Field label={t('freight_operations.public_delivery_note.pod', 'POD reference')} value={result.data.podReference} />
            </dl>
          </div>
        </article>
      )}
    </main>
  )
}
