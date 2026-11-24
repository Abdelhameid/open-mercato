"use client"

import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import type { SortingState } from '@tanstack/react-table'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import type { FilterValues } from '@open-mercato/ui/backend/FilterBar'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Button } from '@open-mercato/ui/primitives/button'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { apiCallOrThrow, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { useDirection, useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { customerNameOf, formatFreightAmount, formatFreightDate } from './freightOptions'

export const RESOURCE = 'freight_operations/adjustment-notes'
export const CREATE_HREF = '/backend/freight/adjustment-notes/create'
export const editHref = (id: string) => `/backend/freight/adjustment-notes/${id}/edit`
export const ENTITY_ID = 'freight_operations:freight_adjustment_note'

const CONTEXT_ID = 'freight_operations.adjustment_notes.list'

const TYPE_VALUES = ['credit', 'debit'] as const
const STATUS_VALUES = ['draft', 'issued', 'cancelled'] as const

const TYPE_FALLBACKS: Record<(typeof TYPE_VALUES)[number], string> = {
  credit: 'Credit note',
  debit: 'Debit note',
}

const STATUS_FALLBACKS: Record<(typeof STATUS_VALUES)[number], string> = {
  draft: 'Draft',
  issued: 'Issued',
  cancelled: 'Cancelled',
}

export type AdjustmentNoteRow = {
  id: string
  note_number: string
  note_type: (typeof TYPE_VALUES)[number]
  status: (typeof STATUS_VALUES)[number]
  order_id?: string | null
  customer_id: string
  customer_snapshot?: Record<string, unknown> | null
  currency_code: string
  net_amount: string
  tax_amount: string
  gross_amount: string
  vat_rate?: string | null
  reason?: string | null
  issue_date?: string | null
  issued_at?: string | null
  cancelled_at?: string | null
  updated_at?: string | null
  updatedAt?: string | null
}

export default function AdjustmentNotesTable() {
  const t = useT()
  const direction = useDirection()
  const scopeVersion = useOrganizationScopeVersion()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [values, setValues] = React.useState<FilterValues>({})
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'created_at', desc: true }])
  const [page, setPage] = React.useState(1)

  const { runMutation, retryLastMutation } = useGuardedMutation<{
    formId: string
    resourceKind: string
    resourceId?: string
    retryLastMutation: () => Promise<boolean>
  }>({
    contextId: CONTEXT_ID,
    blockedMessage: t('ui.forms.flash.saveBlocked', 'Save blocked by validation'),
  })

  const typeFilter = typeof values.noteType === 'string' ? values.noteType : undefined
  const statusFilter = typeof values.status === 'string' ? values.status : undefined
  const searchValue = typeof values.q === 'string' ? values.q : undefined

  const params = React.useMemo(() => {
    const out: Record<string, string | number> = {
      page,
      pageSize: 50,
      sortField: sorting[0]?.id ?? 'created_at',
      sortDir: sorting[0]?.desc ? 'desc' : 'asc',
    }
    if (typeFilter) out.noteType = typeFilter
    if (statusFilter) out.status = statusFilter
    if (searchValue?.trim()) out.search = searchValue.trim()
    return out
  }, [page, searchValue, sorting, statusFilter, typeFilter])

  const query = useQuery({
    queryKey: ['freight-adjustment-notes', params, scopeVersion],
    queryFn: () => fetchCrudList<AdjustmentNoteRow>(RESOURCE, params),
  })

  const runAction = React.useCallback(async (note: AdjustmentNoteRow, action: 'issue' | 'cancel') => {
    if (action === 'cancel') {
      const confirmed = await confirm({
        title: t('freight_operations.adjustment_notes.cancel.confirm', 'Cancel note {number} and reverse its posting?', {
          number: note.note_number,
        }),
      })
      if (!confirmed) return
    }
    try {
      await runMutation<Awaited<ReturnType<typeof apiCallOrThrow>>>({
        operation: () => withScopedApiRequestHeaders(
          buildOptimisticLockHeader(note.updatedAt ?? note.updated_at ?? null),
          () => apiCallOrThrow(`/api/${RESOURCE}/${action}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: note.id }),
          }, {
            errorMessage: t('freight_operations.adjustment_notes.action.error', 'Unable to change the note.'),
          }),
        ),
        mutationPayload: { operation: `adjustment_notes.${action}`, noteId: note.id, updatedAt: note.updatedAt ?? null },
        context: { formId: CONTEXT_ID, resourceKind: ENTITY_ID, resourceId: note.id, retryLastMutation },
      })
      flash(
        action === 'issue'
          ? t('freight_operations.adjustment_notes.issue.success', 'Note issued.')
          : t('freight_operations.adjustment_notes.cancel.success', 'Note cancelled.'),
        'success',
      )
      await query.refetch()
    } catch (error) {
      flash(
        error instanceof Error && error.message
          ? error.message
          : t('freight_operations.adjustment_notes.action.error', 'Unable to change the note.'),
        'error',
      )
    }
  }, [confirm, query, retryLastMutation, runMutation, t])

  const removeDraft = React.useCallback(async (note: AdjustmentNoteRow) => {
    const confirmed = await confirm({
      title: t('freight_operations.adjustment_notes.delete.confirm', 'Delete draft note {number}?', {
        number: note.note_number,
      }),
    })
    if (!confirmed) return
    try {
      await runMutation<Awaited<ReturnType<typeof apiCallOrThrow>>>({
        operation: () => withScopedApiRequestHeaders(
          buildOptimisticLockHeader(note.updatedAt ?? note.updated_at ?? null),
          () => apiCallOrThrow(`/api/${RESOURCE}`, {
            method: 'DELETE',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: note.id }),
          }, {
            errorMessage: t('freight_operations.adjustment_notes.delete.error', 'Unable to delete the note.'),
          }),
        ),
        mutationPayload: { operation: 'adjustment_notes.delete', noteId: note.id, updatedAt: note.updatedAt ?? null },
        context: { formId: CONTEXT_ID, resourceKind: ENTITY_ID, resourceId: note.id, retryLastMutation },
      })
      flash(t('freight_operations.adjustment_notes.delete.success', 'Note deleted.'), 'success')
      await query.refetch()
    } catch (error) {
      flash(
        error instanceof Error && error.message
          ? error.message
          : t('freight_operations.adjustment_notes.delete.error', 'Unable to delete the note.'),
        'error',
      )
    }
  }, [confirm, query, retryLastMutation, runMutation, t])

  const columns = React.useMemo<ColumnDef<AdjustmentNoteRow>[]>(() => [
    {
      accessorKey: 'note_number',
      header: t('freight_operations.adjustment_notes.columns.number', 'Note'),
      cell: ({ row }) => <span className="font-medium">{row.original.note_number}</span>,
      meta: { priority: 1 },
    },
    {
      accessorKey: 'note_type',
      header: t('freight_operations.adjustment_notes.columns.type', 'Type'),
      cell: ({ row }) => (
        <Badge variant={row.original.note_type === 'credit' ? 'secondary' : 'outline'}>
          {t(`freight_operations.adjustment_notes.type.${row.original.note_type}`, TYPE_FALLBACKS[row.original.note_type])}
        </Badge>
      ),
      meta: { priority: 2 },
    },
    {
      id: 'customer',
      header: t('freight_operations.adjustment_notes.columns.customer', 'Customer'),
      cell: ({ row }) => <span className="text-sm">{customerNameOf(row.original.customer_snapshot) || '—'}</span>,
      meta: { priority: 1 },
    },
    {
      accessorKey: 'gross_amount',
      header: t('freight_operations.adjustment_notes.columns.gross', 'Gross'),
      cell: ({ row }) => (
        <span className="text-sm tabular-nums">
          {formatFreightAmount(row.original.gross_amount, row.original.currency_code)}
        </span>
      ),
      meta: { priority: 2 },
    },
    {
      accessorKey: 'status',
      header: t('freight_operations.adjustment_notes.columns.status', 'Status'),
      cell: ({ row }) => (
        <Badge variant="secondary">
          {t(`freight_operations.adjustment_notes.status.${row.original.status}`, STATUS_FALLBACKS[row.original.status])}
        </Badge>
      ),
      meta: { priority: 3 },
    },
    {
      accessorKey: 'issue_date',
      header: t('freight_operations.adjustment_notes.columns.issueDate', 'Issued'),
      cell: ({ row }) => <span className="text-xs">{formatFreightDate(row.original.issue_date, 'en') || '—'}</span>,
      meta: { priority: 4 },
    },
  ], [t])

  return (
    <>
      <DataTable
        title={t('freight_operations.adjustment_notes.page.title', 'Credit and debit notes')}
        titleHeadingLevel={1}
        actions={(
          <Button asChild>
            <Link href={CREATE_HREF}>{t('freight_operations.adjustment_notes.actions.create', 'New note')}</Link>
          </Button>
        )}
        columns={columns}
        data={query.data?.items ?? []}
        searchValue={searchValue ?? ''}
        onSearchChange={(next: string) => {
          setValues((prev) => ({ ...prev, q: next }))
          setPage(1)
        }}
        searchPlaceholder={t('freight_operations.adjustment_notes.search.placeholder', 'Note number or reason')}
        searchAlign={direction === 'rtl' ? 'left' : 'right'}
        filters={[
          {
            id: 'noteType',
            label: t('freight_operations.adjustment_notes.filters.type', 'Type'),
            type: 'select',
            options: TYPE_VALUES.map((value) => ({
              value,
              label: t(`freight_operations.adjustment_notes.type.${value}`, TYPE_FALLBACKS[value]),
            })),
          },
          {
            id: 'status',
            label: t('freight_operations.adjustment_notes.filters.status', 'Status'),
            type: 'select',
            options: STATUS_VALUES.map((value) => ({
              value,
              label: t(`freight_operations.adjustment_notes.status.${value}`, STATUS_FALLBACKS[value]),
            })),
          },
        ]}
        filterValues={values}
        onFiltersApply={(next: FilterValues) => {
          setValues(next)
          setPage(1)
        }}
        onFiltersClear={() => {
          setValues({})
          setPage(1)
        }}
        entityId={ENTITY_ID}
        rowActions={(row) => (
          <RowActions
            items={[
              ...(row.status === 'draft'
                ? [
                    { id: 'edit', label: t('freight_operations.adjustment_notes.actions.edit', 'Edit'), href: editHref(row.id) },
                    { id: 'issue', label: t('freight_operations.adjustment_notes.actions.issue', 'Issue'), onSelect: () => { void runAction(row, 'issue') } },
                    { id: 'delete', label: t('freight_operations.adjustment_notes.actions.delete', 'Delete'), onSelect: () => { void removeDraft(row) } },
                  ]
                : []),
              ...(row.status === 'issued'
                ? [{ id: 'cancel', label: t('freight_operations.adjustment_notes.actions.cancel', 'Cancel'), onSelect: () => { void runAction(row, 'cancel') } }]
                : []),
            ]}
          />
        )}
        sortable
        sorting={sorting}
        onSortingChange={(next) => {
          setSorting(next)
          setPage(1)
        }}
        pagination={{
          page,
          pageSize: 50,
          total: query.data?.total ?? 0,
          totalPages: query.data?.totalPages ?? 0,
          totalIsCapped: query.data?.totalIsCapped === true,
          onPageChange: setPage,
        }}
        isLoading={query.isLoading}
      />
      {ConfirmDialogElement}
    </>
  )
}
