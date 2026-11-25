"use client"

import * as React from 'react'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'

export function ProofFilePicker({
  accept,
  capture,
  label,
  file,
  disabled,
  onChange,
}: {
  accept: string
  capture?: 'environment'
  label: string
  file: File | null
  disabled?: boolean
  onChange: (file: File | null) => void
}) {
  const t = useT()
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        {label}
      </Button>
      {file ? (
        <>
          <span className="max-w-48 truncate text-xs text-muted-foreground">{file.name}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => {
              onChange(null)
              if (inputRef.current) inputRef.current.value = ''
            }}
          >
            {t('common.remove', 'Remove')}
          </Button>
        </>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={accept}
        capture={capture}
        disabled={disabled}
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
    </div>
  )
}
