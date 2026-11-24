import type { EntityManager } from '@mikro-orm/postgresql'

export type DriverIdentity = {
  id: string
  fullName: string
  phone: string
  status: string
}

type Scope = { tenantId: string; organizationId: string }

function isMissingRelationError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return message.includes('42P01') || /relation .* does not exist/i.test(message)
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

/**
 * Resolve the driver record linked to the authenticated staff user. HR owns the
 * person and licence, so freight reads `hr_employees` + `hr_driver_profiles` by
 * raw SQL with an explicit tenant/organization scope and tolerates the module
 * being absent – the same pattern as `transportReference.ts`.
 */
export async function resolveDriverForUser(
  em: EntityManager,
  scope: Scope,
  userId: string,
): Promise<DriverIdentity | null> {
  try {
    const rows = await em.getConnection().execute<Record<string, unknown>[]>(
      `select p.id, trim(e.first_name || ' ' || e.last_name) as full_name, e.phone,
              case
                when e.status in ('suspended', 'terminated') then 'suspended'
                when e.status = 'on_leave' then 'on_leave'
                else 'available'
              end as status
         from hr_driver_profiles p
         join hr_employees e on e.id = p.employee_id
        where p.tenant_id = ? and p.organization_id = ? and e.user_id = ?
          and p.deleted_at is null and e.deleted_at is null
        limit 1`,
      [scope.tenantId, scope.organizationId, userId],
    )
    const row = rows[0]
    if (!row) return null
    return {
      id: readString(row.id),
      fullName: readString(row.full_name),
      phone: readString(row.phone),
      status: readString(row.status),
    }
  } catch (err) {
    if (isMissingRelationError(err)) return null
    throw err
  }
}
