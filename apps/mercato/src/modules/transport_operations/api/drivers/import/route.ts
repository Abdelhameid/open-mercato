import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { createDriverSchema } from '../../../data/validators'
import { importBodySchema, importResponseSchema, runTransportImport } from '../../../lib/importRoute'

export const metadata = {
  path: '/transport_operations/drivers/import',
  POST: { requireAuth: true, requireFeatures: ['transport.write'] },
}

export async function POST(req: Request): Promise<Response> {
  return runTransportImport(req, {
    resourceKind: 'hr_management:hr_driver_profile',
    resourceId: 'import:drivers',
    // HR owns the register: the importer creates a person record and a driver profile.
    commandId: 'hr_management.driver_roster.create',
    schema: createDriverSchema,
    failureKey: 'transport_operations.errors.import_row_failed',
    failureFallback: 'The driver could not be imported.',
    logEvent: 'transport_operations.driver_import.failed',
  })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Transport Operations',
  summary: 'Import drivers from a spreadsheet',
  methods: {
    POST: {
      summary: 'Validate (dry-run) or commit a batch of drivers',
      requestBody: { contentType: 'application/json', schema: importBodySchema },
      responses: [{
        status: 200,
        description: 'Per-row validation or creation report',
        schema: importResponseSchema,
      }],
    },
  },
}
