import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandBus, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { HrDriverProfile, HrEmployee, type EmployeeStatus } from '../data/entities'
import {
  createDriverRosterSchema,
  updateDriverRosterSchema,
  type DriverRosterStatus,
} from '../data/validators'
import { raiseHrError } from '../lib/errors'
import { scopeFrom } from './hr'

/**
 * Driver roster commands.
 *
 * HR owns the person (`hr_employees`) and the licence (`hr_driver_profiles`).
 * The transport API and its bulk importer call these commands instead of
 * writing a second driver register, so both surfaces share the HR uniqueness
 * rules, event stream and audit trail.
 */

type RosterScope = { tenantId: string; organizationId: string }

export type DriverRosterResult = {
  id: string
  employeeId: string
  updatedAt: string | null
}

export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim()
  const space = trimmed.indexOf(' ')
  if (space <= 0) return { firstName: trimmed, lastName: '-' }
  const firstName = trimmed.slice(0, space)
  const lastName = trimmed.slice(space + 1).trim()
  return { firstName, lastName: lastName.length > 0 ? lastName : '-' }
}

export function mapDriverStatusToEmployeeStatus(status: DriverRosterStatus | undefined): EmployeeStatus {
  if (status === 'suspended') return 'suspended'
  if (status === 'on_leave') return 'on_leave'
  return 'active'
}

async function findEmployee(
  em: EntityManager,
  scope: RosterScope,
  input: { employeeId?: string | null; nationalId?: string },
): Promise<HrEmployee | null> {
  if (input.employeeId) {
    return em.findOne(HrEmployee, {
      id: input.employeeId,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      deletedAt: null,
    })
  }
  if (!input.nationalId) return null
  return em.findOne(HrEmployee, {
    nationalId: input.nationalId,
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    deletedAt: null,
  })
}

function commandBusFrom(ctx: CommandRuntimeContext): CommandBus {
  return ctx.container.resolve('commandBus') as CommandBus
}

const createDriverRosterCommand: CommandHandler<Record<string, unknown>, DriverRosterResult> = {
  id: 'hr_management.driver_roster.create',
  async execute(raw, ctx) {
    const input = createDriverRosterSchema.parse(raw)
    const scope = scopeFrom(ctx)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const commandBus = commandBusFrom(ctx)

    let employee = await findEmployee(em, scope, input)
    let createdEmployee = false
    if (!employee) {
      const { firstName, lastName } = splitFullName(input.fullName)
      const created = await commandBus.execute<Record<string, unknown>, HrEmployee>(
        'hr_management.employees.create',
        {
          input: {
            employeeNumber: `DRV-${randomUUID()}`,
            firstName,
            lastName,
            nationalId: input.nationalId,
            jobTitle: 'Driver',
            employmentType: 'full_time',
            status: mapDriverStatusToEmployeeStatus(input.status),
            hireDate: new Date().toISOString(),
            phone: input.phone,
            ...(input.userId ? { userId: input.userId } : {}),
          },
          ctx,
        },
      )
      employee = created.result
      createdEmployee = true
    }

    try {
      const createdProfile = await commandBus.execute<Record<string, unknown>, HrDriverProfile>(
        'hr_management.driver_profiles.create',
        {
          input: {
            employeeId: employee.id,
            licenseNumber: input.licenseNumber,
            licenseExpiry: input.licenseExpiry,
          },
          ctx,
        },
      )
      const profile = createdProfile.result
      return {
        id: profile.id,
        employeeId: employee.id,
        updatedAt: profile.updatedAt instanceof Date ? profile.updatedAt.toISOString() : null,
      }
    } catch (err) {
      if (createdEmployee) {
        await commandBus.execute('hr_management.employees.delete', {
          input: { id: employee.id },
          ctx,
        }).catch(() => undefined)
      }
      throw err
    }
  },
  buildLog: ({ result, ctx }) => {
    const scope = scopeFrom(ctx)
    return {
      actionLabel: 'Create driver roster entry',
      resourceKind: 'hr_management:hr_driver_profile',
      resourceId: result.id,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
    }
  },
}

const updateDriverRosterCommand: CommandHandler<Record<string, unknown>, DriverRosterResult> = {
  id: 'hr_management.driver_roster.update',
  async execute(raw, ctx) {
    const input = updateDriverRosterSchema.parse(raw)
    const scope = scopeFrom(ctx)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const commandBus = commandBusFrom(ctx)

    const profile = await em.findOne(HrDriverProfile, {
      id: input.id,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      deletedAt: null,
    })
    if (!profile) return raiseHrError(404, 'driver_not_found', 'Driver not found.')
    const employee = await em.findOne(HrEmployee, {
      id: input.employeeId ?? profile.employeeId,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      deletedAt: null,
    })
    if (!employee) return raiseHrError(404, 'employee_not_found', 'The driver has no HR person record.')

    const employeePatch: Record<string, unknown> = {}
    if (input.fullName !== undefined) Object.assign(employeePatch, splitFullName(input.fullName))
    if (input.nationalId !== undefined) employeePatch.nationalId = input.nationalId
    if (input.phone !== undefined) employeePatch.phone = input.phone
    if (input.userId !== undefined) employeePatch.userId = input.userId
    if (input.status !== undefined) employeePatch.status = mapDriverStatusToEmployeeStatus(input.status)
    if (input.employeeId !== undefined) employeePatch.id = employee.id

    if (Object.keys(employeePatch).length > 0) {
      await commandBus.execute('hr_management.employees.update', {
        input: { id: employee.id, ...employeePatch },
        ctx,
      })
    }

    const profilePatch: Record<string, unknown> = { id: profile.id }
    if (input.employeeId !== undefined) profilePatch.employeeId = input.employeeId
    if (input.licenseNumber !== undefined) profilePatch.licenseNumber = input.licenseNumber
    if (input.licenseExpiry !== undefined) profilePatch.licenseExpiry = input.licenseExpiry
    if (Object.keys(profilePatch).length > 1) {
      await commandBus.execute('hr_management.driver_profiles.update', {
        input: profilePatch,
        ctx,
      })
    }

    return {
      id: profile.id,
      employeeId: employee.id,
      updatedAt: new Date().toISOString(),
    }
  },
  buildLog: ({ input, ctx }) => {
    const scope = scopeFrom(ctx)
    return {
      actionLabel: 'Update driver roster entry',
      resourceKind: 'hr_management:hr_driver_profile',
      resourceId: String(input.id ?? ''),
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
    }
  },
}

const deleteDriverRosterCommand: CommandHandler<Record<string, unknown>, { id: string }> = {
  id: 'hr_management.driver_roster.delete',
  async execute(raw, ctx) {
    const input = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
    const id = typeof input.id === 'string' ? input.id : null
    if (!id) return raiseHrError(400, 'record_id_required', 'Record id is required.')
    const commandBus = commandBusFrom(ctx)
    const result = await commandBus.execute<Record<string, unknown>, { id: string }>(
      'hr_management.driver_profiles.delete',
      { input: { id }, ctx },
    )
    return result.result
  },
  buildLog: ({ input, ctx }) => {
    const scope = scopeFrom(ctx)
    return {
      actionLabel: 'Delete driver roster entry',
      resourceKind: 'hr_management:hr_driver_profile',
      resourceId: String(input.id ?? ''),
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
    }
  },
}

registerCommand(createDriverRosterCommand)
registerCommand(updateDriverRosterCommand)
registerCommand(deleteDriverRosterCommand)
