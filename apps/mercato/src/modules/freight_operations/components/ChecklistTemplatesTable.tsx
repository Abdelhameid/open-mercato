"use client"

import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import type { SortingState } from '@tanstack/react-table'
import { Plus } from 'lucide-react'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Button } from '@open-mercato/ui/primitives/button'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { formatFreightDate } from './freightOptions'
import { LIST_HREF, type ChecklistTemplateRow } from './ChecklistTemplateForm'

const RESOURCE = 'freight_operations/checklist-templates'
const ENTITY_ID = 'freight_operations:freight_checklist_template'

const editHref = (id: string) => `${LIST_HREF}/${id}/edit`

export default function ChecklistTemplatesTable() {
  const t = useT()
  const locale = useLocale()
  const scopeVersion = useOrganizationScopeVersion()
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'name', desc: false }])

  const params = React.useMemo(() => ({
    page: 1,
    pageSize: 100,
    sortField: sorting[0]?.id ?? 'name',
    sortDir: sorting[0]?.desc ? 'desc' : 'asc',
  }), [sorting])

  const query = useQuery({
    queryKey: ['freight-checklist-templates-list', params, scopeVersion],
    queryFn: () => fetchCrudList<ChecklistTemplateRow>(RESOURCE, params),
  })

  const columns = React.useMemo<ColumnDef<ChecklistTemplateRow>[]>(() => [
    {
      accessorKey: 'name',
      header: t('freight_operations.checklist_templates.columns.name', 'Template'),
      cell: ({ row }) => (
        <Link
          href={editHref(row.original.id)}
          className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
        >
          {row.original.name}
        </Link>
      ),
      meta: { priority: 1 },
    },
    {
      id: 'items',
      header: t('freight_operations.checklist_templates.columns.items', 'Items'),
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.itemCount ?? (Array.isArray(row.original.items) ? row.original.items.length : 0)}
        </span>
      ),
      meta: { priority: 2 },
    },
    {
      id: 'isActive',
      header: t('freight_operations.checklist_templates.columns.active', 'Active'),
      enableSorting: false,
      cell: ({ row }) => (
        <Badge variant={row.original.is_active === false ? 'secondary' : 'default'}>
          {row.original.is_active === false
            ? t('freight_operations.checklist_templates.status.inactive', 'Inactive')
            : t('freight_operations.checklist_templates.status.active', 'Active')}
        </Badge>
      ),
      meta: { priority: 2 },
    },
    {
      id: 'isDefault',
      header: t('freight_operations.checklist_templates.columns.default', 'Driver default'),
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.is_default
            ? t('freight_operations.checklist_templates.status.default', 'Yes')
            : t('freight_operations.checklist_templates.status.notDefault', 'No')}
        </span>
      ),
      meta: { priority: 2 },
    },
    {
      accessorKey: 'updated_at',
      header: t('freight_operations.checklist_templates.columns.updatedAt', 'Updated'),
      cell: ({ row }) => (
        <span className="text-sm">{formatFreightDate(row.original.updated_at, locale)}</span>
      ),
      meta: { priority: 3 },
    },
  ], [locale, t])

  if (query.isError) {
    return (
      <div className="text-sm text-status-error-text">
        {t('freight_operations.checklist_templates.error.load', 'Could not load the checklist template.')}
      </div>
    )
  }

  return (
    <DataTable
      title={t('freight_operations.checklist_templates.page.title', 'Driver checklist templates')}
      titleHeadingLevel={1}
      actions={(
        <Button asChild>
          <Link href={`${LIST_HREF}/create`}>
            <Plus aria-hidden className="me-2 size-4" />
            {t('freight_operations.checklist_templates.actions.create', 'New template')}
          </Link>
        </Button>
      )}
      rowActions={(row) => (
        <RowActions
          items={[
            {
              id: 'edit',
              label: t('freight_operations.checklist_templates.actions.edit', 'Edit'),
              href: editHref(row.id),
            },
          ]}
        />
      )}
      columns={columns}
      data={query.data?.items ?? []}
      entityId={ENTITY_ID}
      sortable
      sorting={sorting}
      onSortingChange={setSorting}
      pagination={{
        page: 1,
        pageSize: 100,
        total: query.data?.total ?? 0,
        totalPages: query.data?.totalPages ?? 0,
        totalIsCapped: query.data?.totalIsCapped === true,
        onPageChange: () => undefined,
      }}
      isLoading={query.isLoading}
    />
  )
}
