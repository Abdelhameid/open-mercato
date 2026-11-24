import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { deliveryNoteActionSchema } from '../../../data/validators'
import { FREIGHT_DELIVERY_NOTE_ENTITY_ID } from '../../../commands/entities'
import { executeFreightAction } from '../../../lib/apiAction'

export const metadata = {
  path: '/freight_operations/delivery-notes/share',
  POST: { requireAuth: true, requireFeatures: ['freight.delivery_notes.manage'] },
}

export async function POST(req: Request) {
  return executeFreightAction<{ deliveryNoteId: string; token: string }>(req, {
    parse: (raw) => deliveryNoteActionSchema.parse(raw),
    resourceKind: FREIGHT_DELIVERY_NOTE_ENTITY_ID,
    resourceId: (input) => String(input.id),
    commandId: 'freight_operations.delivery_notes.share',
    errorMessageKey: 'share_failed',
    errorFallback: 'Unable to create the share link.',
    toResponse: (result) => ({
      noteId: result.deliveryNoteId,
      token: result.token,
      path: `/track/note/${result.token}`,
    }),
  })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Freight Operations',
  summary: 'Create or reuse a public delivery-note share link',
  methods: {
    POST: {
      summary: 'Returns the opaque public token for an issued or delivered note',
      requestBody: { contentType: 'application/json', schema: deliveryNoteActionSchema },
      responses: [{
        status: 200,
        description: 'Share token',
        schema: z.object({
          ok: z.boolean(),
          noteId: z.string().uuid(),
          token: z.string(),
          path: z.string(),
        }),
      }],
    },
  },
}
