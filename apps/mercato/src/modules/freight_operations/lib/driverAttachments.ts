import { apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'

const UPLOAD_API = '/api/freight_operations/driver/attachments'

export type DriverAttachmentTarget = {
  kind: 'order' | 'trip'
  id: string
}

export type UploadedDriverAttachment = {
  id: string
  url?: string
  fileName?: string
  mimeType?: string
  fileSize?: number
}

export async function uploadDriverAttachment(
  target: DriverAttachmentTarget,
  file: File,
  errorMessage?: string,
): Promise<UploadedDriverAttachment> {
  const formData = new FormData()
  formData.set('targetKind', target.kind)
  formData.set('targetId', target.id)
  formData.set('file', file, file.name || 'proof')
  const call = await apiCallOrThrow<{ item?: UploadedDriverAttachment }>(
    UPLOAD_API,
    { method: 'POST', body: formData },
    { errorMessage: errorMessage ?? 'Unable to upload the attachment.' },
  )
  const item = call.result?.item
  if (!item?.id) throw new Error('[internal] Attachment upload returned no id.')
  return item
}
