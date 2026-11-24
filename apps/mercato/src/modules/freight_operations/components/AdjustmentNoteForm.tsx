"use client"

import * as React from 'react'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { ErrorMessage, RecordNotFoundState } from '@open-mercato/ui/backend/detail'
import { createCrud, fetchCrudList, updateCrud } from '@open-mercato/ui/backend/utils/crud'
import { withFlash } from '@open-mercato/ui/backend/utils/flash'
import { createCrudFormError } from '@open-mercato/ui/backend/utils/serverErrors'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { customerNameOf } from './freightOptions'
import type { AdjustmentNoteRow } from './AdjustmentNotesTable'

const ENTITY_ID = 'freight_operations:freight_adjustment_note'
const RESOURCE = 'freight_operations/adjustment-notes'
const LIST_HREF = '/backend/freight/adjustment-notes'

export type AdjustmentNoteFormValues = {
  id: string
  noteType: 'credit' | 'debit'
  orderId: string
  netAmount: string
  vatRate: string
  reason: string
  updatedAt?: string | null
}

function textOf(value: unknown): string {
  return value === null || value === undefined ? '' : String(value)
}

export function toAdjustmentNoteFormValues(row: AdjustmentNoteRow): AdjustmentNoteFormValues {
  return {
    id: row.id,
    noteType: row.note_type,
    orderId: row.order_id ?? '',
    netAmount: textOf(row.net_amount),
    vatRate: textOf(row.vat_rate) || '15',
    reason: textOf(row.reason),
    updatedAt: row.updatedAt ?? row.updated_at ?? null,
  }
}

export function buildAdjustmentNoteDefaults(id = ''): AdjustmentNoteFormValues {
  return {
    id,
    noteType: 'credit',
    orderId: '',
    netAmount: '',
    vatRate: '15',
    reason: '',
    updatedAt: null,
  }
}

export function toAdjustmentNotePayload(
  values: AdjustmentNoteFormValues,
  t: (key: string, fallback: string) => string,
): Record<string, unknown> {
  if (!values.orderId) {
    throw createCrudFormError(t('freight_operations.adjustment_notes.form.error.order', 'Choose the freight order the note belongs to.'), {
      orderId: t('freight_operations.adjustment_notes.form.error.order', 'Choose the freight order the note belongs to.'),
    })
  }
  const net = Number(values.netAmount)
  if (!Number.isFinite(net) || net < 0) {
    throw createCrudFormError(t('freight_operations.adjustment_notes.form.error.amount', 'Enter a valid net amount.'), {
      netAmount: t('freight_operations.adjustment_notes.form.error.amount', 'Enter a valid net amount.'),
    })
  }
  return {
    noteType: values.noteType,
    orderId: values.orderId,
    netAmount: String(net),
    vatRate: values.vatRate.trim().length ? Number(values.vatRate) : null,
    reason: values.reason.trim().length ? values.reason.trim() : null,
  }
}

type Translate = ReturnType<typeof useT>

function useNoteFields(t: Translate): CrudField[] {
  return React.useMemo<CrudField[]>(() => [
    {
      id: 'noteType',
      label: t('freight_operations.adjustment_notes.form.fields.noteType', 'Note type'),
      type: 'select',
      required: true,
      options: [
        { value: 'credit', label: t('freight_operations.adjustment_notes.type.credit', 'Credit note') },
        { value: 'debit', label: t('freight_operations.adjustment_notes.type.debit', 'Debit note') },
      ],
    },
    {
      id: 'orderId',
      label: t('freight_operations.adjustment_notes.form.fields.order', 'Freight order'),
      type: 'combobox',
      required: true,
      allowCustomValues: false,
      loadOptions: async (query?: string) => {
        const params: Record<string, string | number> = { pageSize: 20, sortField: 'created_at', sortDir: 'desc' }
        if (query?.trim()) params.search = query.trim()
        const data = await fetchCrudList<{ id: string; order_number: string; customer_snapshot?: Record<string, unknown> | null }>(
          'freight_operations/orders',
          params,
        )
        return (data?.items ?? []).map((order) => ({
          value: order.id,
          label: `${order.order_number} — ${customerNameOf(order.customer_snapshot)}`,
        }))
      },
    },
    {
      id: 'netAmount',
      label: t('freight_operations.adjustment_notes.form.fields.netAmount', 'Net amount'),
      type: 'number',
      required: true,
    },
    {
      id: 'vatRate',
      label: t('freight_operations.adjustment_notes.form.fields.vatRate', 'VAT rate (%)'),
      type: 'number',
    },
    {
      id: 'reason',
      label: t('freight_operations.adjustment_notes.form.fields.reason', 'Reason'),
      type: 'textarea',
      rows: 3,
    },
  ], [t])
}

function useNoteGroups(t: Translate): CrudFormGroup[] {
  return React.useMemo<CrudFormGroup[]>(() => [
    { id: 'note', title: t('freight_operations.adjustment_notes.form.groups.note'), column: 1, fields: ['noteType', 'orderId'] },
    { id: 'amounts', title: t('freight_operations.adjustment_notes.form.groups.amounts'), column: 2, fields: ['netAmount', 'vatRate'] },
    { id: 'reason', title: t('freight_operations.adjustment_notes.form.groups.reason'), column: 1, fields: ['reason'] },
  ], [t])
}

export function AdjustmentNoteCreateForm() {
  const t = useT()
  const fields = useNoteFields(t)
  const groups = useNoteGroups(t)
  const initialValues = React.useMemo(() => buildAdjustmentNoteDefaults(), [])
  const successRedirect = React.useMemo(
    () => withFlash(LIST_HREF, t('freight_operations.adjustment_notes.form.flash.saved', 'Note saved as draft.'), 'success'),
    [t],
  )

  return (
    <CrudForm<AdjustmentNoteFormValues>
      title={t('freight_operations.adjustment_notes.form.create.title', 'New credit or debit note')}
      titleHeadingLevel={1}
      backHref={LIST_HREF}
      entityId={ENTITY_ID}
      fields={fields}
      groups={groups}
      initialValues={initialValues}
      submitLabel={t('freight_operations.adjustment_notes.form.create.submit', 'Save draft')}
      cancelHref={LIST_HREF}
      successRedirect={successRedirect}
      onSubmit={async (values) => {
        await createCrud(RESOURCE, toAdjustmentNotePayload(values, t))
      }}
    />
  )
}

export function AdjustmentNoteEditForm({ id }: { id: string }) {
  const t = useT()
  const fields = useNoteFields(t)
  const groups = useNoteGroups(t)
  const [initial, setInitial] = React.useState<AdjustmentNoteFormValues | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [notFound, setNotFound] = React.useState(false)
  const [notEditable, setNotEditable] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      setNotFound(false)
      setNotEditable(false)
      try {
        const data = await fetchCrudList<AdjustmentNoteRow>(RESOURCE, { ids: String(id), pageSize: 1 })
        const item = data?.items?.[0]
        if (!item) {
          if (!cancelled) setNotFound(true)
          return
        }
        if (item.status !== 'draft') {
          if (!cancelled) setNotEditable(true)
          return
        }
        if (!cancelled) setInitial(toAdjustmentNoteFormValues(item))
      } catch (caught: unknown) {
        if (!cancelled) {
          if ((caught as { status?: number }).status === 404) {
            setNotFound(true)
          } else {
            setError(caught instanceof Error && caught.message ? caught.message : t('freight_operations.adjustment_notes.form.error.load', 'Could not load the note.'))
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [id, t])

  const successRedirect = React.useMemo(
    () => withFlash(LIST_HREF, t('freight_operations.adjustment_notes.form.flash.saved', 'Note saved as draft.'), 'success'),
    [t],
  )

  if (notFound) {
    return (
      <RecordNotFoundState
        label={t('freight_operations.adjustment_notes.form.error.notFound', 'Note not found.')}
        backHref={LIST_HREF}
        backLabel={t('freight_operations.adjustment_notes.actions.backToList', 'Back to notes')}
      />
    )
  }
  if (notEditable) return <ErrorMessage label={t('freight_operations.adjustment_notes.form.error.notEditable', 'Only draft notes can be edited.')} />
  if (error) return <ErrorMessage label={error} />

  return (
    <CrudForm<AdjustmentNoteFormValues>
      title={t('freight_operations.adjustment_notes.form.edit.title', 'Edit credit or debit note')}
      titleHeadingLevel={1}
      backHref={LIST_HREF}
      entityId={ENTITY_ID}
      fields={fields}
      groups={groups}
      initialValues={initial ?? buildAdjustmentNoteDefaults(id)}
      submitLabel={t('freight_operations.adjustment_notes.form.edit.submit', 'Save changes')}
      cancelHref={LIST_HREF}
      successRedirect={successRedirect}
      isLoading={loading}
      loadingMessage={t('freight_operations.adjustment_notes.form.loading', 'Loading note…')}
      onSubmit={async (values) => {
        await updateCrud(RESOURCE, { id, ...toAdjustmentNotePayload(values, t) })
      }}
    />
  )
}
