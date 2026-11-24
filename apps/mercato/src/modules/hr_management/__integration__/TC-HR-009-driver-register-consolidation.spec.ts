import { expect, test, type APIRequestContext } from '@playwright/test'
import { apiRequest, getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { readJsonSafe } from '@open-mercato/core/helpers/integration/generalFixtures'

export const integrationMeta = {
  dependsOnModules: ['hr_management', 'transport_operations'],
}

/**
 * TC-HR-009: the transport driver surface and the HR driver register are one
 * record. Creating a driver from transport creates an HR person + profile;
 * licence and employment-status changes are visible from both surfaces;
 * deleting the profile removes it from both.
 */

const TRANSPORT_DRIVERS = '/api/transport_operations/drivers'
const HR_DRIVERS = '/api/hr_management/driver-profiles'
const HR_EMPLOYEES = '/api/hr_management/employees'

let fixtureCounter = 0
function uniqueSuffix(): string {
  fixtureCounter += 1
  return `${Date.now()}-${fixtureCounter}`
}

type ListPayload<T> = { items?: T[]; total?: number }

async function listOne<T>(
  request: APIRequestContext,
  token: string,
  path: string,
  params: Record<string, string>,
): Promise<T | null> {
  const query = new URLSearchParams(params).toString()
  const response = await apiRequest(request, 'GET', `${path}?${query}`, { token })
  expect(response.ok(), `GET ${path} failed with ${response.status()}`).toBeTruthy()
  const payload = await readJsonSafe<ListPayload<T>>(response)
  return payload?.items?.[0] ?? null
}

test.describe('TC-HR-009: HR owns the driver register', () => {
  test('one person record backs both the HR and transport driver lists', async ({ request }) => {
    const token = await getAuthToken(request)
    const suffix = uniqueSuffix()
    const nationalId = `DRVQA-${suffix}`
    const licenseNumber = `DRVLIC-${suffix}`

    let profileId: string | null = null
    let employeeId: string | null = null

    try {
      const created = await apiRequest(request, 'POST', TRANSPORT_DRIVERS, {
        token,
        data: {
          fullName: `QA Driver ${suffix}`,
          nationalId,
          licenseNumber,
          licenseExpiry: '2029-06-30',
          phone: '+966500000009',
          status: 'available',
        },
      })
      const createdBody = await readJsonSafe<{ id?: string }>(created)
      expect(created.ok(), `driver create failed with ${created.status()}`).toBeTruthy()
      profileId = createdBody?.id ?? null
      expect(profileId).toBeTruthy()

      // The employee list searches names/numbers, not the national id; the
      // generated last name (`Driver <suffix>`) is unique per run.
      const employee = await listOne<{ id: string; national_id: string }>(request, token, HR_EMPLOYEES, {
        search: suffix,
        pageSize: '10',
      })
      expect(employee?.national_id).toBe(nationalId)
      employeeId = employee?.id ?? null
      expect(employeeId).toBeTruthy()

      const profile = await listOne<{ id: string; employee_id: string; license_number: string }>(request, token, HR_DRIVERS, {
        ids: String(profileId),
        pageSize: '1',
      })
      expect(profile?.employee_id).toBe(employeeId)
      expect(profile?.license_number).toBe(licenseNumber)

      const transportRow = await listOne<{ id: string; employee_id: string; full_name: string; status: string }>(
        request, token, TRANSPORT_DRIVERS, { ids: String(profileId), pageSize: '1' },
      )
      expect(transportRow?.employee_id).toBe(employeeId)
      expect(transportRow?.full_name).toBe(`QA Driver ${suffix}`)
      expect(transportRow?.status).toBe('available')

      const suspended = await apiRequest(request, 'PUT', TRANSPORT_DRIVERS, {
        token,
        data: { id: profileId, status: 'suspended', licenseExpiry: '2030-01-01' },
      })
      expect(suspended.ok(), `driver update failed with ${suspended.status()}`).toBeTruthy()

      const suspendedTransport = await listOne<{ status: string }>(request, token, TRANSPORT_DRIVERS, {
        ids: String(profileId), pageSize: '1',
      })
      expect(suspendedTransport?.status).toBe('suspended')

      const suspendedEmployee = await listOne<{ id: string; status: string }>(request, token, HR_EMPLOYEES, {
        ids: String(employeeId), pageSize: '1',
      })
      expect(suspendedEmployee?.status).toBe('suspended')

      const updatedProfile = await listOne<{ license_expiry: string }>(request, token, HR_DRIVERS, {
        ids: String(profileId), pageSize: '1',
      })
      expect(String(updatedProfile?.license_expiry)).toContain('2030-01-01')

      const deleted = await apiRequest(request, 'DELETE', TRANSPORT_DRIVERS, {
        token,
        data: { id: profileId },
      })
      expect(deleted.ok(), `driver delete failed with ${deleted.status()}`).toBeTruthy()

      const transportAfterDelete = await listOne(request, token, TRANSPORT_DRIVERS, { ids: String(profileId), pageSize: '1' })
      const hrAfterDelete = await listOne(request, token, HR_DRIVERS, { ids: String(profileId), pageSize: '1' })
      expect(transportAfterDelete).toBeNull()
      expect(hrAfterDelete).toBeNull()
    } finally {
      if (profileId) {
        await apiRequest(request, 'DELETE', TRANSPORT_DRIVERS, { token, data: { id: profileId } }).catch(() => undefined)
      }
      if (employeeId) {
        await apiRequest(request, 'DELETE', HR_EMPLOYEES, { token, data: { id: employeeId } }).catch(() => undefined)
      }
    }
  })
})
