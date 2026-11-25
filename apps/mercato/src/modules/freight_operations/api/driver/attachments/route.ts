import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { createLogger } from '@open-mercato/shared/lib/logger'
import type { EntityManager } from '@mikro-orm/postgresql'
import { FreightOrder, FreightTrip } from '../../../data/entities'
import { resolveDriverForUser } from '../../../lib/driverIdentity'
import { FREIGHT_ORDER_ENTITY_ID, FREIGHT_TRIP_ENTITY_ID } from '../../../commands/entities'

const logger = createLogger('freight_operations')

export const metadata = {
  path: '/freight_operations/driver/attachments',
  POST: { requireAuth: true, requireFeatures: ['freight.driver_app'] },
}

const PARTITION_CODE = 'privateAttachments'
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
const MAX_FILE_BYTES = 10 * 1024 * 1024

type AttachmentServiceLike = {
  validateUpload(input: { contentLength?: string | null; fileName?: string; fileSize?: number }): void
  readUploadForm?(request: Request): Promise<FormData>
  createScoped(input: {
    tenantId: string
    organizationId: string
    entityId: string
    recordId: string
    partitionCode: string
    fileName: string
    declaredMimeType?: string | null
    buffer: Buffer
  }): Promise<{ id: string; url: string; fileName: string; mimeType: string; fileSize: number }>
}

export async function POST(req: Request) {
  try {
    const { t } = await resolveTranslations()
    const container = await createRequestContainer()
    const auth = await getAuthFromRequest(req)
    if (!auth?.tenantId) {
      return NextResponse.json({ error: t('freight_operations.errors.auth_required', 'Authentication required') }, { status: 401 })
    }
    const userId = auth.sub ?? auth.userId
    if (!userId) {
      return NextResponse.json({ error: t('freight_operations.errors.auth_required', 'Authentication required') }, { status: 401 })
    }
    const organizationScope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
    const organizationId = organizationScope?.selectedId ?? auth.orgId ?? null
    if (!organizationId) {
      return NextResponse.json(
        { error: t('freight_operations.errors.organization_required', 'Organization context is required') },
        { status: 400 },
      )
    }
    const scope = { tenantId: auth.tenantId, organizationId }
    const em = container.resolve('em') as EntityManager
    const driver = await resolveDriverForUser(em, scope, userId)
    if (!driver) {
      return NextResponse.json(
        { error: t('freight_operations.errors.driver_profile_missing', 'No driver record is linked to this user.') },
        { status: 403 },
      )
    }

    const attachmentService = container.resolve('attachmentService') as AttachmentServiceLike
    if (!attachmentService?.readUploadForm) {
      return NextResponse.json(
        { error: t('freight_operations.errors.driver_attachment_unavailable', 'Attachment uploads are unavailable.') },
        { status: 503 },
      )
    }
    attachmentService.validateUpload({ contentLength: req.headers.get('content-length') })
    const form = await attachmentService.readUploadForm(req)
    const targetKind = String(form.get('targetKind') ?? '')
    const targetId = String(form.get('targetId') ?? '')
    const fileValue = form.get('file')
    if (targetKind !== 'order' && targetKind !== 'trip') {
      return NextResponse.json(
        { error: t('freight_operations.errors.driver_attachment_target_required', 'Choose an order or trip for the attachment.') },
        { status: 400 },
      )
    }
    if (!z.string().uuid().safeParse(targetId).success) {
      return NextResponse.json(
        { error: t('freight_operations.errors.driver_attachment_target_invalid', 'The attachment target is invalid.') },
        { status: 400 },
      )
    }
    if (!fileValue || typeof fileValue === 'string') {
      return NextResponse.json(
        { error: t('freight_operations.errors.driver_attachment_file_required', 'Choose a file to upload.') },
        { status: 400 },
      )
    }

    let resourceKind: string
    if (targetKind === 'order') {
      const order = await em.findOne(FreightOrder, {
        id: targetId,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        deletedAt: null,
      })
      if (!order) return NextResponse.json({ error: t('freight_operations.errors.order_not_found', 'Freight order not found.') }, { status: 404 })
      if (order.driverId !== driver.id) {
        return NextResponse.json(
          { error: t('freight_operations.errors.driver_order_not_assigned', 'This order is not assigned to you.') },
          { status: 403 },
        )
      }
      resourceKind = FREIGHT_ORDER_ENTITY_ID
    } else {
      const trip = await em.findOne(FreightTrip, {
        id: targetId,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        deletedAt: null,
      })
      if (!trip) return NextResponse.json({ error: t('freight_operations.errors.trip_not_found', 'Freight trip not found.') }, { status: 404 })
      if (trip.driverId !== driver.id) {
        return NextResponse.json(
          { error: t('freight_operations.errors.driver_trip_not_assigned', 'This trip is not assigned to you.') },
          { status: 403 },
        )
      }
      resourceKind = FREIGHT_TRIP_ENTITY_ID
    }

    if (fileValue.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: t('freight_operations.errors.driver_attachment_too_large', 'The file exceeds the 10 MB limit.') },
        { status: 413 },
      )
    }
    const mimeType = fileValue.type || 'application/octet-stream'
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json(
        { error: t('freight_operations.errors.driver_attachment_type', 'Only JPEG, PNG, WebP and PDF files are allowed.') },
        { status: 400 },
      )
    }

    const guarded = await runRouteMutationGuards({
      container,
      req,
      auth: { userId, tenantId: scope.tenantId, organizationId: scope.organizationId },
      input: {
        resourceKind,
        resourceId: targetId,
        operation: 'update',
        mutationPayload: { attachmentUpload: true, targetKind, targetId },
      },
    })
    if (!guarded.ok) return guarded.response

    const attachment = await attachmentService.createScoped({
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      entityId: resourceKind,
      recordId: targetId,
      partitionCode: PARTITION_CODE,
      fileName: fileValue.name || 'proof',
      declaredMimeType: mimeType,
      buffer: Buffer.from(await fileValue.arrayBuffer()),
    })
    await guarded.runAfterSuccess()
    return NextResponse.json({ ok: true, item: attachment })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: err.issues }, { status: 400 })
    }
    logger.error('freight_operations.driver_attachment.failed', { err })
    return NextResponse.json({ error: 'Unable to upload the attachment' }, { status: 400 })
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Freight Operations',
  summary: 'Driver proof attachments',
  methods: {
    POST: {
      summary: 'Upload a proof-of-delivery or checklist attachment for an assigned order or trip',
      requestBody: {
        contentType: 'multipart/form-data',
        schema: z.object({
          targetKind: z.enum(['order', 'trip']),
          targetId: z.string().uuid(),
          file: z.unknown(),
        }),
      },
      responses: [
        {
          status: 200,
          description: 'Attachment uploaded',
          schema: z.object({
            ok: z.boolean(),
            item: z.object({
              id: z.string().uuid(),
              url: z.string(),
              fileName: z.string(),
              mimeType: z.string(),
              fileSize: z.number(),
            }),
          }),
        },
      ],
    },
  },
}
