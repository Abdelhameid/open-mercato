"use client"

import * as React from 'react'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'

const FALLBACK_WIDTH = 320
const SIGNATURE_HEIGHT = 160

export function SignaturePad({
  onChange,
  disabled,
}: {
  onChange: (file: File | null) => void
  disabled?: boolean
}) {
  const t = useT()
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const drawingRef = React.useRef(false)
  const inkRef = React.useRef(false)
  const [hasInk, setHasInk] = React.useState(false)

  const paintBackground = React.useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.save()
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.restore()
  }, [])

  const setup = React.useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const width = Math.max(1, Math.round(rect.width || FALLBACK_WIDTH))
    const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
    const snapshot = inkRef.current ? canvas.toDataURL('image/png') : null
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(SIGNATURE_HEIGHT * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111827'
    paintBackground(ctx, width, SIGNATURE_HEIGHT)
    if (snapshot) {
      const image = new Image()
      image.onload = () => ctx.drawImage(image, 0, 0, width, SIGNATURE_HEIGHT)
      image.src = snapshot
    }
  }, [paintBackground])

  React.useEffect(() => {
    setup()
    const canvas = canvasRef.current
    if (!canvas || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setup())
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [setup])

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const emit = React.useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas || !inkRef.current) {
      onChange(null)
      return
    }
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) {
      onChange(null)
      return
    }
    onChange(new File([blob], 'signature.png', { type: 'image/png' }))
  }, [onChange])

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return
    const canvas = event.currentTarget
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.setPointerCapture(event.pointerId)
    drawingRef.current = true
    const { x, y } = point(event)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || disabled) return
    const ctx = event.currentTarget.getContext('2d')
    if (!ctx) return
    const { x, y } = point(event)
    ctx.lineTo(x, y)
    ctx.stroke()
    if (!inkRef.current) {
      inkRef.current = true
      setHasInk(true)
    }
  }

  const finish = () => {
    if (!drawingRef.current) return
    drawingRef.current = false
    void emit()
  }

  const clear = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    paintBackground(ctx, rect.width, SIGNATURE_HEIGHT)
    inkRef.current = false
    setHasInk(false)
    onChange(null)
  }

  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvasRef}
        className="w-full touch-none rounded-md border border-input bg-white"
        style={{ height: SIGNATURE_HEIGHT }}
        aria-label={t('freight_operations.driver.signature', 'Signature')}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
        onPointerLeave={finish}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {hasInk
            ? t('freight_operations.driver.signatureReady', 'Signature captured.')
            : t('freight_operations.driver.signatureHint', 'Ask the receiver to sign above.')}
        </span>
        <Button type="button" variant="outline" size="sm" onClick={clear} disabled={disabled || !hasInk}>
          {t('freight_operations.driver.signatureClear', 'Clear signature')}
        </Button>
      </div>
    </div>
  )
}
