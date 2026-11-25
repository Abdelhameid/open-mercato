import type { EntityData, EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import { enforceCommandOptimisticLockWithGuards } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { FreightChecklistTemplate, type ChecklistTemplateItem } from '../data/entities'
import { createChecklistTemplateSchema, updateChecklistTemplateSchema } from '../data/validators'
import { FREIGHT_CHECKLIST_TEMPLATE_ENTITY_ID, freightChecklistTemplateEvents, freightChecklistTemplateIndexer } from './entities'
import { registerCrudCommands, resolveScope, type CrudCommandConfig } from './crud'
import { raiseFreightError } from '../lib/errors'

function entityManager(ctx: CommandRuntimeContext): EntityManager {
  return (ctx.container.resolve('em') as EntityManager).fork()
}

async function assertNameAvailable(
  ctx: CommandRuntimeContext,
  scope: { tenantId: string; organizationId: string },
  name: string,
  excludeId?: string,
): Promise<void> {
  const em = entityManager(ctx)
  const existing = await em.findOne(FreightChecklistTemplate, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    name,
    deletedAt: null,
    ...(excludeId ? { id: { $ne: excludeId } } : {}),
  } as FilterQuery<FreightChecklistTemplate>)
  if (existing) {
    return raiseFreightError(409, 'checklist_template_name_taken', 'A checklist template with this name already exists.')
  }
}

async function clearOtherDefaults(
  ctx: CommandRuntimeContext,
  scope: { tenantId: string; organizationId: string },
  excludeId?: string,
): Promise<void> {
  const em = entityManager(ctx)
  const others = await em.find(FreightChecklistTemplate, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    isDefault: true,
    deletedAt: null,
    ...(excludeId ? { id: { $ne: excludeId } } : {}),
  } as FilterQuery<FreightChecklistTemplate>)
  if (!others.length) return
  const now = new Date()
  for (const other of others) {
    other.isDefault = false
    other.updatedAt = now
  }
  await em.flush()
}

const checklistTemplateCrudConfig: CrudCommandConfig<FreightChecklistTemplate> = {
  entity: FreightChecklistTemplate,
  entityId: FREIGHT_CHECKLIST_TEMPLATE_ENTITY_ID,
  resource: 'checklist_templates',
  createSchema: createChecklistTemplateSchema,
  updateSchema: updateChecklistTemplateSchema,
  toCreateData: (input) => ({
    name: String(input.name),
    description: (input.description as string | null | undefined) ?? null,
    items: (input.items as ChecklistTemplateItem[] | undefined) ?? [],
    isActive: input.isActive !== false,
    isDefault: input.isDefault === true,
  }) as EntityData<FreightChecklistTemplate>,
  toUpdateData: (input) => {
    const patch: Record<string, unknown> = {}
    if (input.name !== undefined) patch.name = input.name
    if (input.description !== undefined) patch.description = input.description
    if (input.items !== undefined) patch.items = input.items
    if (input.isActive !== undefined) patch.isActive = input.isActive
    if (input.isDefault !== undefined) patch.isDefault = input.isDefault
    return patch as EntityData<FreightChecklistTemplate>
  },
  events: freightChecklistTemplateEvents,
  indexer: freightChecklistTemplateIndexer,
  beforeCreate: async (input, scope, ctx) => {
    await assertNameAvailable(ctx, scope, String(input.name))
    if (input.isDefault === true) await clearOtherDefaults(ctx, scope)
  },
  beforeUpdate: async (input, current, scope, ctx) => {
    const template = current as FreightChecklistTemplate
    await enforceCommandOptimisticLockWithGuards(ctx.container, {
      resourceKind: FREIGHT_CHECKLIST_TEMPLATE_ENTITY_ID,
      resourceId: template.id,
      current: template.updatedAt,
      request: ctx.request ?? null,
    })
    if (input.name !== undefined) {
      await assertNameAvailable(ctx, scope, String(input.name), template.id)
    }
    if (input.isDefault === true) await clearOtherDefaults(ctx, scope, template.id)
  },
  beforeDelete: async (current, _scope, ctx) => {
    const template = current as FreightChecklistTemplate
    await enforceCommandOptimisticLockWithGuards(ctx.container, {
      resourceKind: FREIGHT_CHECKLIST_TEMPLATE_ENTITY_ID,
      resourceId: template.id,
      current: template.updatedAt,
      request: ctx.request ?? null,
    })
  },
}

registerCrudCommands(checklistTemplateCrudConfig)
