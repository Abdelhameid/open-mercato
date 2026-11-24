import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { FREIGHT_ADJUSTMENT_NOTE_ENTITY_ID } from '../../../commands/entities'
import { executeFreightAction } from '../../../lib/apiAction'

const issueSchema = z.object({ id: z.string().uuid() })

export const metadata = {
  path: '/freight_operations/adjustment-notes/issue',
  POST: { requireAuth: true, requireFeatures: ['freight.adjustment_notes.manage'] },
}

export async function POST(req: Request) {
  return executeFreightAction<{ noteId: string; noteNumber: string }>(req, {
    parse: (raw) => issueSchema.parse(raw),
    resourceKind: FREIGHT_ADJUSTMENT_NOTE_ENTITY_ID,
    resourceId: (input) => String(input.id),
    commandId: 'freight_operations.adjustment_notes.issue',
    errorMessageKey: 'issue_failed',
    errorFallback: 'Unable to issue the adjustment note.',
    toResponse: (result) => ({ noteId: result.noteId, noteNumber: result.noteNumber }),
  })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Freight Operations',
  summary: 'Issue a freight credit or debit note',
  methods: {
    POST: {
      summary: 'Assign the note number and post it to the ledger',
      requestBody: { contentType: 'application/json', schema: issueSchema },
      responses: [{ status: 200, description: 'Note issued', schema: z.object({ ok: z.boolean(), noteId: z.string().uuid(), noteNumber: z.string() }) }],
    },
  },
}
