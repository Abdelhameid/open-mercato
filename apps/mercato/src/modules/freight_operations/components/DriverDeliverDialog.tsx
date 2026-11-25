"use client"

import * as React from 'react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { Input } from '@open-mercato/ui/primitives/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { useDialogKeyHandler } from '@open-mercato/ui/hooks/useDialogKeyHandler'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { uploadDriverAttachment } from '../lib/driverAttachments'
import { ProofFilePicker } from './ProofFilePicker'
import { SignaturePad } from './SignaturePad'

export type DriverChecklistItem = {
  key: string
  label: string
  description?: string | null
  required: boolean
  requiresAttachment: boolean
}

export type DriverChecklistWork = {
  templateId: string
  name: string
  items: DriverChecklistItem[]
}

export type DeliverTarget = {
  kind: 'order' | 'trip'
  id: string
  label: string
  updatedAt?: string | null
}

export type DriverDeliverValues = {
  podReference?: string
  podDocumentId?: string
  podSignatureDocumentId?: string
  podReceivedByName?: string
  checklist?: {
    templateId: string
    items: Array<{ key: string; checked: boolean; attachmentId?: string }>
  }
}

export function DriverDeliverDialog({
  target,
  checklist,
  onOpenChange,
  onSubmit,
}: {
  target: DeliverTarget | null
  checklist: DriverChecklistWork | null
  onOpenChange: (open: boolean) => void
  onSubmit: (target: DeliverTarget, values: DriverDeliverValues) => void
}) {
  const t = useT()
  const open = target !== null
  const [checkedKeys, setCheckedKeys] = React.useState<Record<string, boolean>>({})
  const [itemFiles, setItemFiles] = React.useState<Record<string, File | null>>({})
  const [podReference, setPodReference] = React.useState('')
  const [receivedBy, setReceivedBy] = React.useState('')
  const [podFile, setPodFile] = React.useState<File | null>(null)
  const [signatureFile, setSignatureFile] = React.useState<File | null>(null)
  const [uploading, setUploading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setCheckedKeys({})
    setItemFiles({})
    setPodReference('')
    setReceivedBy('')
    setPodFile(null)
    setSignatureFile(null)
    setUploading(false)
    setError(null)
  }, [open, target?.id])

  const setChecked = (key: string, checked: boolean) => {
    setCheckedKeys((prev) => ({ ...prev, [key]: checked }))
  }

  const submit = React.useCallback(async () => {
    if (!target || uploading) return
    setError(null)
    if (checklist) {
      const missingItem = checklist.items.find((item) => item.required && checkedKeys[item.key] !== true)
      if (missingItem) {
        setError(t(
          'freight_operations.driver.checklistRequiredItem',
          'Complete the required checklist item "{item}".',
          { item: missingItem.label },
        ))
        return
      }
      const missingFile = checklist.items.find((item) => item.requiresAttachment && !itemFiles[item.key])
      if (missingFile) {
        setError(t(
          'freight_operations.driver.checklistAttachmentRequired',
          'Attach a file for the checklist item "{item}".',
          { item: missingFile.label },
        ))
        return
      }
    }
    if (!podReference.trim() && !podFile && !signatureFile) {
      setError(t(
        'freight_operations.driver.podEvidenceRequired',
        'Add a POD reference, a photo or a signature.',
      ))
      return
    }
    setUploading(true)
    try {
      const attachmentIds = new Map<string, string>()
      for (const item of checklist?.items ?? []) {
        const file = itemFiles[item.key]
        if (!file) continue
        const uploaded = await uploadDriverAttachment(target, file)
        attachmentIds.set(item.key, uploaded.id)
      }
      const podDocument = podFile ? await uploadDriverAttachment(target, podFile) : null
      const signatureDocument = signatureFile ? await uploadDriverAttachment(target, signatureFile) : null
      const values: DriverDeliverValues = {
        ...(podReference.trim() ? { podReference: podReference.trim() } : {}),
        ...(podDocument ? { podDocumentId: podDocument.id } : {}),
        ...(signatureDocument ? { podSignatureDocumentId: signatureDocument.id } : {}),
        ...(receivedBy.trim() ? { podReceivedByName: receivedBy.trim() } : {}),
        ...(checklist
          ? {
              checklist: {
                templateId: checklist.templateId,
                items: checklist.items.map((item) => ({
                  key: item.key,
                  checked: checkedKeys[item.key] === true,
                  ...(attachmentIds.get(item.key) ? { attachmentId: attachmentIds.get(item.key) } : {}),
                })),
              },
            }
          : {}),
      }
      onSubmit(target, values)
    } catch (caught) {
      setError(caught instanceof Error && caught.message
        ? caught.message
        : t('freight_operations.driver.uploadFailed', 'Unable to upload the proof.'))
    } finally {
      setUploading(false)
    }
  }, [checklist, checkedKeys, itemFiles, onSubmit, podFile, podReference, receivedBy, signatureFile, target, t, uploading])

  const handleKeyDown = useDialogKeyHandler({
    onConfirm: () => { void submit() },
    onCancel: () => onOpenChange(false),
    disabled: uploading,
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onKeyDown={handleKeyDown} className="max-h-screen overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('freight_operations.driver.deliverTitle', 'Record delivery')}</DialogTitle>
          <DialogDescription>
            {target
              ? t('freight_operations.driver.deliverDescription', 'Deliver {label} and record the proof of delivery.', { label: target.label })
              : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {checklist ? (
            <section className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{checklist.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t('freight_operations.driver.checklistHint', 'Complete every required item before delivering.')}
                </p>
              </div>
              {checklist.items.map((item) => (
                <div key={item.key} className="flex flex-col gap-2 rounded-md border border-border p-2">
                  <label className="flex items-start gap-2 text-sm">
                    <Checkbox
                      checked={checkedKeys[item.key] === true}
                      disabled={uploading}
                      onCheckedChange={(checked) => setChecked(item.key, checked === true)}
                    />
                    <span>
                      {item.label}
                      {item.required ? <span className="text-status-error-text"> *</span> : null}
                    </span>
                  </label>
                  {item.description ? (
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  ) : null}
                  {item.requiresAttachment ? (
                    <ProofFilePicker
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      label={t('freight_operations.driver.checklistAttach', 'Attach file')}
                      file={itemFiles[item.key] ?? null}
                      disabled={uploading}
                      onChange={(file) => setItemFiles((prev) => ({ ...prev, [item.key]: file }))}
                    />
                  ) : null}
                </div>
              ))}
            </section>
          ) : null}

          <section className="flex flex-col gap-3 rounded-lg border border-border p-3">
            <p className="text-sm font-semibold text-foreground">
              {t('freight_operations.driver.podTitle', 'Proof of delivery')}
            </p>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-foreground">{t('freight_operations.driver.podReference', 'POD reference')}</span>
              <Input
                value={podReference}
                disabled={uploading}
                onChange={(event) => setPodReference(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-foreground">{t('freight_operations.driver.receivedBy', 'Received by')}</span>
              <Input
                value={receivedBy}
                disabled={uploading}
                onChange={(event) => setReceivedBy(event.target.value)}
              />
            </label>
            <ProofFilePicker
              accept="image/jpeg,image/png,image/webp,application/pdf"
              capture="environment"
              label={t('freight_operations.driver.podPhoto', 'Take or choose a photo')}
              file={podFile}
              disabled={uploading}
              onChange={setPodFile}
            />
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-foreground">
                {t('freight_operations.driver.podSignature', 'Receiver signature')}
              </span>
              <SignaturePad onChange={setSignatureFile} disabled={uploading} />
            </div>
          </section>

          {error ? <p className="text-sm text-status-error-text">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button type="button" onClick={() => { void submit() }} disabled={uploading}>
            {uploading
              ? t('freight_operations.driver.uploadingProof', 'Uploading…')
              : t('freight_operations.driver.deliver', 'Deliver')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
