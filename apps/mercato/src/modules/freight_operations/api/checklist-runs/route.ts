import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { createLogger } from '@open-mercato/shared/lib/logger'
import type { EntityManager } from '@mikro-orm/postgresql'
import { FreightChecklistRun } from '../../data/entities'

const logger = createLogger('freight_operations')

export const metadata = {
  path: '/freight_operations/checklist-runs',
  GET: { requireAuth: true, requireFeatures: ['freight.read'] },
}

const runItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string().nullable().optional(),
  required: z.boolean(),
  requiresAttachment: z.boolean(),
  checked: z.boolean(),
  attachmentId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
})

export async function GET(req: Request) {
  try {
    const container = await createRequestContainer()
    const auth = await getAuthFromRequest(req)
    if (!auth?.tenantId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    const organizationScope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
    const organizationId = organizationScope?.selectedId ?? auth.orgId ?? null
    if (!organizationId) return NextResponse.json({ error: 'Organization context is required' }, { status: 400 })

    const url = new URL(req.url)
    const orderId = url.searchParams.get('orderId')
    const tripId = url.searchParams.get('tripId')
    const uuid = z.string().uuid()
    if (Boolean(orderId) === Boolean(tripId)) {
      return NextResponse.json({ error: 'Provide exactly one of orderId or tripId' }, { status: 400 })
    }
    if (orderId && !uuid.safeParse(orderId).success) {
      return NextResponse.json({ error: 'orderId must be a UUID' }, { status: 400 })
    }
    if (tripId && !uuid.safeParse(tripId).success) {
      return NextResponse.json({ error: 'tripId must be a UUID' }, { status: 400 })
    }

    const em = container.resolve('em') as EntityManager
    const runs = await em.find(
      FreightChecklistRun,
      {
        tenantId: auth.tenantId,
        organizationId,
        deletedAt: null,
        ...(orderId ? { freightOrderId: orderId } : { freightTripId: tripId }),
      },
      { orderBy: { completedAt: 'desc' } },
    )
    return NextResponse.json({
      runs: runs.map((run) => ({
        id: run.id,
        freightOrderId: run.freightOrderId ?? null,
        freightTripId: run.freightTripId ?? null,
        templateId: run.templateId ?? null,
        templateName: run.templateNameSnapshot,
        templateSnapshot: run.templateSnapshot,
        items: run.items ?? [],
        status: run.status,
        completedAt: run.completedAt ?? null,
        driverId: run.driverId ?? null,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt ?? null,
      })),
    })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    logger.error('freight_operations.checklist_runs.failed', { err })
    return NextResponse.json({ error: 'Failed to load checklist runs' }, { status: 500 })
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Freight Operations',
  summary: 'Freight checklist runs',
  methods: {
    GET: {
      summary: 'List completed driver checklist runs for an order or trip',
      responses: [
        {
          status: 200,
          description: 'Checklist runs',
          schema: z.object({
            runs: z.array(z.object({
              id: z.string().uuid(),
              freightOrderId: z.string().uuid().nullable().optional(),
              freightTripId: z.string().uuid().nullable().optional(),
              templateId: z.string().uuid().nullable().optional(),
              templateName: z.string(),
              templateSnapshot: z.record(z.string(), z.unknown()),
              items: z.array(runItemSchema),
              status: z.string(),
              completedAt: z.string().nullable().optional(),
              driverId: z.string().uuid().nullable().optional(),
              createdAt: z.string(),
              updatedAt: z.string().nullable().optional(),
            })),
          }),
        },
      ],
    },
  },
}
