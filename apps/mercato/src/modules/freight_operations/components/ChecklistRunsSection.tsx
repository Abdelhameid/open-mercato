"use client"

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Circle, Paperclip } from 'lucide-react'
import { buildAttachmentFileUrl } from '@open-mercato/core/modules/attachments/lib/imageUrls'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { formatFreightDate } from './freightOptions'

type ChecklistRunItem = {
  key: string
  label: string
  description?: string | null
  required: boolean
  requiresAttachment: boolean
  checked: boolean
  attachmentId?: string | null
  notes?: string | null
}

type ChecklistRun = {
  id: string
  templateName: string
  items: ChecklistRunItem[]
  completedAt?: string | null
}

export function ChecklistRunsSection({
  orderId,
  tripId,
}: {
  orderId?: string
  tripId?: string
}) {
  const t = useT()
  const target = orderId ? `orderId=${encodeURIComponent(orderId)}` : tripId ? `tripId=${encodeURIComponent(tripId)}` : ''
  const query = useQuery({
    queryKey: ['freight-checklist-runs', orderId ?? null, tripId ?? null],
    queryFn: () => apiCall<{ runs?: ChecklistRun[] }>(`/api/freight_operations/checklist-runs?${target}`),
    enabled: Boolean(target),
  })

  const runs = query.data?.result?.runs ?? []
  if (!runs.length) return null

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold text-foreground">
        {t('freight_operations.checklist_runs.title', 'Delivery checklist')}
      </h2>
      <div className="flex flex-col gap-4">
        {runs.map((run) => (
          <div key={run.id} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-foreground">{run.templateName}</span>
              <span className="text-xs text-muted-foreground">
                {t('freight_operations.checklist_runs.completedAt', 'Completed {time}', {
                  time: formatFreightDate(run.completedAt ?? null),
                })}
              </span>
            </div>
            <ul className="flex flex-col gap-1">
              {run.items.map((item) => (
                <li key={item.key} className="flex flex-wrap items-center gap-2 text-sm">
                  {item.checked ? (
                    <CheckCircle2 aria-hidden className="size-4 text-status-success-text" />
                  ) : (
                    <Circle aria-hidden className="size-4 text-muted-foreground" />
                  )}
                  <span className={item.checked ? 'text-foreground' : 'text-muted-foreground'}>{item.label}</span>
                  {item.attachmentId ? (
                    <a
                      href={buildAttachmentFileUrl(item.attachmentId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
                    >
                      <Paperclip aria-hidden className="size-3.5" />
                      {t('freight_operations.checklist_runs.attachment', 'Attachment')}
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
