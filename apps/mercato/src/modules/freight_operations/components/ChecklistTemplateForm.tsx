"use client"

import * as React from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { ErrorMessage, RecordNotFoundState } from '@open-mercato/ui/backend/detail'
import { createCrud, deleteCrud, fetchCrudList, updateCrud } from '@open-mercato/ui/backend/utils/crud'
import { withFlash } from '@open-mercato/ui/backend/utils/flash'
import { createCrudFormError } from '@open-mercato/ui/backend/utils/serverErrors'
import { Button } from '@open-mercato/ui/primitives/button'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { Input } from '@open-mercato/ui/primitives/input'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import type { ChecklistTemplateItem } from '../data/entities'

const ENTITY_ID = 'freight_operations:freight_checklist_template'
const RESOURCE = 'freight_operations/checklist-templates'
export const LIST_HREF = '/backend/freight/checklist-templates'

export type ChecklistTemplateRow = {
  id: string
  name: string
  description?: string | null
  items?: ChecklistTemplateItem[] | null
  is_active?: boolean
  is_default?: boolean
  itemCount?: number
  created_at?: string | null
  updated_at?: string | null
  updatedAt?: string | null
}

export type ChecklistTemplateFormValues = {
  id?: string
  name: string
  description: string
  isActive: boolean
  isDefault: boolean
  items: ChecklistTemplateItem[]
  updatedAt?: string | null
}

function textOf(value: unknown): string {
  return value === null || value === undefined ? '' : String(value)
}

export function toChecklistTemplateFormValues(row: ChecklistTemplateRow): ChecklistTemplateFormValues {
  return {
    id: row.id,
    name: row.name,
    description: textOf(row.description),
    isActive: row.is_active !== false,
    isDefault: row.is_default === true,
    items: Array.isArray(row.items) ? row.items : [],
    updatedAt: row.updatedAt ?? row.updated_at ?? null,
  }
}

export function buildChecklistTemplateDefaults(id = ''): ChecklistTemplateFormValues {
  return {
    id,
    name: '',
    description: '',
    isActive: true,
    isDefault: false,
    items: [newChecklistItem()],
    updatedAt: null,
  }
}

function newChecklistItem(): ChecklistTemplateItem {
  return {
    key: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `item-${Date.now()}`,
    label: '',
    description: '',
    required: true,
    requiresAttachment: false,
  }
}

function readItems(value: unknown, onChange: (items: ChecklistTemplateItem[]) => void) {
  const items = Array.isArray(value) ? (value as ChecklistTemplateItem[]) : []
  const update = (index: number, patch: Partial<ChecklistTemplateItem>) => {
    onChange(items.map((item, current) => (current === index ? { ...item, ...patch } : item)))
  }
  return { items, update }
}

function ChecklistItemsEditor({
  value,
  setValue,
  disabled,
}: {
  value: unknown
  setValue: (value: unknown) => void
  disabled?: boolean
}) {
  const t = useT()
  const { items, update } = readItems(value, setValue)
  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= items.length) return
    const next = [...items]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    setValue(next)
  }
  return (
    <div className="flex flex-col gap-3">
      {items.map((item, index) => (
        <div key={item.key} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
          <div className="flex items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Input
                value={item.label}
                disabled={disabled}
                placeholder={t('freight_operations.checklist_templates.items.labelPlaceholder', 'Checklist item')}
                aria-label={t('freight_operations.checklist_templates.items.label', 'Item label')}
                onChange={(event) => update(index, { label: event.target.value })}
              />
              <Textarea
                value={item.description ?? ''}
                disabled={disabled}
                rows={2}
                placeholder={t('freight_operations.checklist_templates.items.descriptionPlaceholder', 'Optional instructions')}
                aria-label={t('freight_operations.checklist_templates.items.description', 'Item description')}
                onChange={(event) => update(index, { description: event.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={disabled || index === 0}
                aria-label={t('freight_operations.checklist_templates.items.moveUp', 'Move up')}
                onClick={() => move(index, -1)}
              >
                <ArrowUp aria-hidden className="size-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={disabled || index === items.length - 1}
                aria-label={t('freight_operations.checklist_templates.items.moveDown', 'Move down')}
                onClick={() => move(index, 1)}
              >
                <ArrowDown aria-hidden className="size-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={disabled || items.length <= 1}
                aria-label={t('freight_operations.checklist_templates.items.remove', 'Remove item')}
                onClick={() => setValue(items.filter((_, current) => current !== index))}
              >
                <Trash2 aria-hidden className="size-4" />
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={item.required}
                disabled={disabled}
                onCheckedChange={(checked) => update(index, {
                  required: checked === true,
                  requiresAttachment: checked === true ? item.requiresAttachment : false,
                })}
              />
              <span>{t('freight_operations.checklist_templates.items.required', 'Required')}</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={item.requiresAttachment}
                disabled={disabled}
                onCheckedChange={(checked) => update(index, {
                  requiresAttachment: checked === true,
                  required: checked === true ? true : item.required,
                })}
              />
              <span>{t('freight_operations.checklist_templates.items.requiresAttachment', 'Attachment required')}</span>
            </label>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => setValue([...items, newChecklistItem()])}
      >
        <Plus aria-hidden className="me-2 size-4" />
        {t('freight_operations.checklist_templates.items.add', 'Add item')}
      </Button>
    </div>
  )
}

function useChecklistFields(t: ReturnType<typeof useT>): CrudField[] {
  return React.useMemo(() => [
    {
      id: 'name',
      label: t('freight_operations.checklist_templates.fields.name', 'Name'),
      type: 'text',
      required: true,
      layout: 'full',
    },
    {
      id: 'description',
      label: t('freight_operations.checklist_templates.fields.description', 'Description'),
      type: 'textarea',
      rows: 3,
      layout: 'full',
    },
    {
      id: 'isActive',
      label: t('freight_operations.checklist_templates.fields.isActive', 'Active'),
      type: 'checkbox',
      layout: 'half',
    },
    {
      id: 'isDefault',
      label: t('freight_operations.checklist_templates.fields.isDefault', 'Use for driver deliveries'),
      type: 'checkbox',
      description: t(
        'freight_operations.checklist_templates.fields.isDefaultHelp',
        'Drivers must complete the active default template before recording a delivery.',
      ),
      layout: 'half',
    },
    {
      id: 'items',
      label: t('freight_operations.checklist_templates.fields.items', 'Checklist items'),
      type: 'custom',
      required: true,
      layout: 'full',
      component: ChecklistItemsEditor,
    },
  ], [t])
}

function useChecklistGroups(t: ReturnType<typeof useT>): CrudFormGroup[] {
  return React.useMemo(() => [
    {
      id: 'template',
      title: t('freight_operations.checklist_templates.form.group', 'Template'),
      fields: ['name', 'description', 'isActive', 'isDefault', 'items'],
    },
  ], [t])
}

function toPayload(values: ChecklistTemplateFormValues): Record<string, unknown> {
  const items = values.items.map((item) => ({
    key: item.key,
    label: item.label.trim(),
    description: item.description?.trim() ? item.description.trim() : null,
    required: item.required,
    requiresAttachment: item.requiresAttachment,
  }))
  return {
    name: values.name.trim(),
    description: values.description.trim() ? values.description.trim() : null,
    isActive: values.isActive,
    isDefault: values.isDefault,
    items,
  }
}

function validate(values: ChecklistTemplateFormValues, t: ReturnType<typeof useT>): void {
  if (!values.items.length) {
    throw createCrudFormError(
      t('freight_operations.checklist_templates.error.itemsRequired', 'Add at least one checklist item.'),
      { items: t('freight_operations.checklist_templates.error.itemsRequired', 'Add at least one checklist item.') },
    )
  }
  const missingLabel = values.items.findIndex((item) => !item.label.trim())
  if (missingLabel >= 0) {
    throw createCrudFormError(
      t('freight_operations.checklist_templates.error.labelRequired', 'Every checklist item needs a label.'),
      { items: t('freight_operations.checklist_templates.error.labelRequired', 'Every checklist item needs a label.') },
    )
  }
}

export function ChecklistTemplateCreateForm() {
  const t = useT()
  const fields = useChecklistFields(t)
  const groups = useChecklistGroups(t)
  const successRedirect = React.useMemo(
    () => withFlash(LIST_HREF, t('freight_operations.checklist_templates.flash.saved', 'Checklist template saved.'), 'success'),
    [t],
  )
  return (
    <CrudForm<ChecklistTemplateFormValues>
      title={t('freight_operations.checklist_templates.form.createTitle', 'New checklist template')}
      titleHeadingLevel={1}
      backHref={LIST_HREF}
      entityId={ENTITY_ID}
      fields={fields}
      groups={groups}
      initialValues={buildChecklistTemplateDefaults()}
      submitLabel={t('freight_operations.checklist_templates.form.createSubmit', 'Create template')}
      cancelHref={LIST_HREF}
      successRedirect={successRedirect}
      onSubmit={async (values) => {
        validate(values, t)
        await createCrud(RESOURCE, toPayload(values))
      }}
    />
  )
}

export function ChecklistTemplateEditForm({ id }: { id: string }) {
  const t = useT()
  const fields = useChecklistFields(t)
  const groups = useChecklistGroups(t)
  const [initial, setInitial] = React.useState<ChecklistTemplateFormValues | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [notFound, setNotFound] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      setNotFound(false)
      try {
        const data = await fetchCrudList<ChecklistTemplateRow>(RESOURCE, { ids: String(id), pageSize: 1 })
        const item = data?.items?.[0]
        if (!item) {
          if (!cancelled) setNotFound(true)
          return
        }
        if (!cancelled) setInitial(toChecklistTemplateFormValues(item))
      } catch (caught) {
        if (!cancelled) {
          if ((caught as { status?: number }).status === 404) {
            setNotFound(true)
          } else {
            setError(caught instanceof Error && caught.message
              ? caught.message
              : t('freight_operations.checklist_templates.error.load', 'Could not load the checklist template.'))
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [id, t])

  const successRedirect = React.useMemo(
    () => withFlash(LIST_HREF, t('freight_operations.checklist_templates.flash.saved', 'Checklist template saved.'), 'success'),
    [t],
  )
  const deleteRedirect = React.useMemo(
    () => withFlash(LIST_HREF, t('freight_operations.checklist_templates.flash.deleted', 'Checklist template deleted.'), 'success'),
    [t],
  )

  if (notFound) {
    return (
      <RecordNotFoundState
        label={t('freight_operations.checklist_templates.error.notFound', 'Checklist template not found.')}
        backHref={LIST_HREF}
        backLabel={t('freight_operations.checklist_templates.actions.backToList', 'Back to checklist templates')}
      />
    )
  }

  if (error) return <ErrorMessage label={error} />

  return (
    <CrudForm<ChecklistTemplateFormValues>
      title={t('freight_operations.checklist_templates.form.editTitle', 'Edit checklist template')}
      titleHeadingLevel={1}
      backHref={LIST_HREF}
      entityId={ENTITY_ID}
      fields={fields}
      groups={groups}
      initialValues={initial ?? buildChecklistTemplateDefaults(id)}
      submitLabel={t('freight_operations.checklist_templates.form.editSubmit', 'Save changes')}
      cancelHref={LIST_HREF}
      successRedirect={successRedirect}
      deleteRedirect={deleteRedirect}
      isLoading={loading}
      loadingMessage={t('freight_operations.checklist_templates.form.loading', 'Loading checklist template…')}
      onSubmit={async (values) => {
        validate(values, t)
        await updateCrud(RESOURCE, { id, ...toPayload(values) })
      }}
      onDelete={async () => { await deleteCrud(RESOURCE, id) }}
    />
  )
}
