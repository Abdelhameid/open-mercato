import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import type { AuthContext } from '@open-mercato/shared/lib/auth/server'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import {
  FreightChecklistRun,
  FreightChecklistTemplate,
  type ChecklistRunItem,
  type ChecklistTemplateItem,
} from '../data/entities'
import type { ChecklistSubmissionInput } from '../data/validators'
import { raiseFreightError } from './errors'
import type { FreightScope } from './freightSettings'

export type ChecklistTemplateLike = {
  id: string
  name: string
  items: ChecklistTemplateItem[]
}

export type ChecklistValidationResult =
  | { ok: true; items: ChecklistRunItem[] }
  | {
      ok: false
      code:
        | 'checklist_template_mismatch'
        | 'checklist_unknown_item'
        | 'checklist_required'
        | 'checklist_attachment_required'
      itemKey?: string
    }

export type ChecklistRunTarget = {
  freightOrderId?: string | null
  freightTripId?: string | null
}

export type AttachmentTarget = {
  entityId: string
  recordId: string
}

type AttachmentTargetAccess = {
  canAccessLinkedTarget(input: {
    attachmentId: string
    tenantId: string
    organizationId: string
    auth: AuthContext
    targets: AttachmentTarget[]
  }): Promise<boolean>
}

export async function resolveDefaultChecklistTemplate(
  em: EntityManager,
  scope: FreightScope,
): Promise<FreightChecklistTemplate | null> {
  return em.findOne(
    FreightChecklistTemplate,
    {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      isActive: true,
      isDefault: true,
      deletedAt: null,
    },
    { orderBy: { updatedAt: 'desc' } },
  )
}

export function buildChecklistWorkPayload(template: ChecklistTemplateLike) {
  return {
    templateId: template.id,
    name: template.name,
    items: (template.items ?? []).map((item) => ({
      key: item.key,
      label: item.label,
      description: item.description ?? null,
      required: item.required,
      requiresAttachment: item.requiresAttachment,
    })),
  }
}

export function validateChecklistSubmission(
  template: ChecklistTemplateLike,
  submission: ChecklistSubmissionInput,
): ChecklistValidationResult {
  if (submission.templateId !== template.id) {
    return { ok: false, code: 'checklist_template_mismatch' }
  }
  const templateItems = template.items ?? []
  const knownKeys = new Set(templateItems.map((item) => item.key))
  const answers = new Map(submission.items.map((item) => [item.key, item]))
  for (const key of answers.keys()) {
    if (!knownKeys.has(key)) return { ok: false, code: 'checklist_unknown_item', itemKey: key }
  }
  const items: ChecklistRunItem[] = []
  for (const item of templateItems) {
    const answer = answers.get(item.key)
    const checked = answer?.checked === true
    if (item.required && !checked) {
      return { ok: false, code: 'checklist_required', itemKey: item.key }
    }
    if (item.requiresAttachment && !answer?.attachmentId) {
      return { ok: false, code: 'checklist_attachment_required', itemKey: item.key }
    }
    items.push({
      key: item.key,
      label: item.label,
      description: item.description ?? null,
      required: item.required,
      requiresAttachment: item.requiresAttachment,
      checked,
      attachmentId: answer?.attachmentId ?? null,
      notes: answer?.notes ?? null,
    })
  }
  return { ok: true, items }
}

export async function normalizeChecklistSubmission(
  template: ChecklistTemplateLike,
  submission: ChecklistSubmissionInput,
): Promise<ChecklistRunItem[]> {
  const result = validateChecklistSubmission(template, submission)
  if (!result.ok) {
    const messages: Record<typeof result.code, string> = {
      checklist_template_mismatch: 'The checklist template no longer matches the active template.',
      checklist_unknown_item: 'The checklist contains an unknown item.',
      checklist_required: 'All required checklist items must be completed.',
      checklist_attachment_required: 'Every attachment-required checklist item needs a file.',
    }
    return raiseFreightError(409, result.code, messages[result.code])
  }
  return result.items
}

export function buildChecklistRunSnapshot(template: ChecklistTemplateLike) {
  return {
    id: template.id,
    name: template.name,
    items: (template.items ?? []).map((item) => ({
      key: item.key,
      label: item.label,
      description: item.description ?? null,
      required: item.required,
      requiresAttachment: item.requiresAttachment,
    })),
  }
}

export async function upsertChecklistRun(
  em: EntityManager,
  scope: FreightScope,
  target: ChecklistRunTarget,
  template: ChecklistTemplateLike,
  items: ChecklistRunItem[],
  driverId: string | null,
  actorUserId: string | null,
): Promise<FreightChecklistRun> {
  const where = (target.freightOrderId
    ? { tenantId: scope.tenantId, organizationId: scope.organizationId, freightOrderId: target.freightOrderId, deletedAt: null }
    : { tenantId: scope.tenantId, organizationId: scope.organizationId, freightTripId: target.freightTripId ?? null, deletedAt: null }) as FilterQuery<FreightChecklistRun>
  const existing = await em.findOne(FreightChecklistRun, where)
  const now = new Date()
  if (existing) {
    existing.templateId = template.id
    existing.templateNameSnapshot = template.name
    existing.templateSnapshot = buildChecklistRunSnapshot(template)
    existing.items = items
    existing.status = 'completed'
    existing.completedAt = now
    existing.driverId = driverId
    existing.updatedAt = now
    await em.persist(existing)
    return existing
  }
  const run = em.create(FreightChecklistRun, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    freightOrderId: target.freightOrderId ?? null,
    freightTripId: target.freightTripId ?? null,
    templateId: template.id,
    templateNameSnapshot: template.name,
    templateSnapshot: buildChecklistRunSnapshot(template),
    items,
    status: 'completed',
    completedAt: now,
    driverId,
    createdBy: actorUserId,
  })
  await em.persist(run)
  return run
}

export async function recordDeliveryChecklist(
  ctx: CommandRuntimeContext,
  em: EntityManager,
  scope: FreightScope,
  target: ChecklistRunTarget,
  attachmentTarget: AttachmentTarget,
  submission: ChecklistSubmissionInput | null | undefined,
  options: {
    enforce: boolean
    driverId: string | null
    actorUserId: string | null
    extraAttachmentIds?: Array<string | null | undefined>
  },
): Promise<FreightChecklistRun | null> {
  const template = await resolveDefaultChecklistTemplate(em, scope)
  const extraAttachmentIds = options.extraAttachmentIds ?? []
  if (!template) {
    if (submission) {
      return raiseFreightError(409, 'checklist_template_unavailable', 'No active checklist template is configured.')
    }
    await assertScopedAttachments(ctx, scope, attachmentTarget, extraAttachmentIds)
    return null
  }
  if (!submission) {
    if (options.enforce) {
      return raiseFreightError(409, 'checklist_required', 'Complete the delivery checklist before recording delivery.')
    }
    await assertScopedAttachments(ctx, scope, attachmentTarget, extraAttachmentIds)
    return null
  }
  const items = await normalizeChecklistSubmission(template, submission)
  await assertScopedAttachments(ctx, scope, attachmentTarget, [
    ...extraAttachmentIds,
    ...items.map((item) => item.attachmentId),
  ])
  return upsertChecklistRun(
    em,
    scope,
    target,
    template,
    items,
    options.driverId,
    options.actorUserId,
  )
}

export async function assertScopedAttachments(
  ctx: CommandRuntimeContext,
  scope: FreightScope,
  target: AttachmentTarget,
  attachmentIds: Array<string | null | undefined>,
): Promise<void> {
  const unique = Array.from(new Set(attachmentIds.filter((id): id is string => typeof id === 'string' && id.length > 0)))
  if (!unique.length) return
  let service: AttachmentTargetAccess | null = null
  try {
    service = ctx.container.resolve('attachmentTargetAccessService') as AttachmentTargetAccess
  } catch {
    service = null
  }
  if (!service) {
    return raiseFreightError(503, 'attachments_unavailable', 'Attachment verification is unavailable.')
  }
  for (const attachmentId of unique) {
    const allowed = await service.canAccessLinkedTarget({
      attachmentId,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      auth: ctx.auth as unknown as AuthContext,
      targets: [target],
    })
    if (!allowed) {
      return raiseFreightError(409, 'attachment_not_verified', 'The attached proof document could not be verified.')
    }
  }
}
