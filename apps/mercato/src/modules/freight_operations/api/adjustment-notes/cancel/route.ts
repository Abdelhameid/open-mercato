import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { FREIGHT_ADJUSTMENT_NOTE_ENTITY_ID } from '../../../commands/entities'
import { executeFreightAction } from '../../../lib/apiAction'

const cancelSchema = z.object({ id: z.string().uuid() })

export const metadata = {
  path: '/freight_operations/adjustment-notes/cancel',
  POST: { requireAuth: true, requireFeatures: ['freight.adjustment_notes.manage'] },
}

export async function POST(req: Request) {
  return executeFreightAction<{ noteId: string }>(req, {
    parse: (raw) => cancelSchema.parse(raw),
    resourceKind: FREIGHT_ADJUSTMENT_NOTE_ENTITY_ID,
    resourceId: (input) => String(input.id),
    commandId: 'freight_operations.adjustment_notes.cancel',
    errorMessageKey: 'cancel_failed',
    errorFallback: 'Unable to cancel the adjustment note.',
    toResponse: (result) => ({ noteId: result.noteId }),
  })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Freight Operations',
  summary: 'Cancel a freight credit or debit note',
  methods: {
    POST: {
      summary: 'Reverse the note posting and mark it cancelled',
      requestBody: { contentType: 'application/json', schema: cancelSchema },
      responses: [{ status: 200, description: 'Note cancelled', schema: z.object({ ok: z.boolean(), noteId: z.string().uuid() }) }],
    },
  },
}
