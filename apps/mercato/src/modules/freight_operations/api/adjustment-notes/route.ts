import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import { parseScopedCommandInput, resolveCrudRecordId } from '@open-mercato/shared/lib/api/scoped'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import {
  ADJUSTMENT_NOTE_STATUSES,
  ADJUSTMENT_NOTE_TYPES,
  FreightAdjustmentNote,
} from '../../data/entities'
import { createAdjustmentNoteSchema, updateAdjustmentNoteSchema } from '../../data/validators'
import { withOrConditions } from '../../lib/crudFilters'
import { createPagedListResponseSchema, createFreightCrudOpenApi, defaultOkResponseSchema } from '../openapi'
import { FREIGHT_ADJUSTMENT_NOTE_ENTITY_ID } from '../../commands/entities'

const rawBodySchema = z.object({}).passthrough()
const listSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    id: z.string().uuid().optional(),
    ids: z.string().optional(),
    noteType: z.enum(ADJUSTMENT_NOTE_TYPES).optional(),
    status: z.enum(ADJUSTMENT_NOTE_STATUSES).optional(),
    orderId: z.string().uuid().optional(),
    customerId: z.string().uuid().optional(),
    search: z.string().optional(),
    sortField: z.string().optional(),
    sortDir: z.enum(['asc', 'desc']).optional(),
  })
  .passthrough()

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['freight.read'] },
  POST: { requireAuth: true, requireFeatures: ['freight.adjustment_notes.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['freight.adjustment_notes.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['freight.adjustment_notes.manage'] },
}
export const metadata = { path: '/freight_operations/adjustment-notes', ...routeMetadata }

const crud = makeCrudRoute({
  metadata: routeMetadata,
  orm: {
    entity: FreightAdjustmentNote,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  indexer: { entityType: FREIGHT_ADJUSTMENT_NOTE_ENTITY_ID },
  list: {
    schema: listSchema,
    entityId: FREIGHT_ADJUSTMENT_NOTE_ENTITY_ID,
    fields: [
      'id', 'organization_id', 'tenant_id', 'note_number', 'note_type', 'status',
      'order_id', 'trip_id', 'abstract_id', 'sales_invoice_id',
      'customer_id', 'customer_snapshot', 'currency_code',
      'net_amount', 'tax_amount', 'gross_amount', 'vat_rate',
      'reason', 'issue_date', 'issued_at', 'cancelled_at',
      'created_at', 'updated_at',
    ],
    sortFieldMap: {
      noteNumber: 'note_number',
      noteType: 'note_type',
      status: 'status',
      issueDate: 'issue_date',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    buildFilters: (query) =>
      withOrConditions(
        {
          ...(query.id ? { id: { $eq: query.id } } : {}),
          ...(query.ids ? { id: { $in: query.ids.split(',').map((value) => value.trim()).filter(Boolean) } } : {}),
          ...(query.noteType ? { note_type: { $eq: query.noteType } } : {}),
          ...(query.status ? { status: { $eq: query.status } } : {}),
          ...(query.orderId ? { order_id: { $eq: query.orderId } } : {}),
          ...(query.customerId ? { customer_id: { $eq: query.customerId } } : {}),
        },
        query.search
          ? [
              {
                $or: [
                  { note_number: { $ilike: `%${escapeLikePattern(query.search)}%` } },
                  { reason: { $ilike: `%${escapeLikePattern(query.search)}%` } },
                ],
              },
            ]
          : [],
      ),
    transformItem: (item) => ({ ...item, updatedAt: item.updated_at ?? null }),
  },
  actions: {
    create: {
      commandId: 'freight_operations.adjustment_notes.create',
      schema: rawBodySchema,
      mapInput: async ({ raw, ctx }) => {
        const { translate } = await resolveTranslations()
        return parseScopedCommandInput(createAdjustmentNoteSchema, raw ?? {}, ctx, translate)
      },
      response: ({ result }) => ({
        id: result?.id ?? null,
        noteNumber: result?.noteNumber ?? null,
        updatedAt: result?.updatedAt?.toISOString?.() ?? null,
      }),
      status: 201,
    },
    update: {
      commandId: 'freight_operations.adjustment_notes.update',
      schema: rawBodySchema,
      mapInput: async ({ raw, ctx }) => {
        const { translate } = await resolveTranslations()
        return parseScopedCommandInput(updateAdjustmentNoteSchema, raw ?? {}, ctx, translate)
      },
      response: () => ({ ok: true }),
    },
    delete: {
      commandId: 'freight_operations.adjustment_notes.delete',
      schema: rawBodySchema,
      mapInput: async ({ parsed, ctx }) => {
        const { translate } = await resolveTranslations()
        return { id: resolveCrudRecordId(parsed, ctx, translate) }
      },
      response: () => ({ ok: true }),
    },
  },
})

export const GET = crud.GET
export const POST = crud.POST
export const PUT = crud.PUT
export const DELETE = crud.DELETE

const noteItemSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  note_number: z.string(),
  note_type: z.enum(ADJUSTMENT_NOTE_TYPES),
  status: z.enum(ADJUSTMENT_NOTE_STATUSES),
  order_id: z.string().uuid().nullable().optional(),
  trip_id: z.string().uuid().nullable().optional(),
  abstract_id: z.string().uuid().nullable().optional(),
  sales_invoice_id: z.string().uuid().nullable().optional(),
  customer_id: z.string().uuid(),
  customer_snapshot: z.record(z.string(), z.unknown()).nullable().optional(),
  currency_code: z.string(),
  net_amount: z.string(),
  tax_amount: z.string(),
  gross_amount: z.string(),
  vat_rate: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
  issue_date: z.string().nullable().optional(),
  issued_at: z.string().nullable().optional(),
  cancelled_at: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
})

export const openApi = createFreightCrudOpenApi({
  resourceName: 'Adjustment note',
  pluralName: 'Adjustment notes',
  querySchema: listSchema,
  listResponseSchema: createPagedListResponseSchema(noteItemSchema),
  create: { schema: createAdjustmentNoteSchema, description: 'Create a draft credit or debit note.' },
  update: { schema: updateAdjustmentNoteSchema, responseSchema: defaultOkResponseSchema, description: 'Update a draft note.' },
  del: { schema: z.object({ id: z.string().uuid() }), responseSchema: defaultOkResponseSchema, description: 'Delete a draft note.' },
})
