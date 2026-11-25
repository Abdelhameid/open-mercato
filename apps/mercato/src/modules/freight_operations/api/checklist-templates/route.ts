import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import { parseBooleanToken } from '@open-mercato/shared/lib/boolean'
import { parseScopedCommandInput, resolveCrudRecordId } from '@open-mercato/shared/lib/api/scoped'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { FreightChecklistTemplate } from '../../data/entities'
import { createChecklistTemplateSchema, updateChecklistTemplateSchema } from '../../data/validators'
import { withOrConditions } from '../../lib/crudFilters'
import { createFreightCrudOpenApi, createPagedListResponseSchema, defaultOkResponseSchema } from '../openapi'
import { FREIGHT_CHECKLIST_TEMPLATE_ENTITY_ID } from '../../commands/entities'

const rawBodySchema = z.object({}).passthrough()

const booleanQuerySchema = z.preprocess(
  (value) => (typeof value === 'string' ? parseBooleanToken(value) ?? undefined : value),
  z.boolean().optional(),
)

const listSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    id: z.string().uuid().optional(),
    ids: z.string().optional(),
    isActive: booleanQuerySchema,
    isDefault: booleanQuerySchema,
    search: z.string().optional(),
    sortField: z.string().optional(),
    sortDir: z.enum(['asc', 'desc']).optional(),
  })
  .passthrough()

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['freight.read'] },
  POST: { requireAuth: true, requireFeatures: ['freight.checklist_templates.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['freight.checklist_templates.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['freight.checklist_templates.manage'] },
}

export const metadata = { path: '/freight_operations/checklist-templates', ...routeMetadata }

const crud = makeCrudRoute({
  metadata: routeMetadata,
  orm: {
    entity: FreightChecklistTemplate,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  indexer: { entityType: FREIGHT_CHECKLIST_TEMPLATE_ENTITY_ID },
  list: {
    schema: listSchema,
    entityId: FREIGHT_CHECKLIST_TEMPLATE_ENTITY_ID,
    fields: [
      'id', 'organization_id', 'tenant_id', 'name', 'description', 'items',
      'is_active', 'is_default', 'created_at', 'updated_at',
    ],
    sortFieldMap: {
      name: 'name',
      isActive: 'is_active',
      isDefault: 'is_default',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    buildFilters: (query) =>
      withOrConditions(
        {
          ...(query.id ? { id: { $eq: query.id } } : {}),
          ...(query.ids ? { id: { $in: query.ids.split(',').map((value) => value.trim()).filter(Boolean) } } : {}),
          ...(query.isActive !== undefined ? { is_active: { $eq: query.isActive } } : {}),
          ...(query.isDefault !== undefined ? { is_default: { $eq: query.isDefault } } : {}),
        },
        query.search
          ? [
              {
                $or: [
                  { name: { $ilike: `%${escapeLikePattern(query.search)}%` } },
                  { description: { $ilike: `%${escapeLikePattern(query.search)}%` } },
                ],
              },
            ]
          : [],
      ),
    transformItem: (item) => ({
      ...item,
      updatedAt: item.updated_at ?? null,
      itemCount: Array.isArray(item.items) ? item.items.length : 0,
    }),
  },
  actions: {
    create: {
      commandId: 'freight_operations.checklist_templates.create',
      schema: rawBodySchema,
      mapInput: async ({ raw, ctx }) => {
        const { translate } = await resolveTranslations()
        return parseScopedCommandInput(createChecklistTemplateSchema, raw ?? {}, ctx, translate)
      },
      response: ({ result }) => ({
        id: result?.id ?? null,
        updatedAt: result?.updatedAt?.toISOString?.() ?? null,
      }),
      status: 201,
    },
    update: {
      commandId: 'freight_operations.checklist_templates.update',
      schema: rawBodySchema,
      mapInput: async ({ raw, ctx }) => {
        const { translate } = await resolveTranslations()
        return parseScopedCommandInput(updateChecklistTemplateSchema, raw ?? {}, ctx, translate)
      },
      response: () => ({ ok: true }),
    },
    delete: {
      commandId: 'freight_operations.checklist_templates.delete',
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

const checklistItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string().nullable().optional(),
  required: z.boolean(),
  requiresAttachment: z.boolean(),
})

const checklistTemplateItemSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable().optional(),
  items: z.array(checklistItemSchema),
  is_active: z.boolean().optional(),
  is_default: z.boolean().optional(),
  itemCount: z.number().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
})

export const openApi = createFreightCrudOpenApi({
  resourceName: 'FreightChecklistTemplate',
  pluralName: 'Freight Checklist Templates',
  querySchema: listSchema,
  listResponseSchema: createPagedListResponseSchema(checklistTemplateItemSchema),
  create: {
    schema: createChecklistTemplateSchema,
    description: 'Creates a driver checklist template with ordered items.',
  },
  update: {
    schema: updateChecklistTemplateSchema,
    responseSchema: defaultOkResponseSchema,
    description: 'Updates a checklist template name, description, items or active/default flags.',
  },
  del: {
    schema: z.object({ id: z.string().uuid() }),
    responseSchema: defaultOkResponseSchema,
    description: 'Soft-deletes a checklist template.',
  },
})
