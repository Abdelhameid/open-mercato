import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import { buildQueryParams } from '@open-mercato/shared/lib/crud/query-params'
import { parseCommaSeparatedList } from '@open-mercato/shared/lib/string'
import { parseScopedCommandInput, resolveCrudRecordId } from '@open-mercato/shared/lib/api/scoped'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { TransportRoute } from '../../data/entities'
import { createDriverSchema, updateDriverSchema } from '../../data/validators'
import { EXPIRY_WINDOW_DAYS } from '../../lib/expiry'
import { resolveTransportActionContext } from '../../lib/routeContext'
import { createPagedListResponseSchema, createTransportCrudOpenApi, defaultOkResponseSchema } from '../openapi'

/**
 * Transport's driver surface is a compatibility projection over the HR register.
 *
 * HR owns the person (`hr_employees`) and the licence (`hr_driver_profiles`);
 * this route keeps the old `/transport_operations/drivers` contract and field
 * shape for dispatchers and downstream modules, while writes go through the HR
 * roster commands. No driver data is stored in transport.
 */

const logger = createLogger('transport_operations')

const rawBodySchema = z.object({}).passthrough()
const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25),
  id: z.string().uuid().optional(), ids: z.string().optional(),
  employeeId: z.string().uuid().optional(),
  status: z.enum(['available', 'on_trip', 'on_leave', 'suspended']).optional(),
  // `expired` is the compliance emergency; `within30` is what a dispatcher renews this week. The
  // cut-off is computed on the server so every consumer filters on one definition of "expiring".
  expiry: z.enum(['expired', 'within30']).optional(),
  licenseExpiresBefore: z.string().optional(), search: z.string().optional(),
  sortField: z.string().optional(), sortDir: z.enum(['asc', 'desc']).optional(),
}).passthrough()

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['transport.read'] },
  POST: { requireAuth: true, requireFeatures: ['transport.write'] },
  PUT: { requireAuth: true, requireFeatures: ['transport.write'] },
  DELETE: { requireAuth: true, requireFeatures: ['transport.write'] },
}
export const metadata = { path: '/transport_operations/drivers', ...routeMetadata }

type DriverRow = {
  id: string
  organization_id: string
  tenant_id: string
  employee_id: string | null
  user_id: string | null
  full_name: string
  national_id: string
  license_number: string
  license_type: string | null
  license_expiry: string
  medical_check_expiry: string | null
  years_of_experience: number | null
  phone: string
  status: 'available' | 'on_trip' | 'on_leave' | 'suspended'
  notes: string | null
  created_at: Date | string
  updated_at: Date | string
}

const STATUS_EXPRESSION = `case
  when e.status in ('suspended', 'terminated') then 'suspended'
  when e.status = 'on_leave' then 'on_leave'
  when exists (
    select 1 from transport_trip_schedules t
    where t.driver_id = p.id and t.status = 'in_progress' and t.deleted_at is null
  ) then 'on_trip'
  else 'available'
end`

const SORT_COLUMNS: Record<string, string> = {
  fullName: 'full_name',
  full_name: 'full_name',
  nationalId: 'national_id',
  national_id: 'national_id',
  licenseNumber: 'license_number',
  license_number: 'license_number',
  licenseExpiry: 'license_expiry',
  license_expiry: 'license_expiry',
  status: 'status',
  createdAt: 'created_at',
  created_at: 'created_at',
  updatedAt: 'updated_at',
  updated_at: 'updated_at',
}

function isMissingRelationError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return message.includes('42P01') || /relation .* does not exist/i.test(message)
}

export async function GET(req: Request) {
  try {
    const context = await resolveTransportActionContext(req)
    const url = new URL(req.url)
    const query = listSchema.parse(buildQueryParams(url.searchParams))
    const em = context.ctx.container.resolve('em') as EntityManager

    const innerParams: unknown[] = [context.tenantId, context.organizationId]
    const filters: string[] = []
    const filterParams: unknown[] = []

    if (query.id) {
      filters.push('id = ?')
      filterParams.push(query.id)
    }
    const ids = query.ids
      ? parseCommaSeparatedList(query.ids).filter((value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))
      : []
    if (ids.length) {
      filters.push(`id in (${ids.map(() => '?').join(', ')})`)
      filterParams.push(...ids)
    }
    if (query.employeeId) {
      filters.push('employee_id = ?')
      filterParams.push(query.employeeId)
    }
    if (query.status) {
      filters.push('status = ?')
      filterParams.push(query.status)
    }
    if (query.licenseExpiresBefore) {
      filters.push('license_expiry <= ?')
      filterParams.push(query.licenseExpiresBefore)
    }
    if (query.expiry) {
      const cutoff = query.expiry === 'expired'
        ? new Date()
        : new Date(Date.now() + EXPIRY_WINDOW_DAYS * 24 * 60 * 60 * 1000)
      filters.push('(license_expiry <= ? or medical_check_expiry <= ?)')
      filterParams.push(cutoff.toISOString().slice(0, 10), cutoff.toISOString().slice(0, 10))
    }
    if (query.search) {
      const needle = `%${escapeLikePattern(query.search.trim())}%`
      filters.push(`(full_name ilike ? or national_id ilike ? or license_number ilike ? or phone ilike ?)`)
      filterParams.push(needle, needle, needle, needle)
    }

    const where = filters.length ? `where ${filters.join(' and ')}` : ''
    const sortColumn = SORT_COLUMNS[query.sortField ?? ''] ?? 'license_expiry'
    const sortDir = query.sortDir === 'desc' ? 'desc' : 'asc'
    const offset = (query.page - 1) * query.pageSize

    const rosterSql = `with roster as (
      select p.id, p.tenant_id, p.organization_id, p.employee_id,
        e.first_name || ' ' || e.last_name as full_name,
        e.national_id, e.phone, e.user_id,
        p.license_number, p.license_type, p.license_expiry, p.medical_check_expiry,
        p.years_of_experience, p.notes, p.created_at, p.updated_at,
        ${STATUS_EXPRESSION} as status
      from hr_driver_profiles p
      join hr_employees e
        on e.id = p.employee_id
       and e.tenant_id = p.tenant_id
       and e.organization_id = p.organization_id
      where p.tenant_id = ? and p.organization_id = ?
        and p.deleted_at is null and e.deleted_at is null
    )`

    const rows = await em.getConnection().execute<DriverRow[]>(
      `${rosterSql}
       select * from roster ${where}
       order by ${sortColumn} ${sortDir}
       limit ? offset ?`,
      [...innerParams, ...filterParams, query.pageSize, offset],
    )
    const countRows = await em.getConnection().execute<Array<{ count: number | string }>>(
      `${rosterSql} select count(*)::int as count from roster ${where}`,
      [...innerParams, ...filterParams],
    )
    const total = Number(countRows[0]?.count ?? 0)

    return NextResponse.json({
      items: rows.map((row) => ({ ...row, updatedAt: row.updated_at ?? null })),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    if (isMissingRelationError(err)) {
      // The HR register is absent (module disabled): the driver surface degrades to empty.
      return NextResponse.json({ items: [], total: 0, page: 1, pageSize: 25, totalPages: 0 })
    }
    logger.error('transport_operations.drivers.list_failed', { err })
    const { translate } = await resolveTranslations()
    return NextResponse.json(
      { error: translate('transport_operations.drivers.error.load', 'Failed to load drivers.') },
      { status: 500 },
    )
  }
}

const crud = makeCrudRoute({
  metadata: routeMetadata,
  // The command path never reads the ORM descriptor. It is present because the factory
  // requires one; driver rows live in HR and are reached through the roster commands.
  orm: { entity: TransportRoute, idField: 'id' },
  actions: {
    create: {
      commandId: 'hr_management.driver_roster.create', schema: rawBodySchema,
      mapInput: async ({ raw, ctx }) => { const { translate } = await resolveTranslations(); return parseScopedCommandInput(createDriverSchema, raw ?? {}, ctx, translate) },
      response: ({ result }) => ({
        id: result?.id ?? null,
        updatedAt: typeof result?.updatedAt === 'string'
          ? result.updatedAt
          : result?.updatedAt?.toISOString?.() ?? null,
      }), status: 201,
    },
    update: {
      commandId: 'hr_management.driver_roster.update', schema: rawBodySchema,
      mapInput: async ({ raw, ctx }) => { const { translate } = await resolveTranslations(); return parseScopedCommandInput(updateDriverSchema, raw ?? {}, ctx, translate) },
      response: () => ({ ok: true }),
    },
    delete: {
      commandId: 'hr_management.driver_roster.delete', schema: rawBodySchema,
      mapInput: async ({ parsed, ctx }) => { const { translate } = await resolveTranslations(); return { id: resolveCrudRecordId(parsed, ctx, translate) } },
      response: () => ({ ok: true }),
    },
  },
})

export const POST = crud.POST
export const PUT = crud.PUT
export const DELETE = crud.DELETE

const driverListItemSchema = z.object({
  id: z.string().uuid(), organization_id: z.string().uuid(), tenant_id: z.string().uuid(), employee_id: z.string().uuid().nullable().optional(),
  user_id: z.string().uuid().nullable().optional(),
  full_name: z.string(), national_id: z.string(), license_number: z.string(), license_type: z.string().nullable().optional(),
  license_expiry: z.string(), medical_check_expiry: z.string().nullable().optional(),
  years_of_experience: z.number().nullable().optional(),
  phone: z.string(),
  status: z.enum(['available', 'on_trip', 'on_leave', 'suspended']), created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(), updatedAt: z.string().nullable().optional(),
})

export const openApi = createTransportCrudOpenApi({
  resourceName: 'Driver', pluralName: 'Drivers', querySchema: listSchema,
  listResponseSchema: createPagedListResponseSchema(driverListItemSchema),
  create: { schema: createDriverSchema, description: 'Creates a driver in the HR register.' },
  update: { schema: updateDriverSchema, responseSchema: defaultOkResponseSchema, description: 'Updates a driver in the HR register.' },
  del: { schema: z.object({ id: z.string().uuid() }), responseSchema: defaultOkResponseSchema, description: 'Soft-deletes the driver profile.' },
})
