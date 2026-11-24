import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { FreightDeliveryNote } from '../../../data/entities'

const logger = createLogger('freight_operations')

export const metadata = {
  path: '/freight_operations/public/delivery-note',
  GET: { requireAuth: false },
}

function snapshotString(snapshot: unknown, key: string): string | null {
  if (!snapshot || typeof snapshot !== 'object') return null
  const value = (snapshot as Record<string, unknown>)[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

/**
 * Public, read-only view of an issued/delivered delivery note. The opaque share
 * token is the authorization; the projection is deliberately limited to what a
 * consignee needs to confirm the document (no ids, prices, phone numbers or
 * addresses from the internal record).
 */
export async function GET(req: Request) {
  try {
    const token = new URL(req.url).searchParams.get('token')?.trim()
    if (!token) return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    const container = await createRequestContainer()
    const em = container.resolve('em') as EntityManager
    const note = await em.findOne(FreightDeliveryNote, {
      shareToken: token,
      status: { $in: ['issued', 'delivered'] },
      deletedAt: null,
    })
    if (!note) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

    const body = {
      noteNumber: note.noteNumber,
      status: note.status,
      sellerName: snapshotString(note.sellerSnapshot, 'sellerName'),
      customerName: snapshotString(note.customerSnapshot, 'displayName'),
      consigneeName: note.consigneeName ?? null,
      orderNumber: note.orderNumberSnapshot ?? null,
      tripNumber: note.tripNumberSnapshot ?? null,
      origin: note.origin,
      destination: note.destination,
      cargoDescription: note.cargoDescription,
      cargoQuantity: note.cargoQuantity ?? null,
      cargoUnit: note.cargoUnit ?? null,
      cargoWeightKg: note.cargoWeightKg ?? null,
      cargoVolumeM3: note.cargoVolumeM3 ?? null,
      cargoHazardous: note.cargoHazardous,
      cargoRefrigerated: note.cargoRefrigerated,
      sealNumber: note.sealNumber ?? null,
      driverName: snapshotString(note.driverSnapshot, 'fullName'),
      vehiclePlate: snapshotString(note.vehicleSnapshot, 'plateNumber'),
      issuedAt: note.issuedAt ?? null,
      deliveredAt: note.deliveredAt ?? null,
      receivedByName: note.receivedByName ?? null,
      podReference: note.podReference ?? null,
      updatedAt: note.updatedAt ?? null,
    }
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    logger.error('freight_operations.public_delivery_note.failed', { err })
    return NextResponse.json({ error: 'Unable to load the document' }, { status: 500 })
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Freight Operations',
  summary: 'Public delivery note by share token',
  methods: {
    GET: {
      summary: 'Read the non-sensitive fields of a shared delivery note',
      responses: [{
        status: 200,
        description: 'Delivery note document',
        schema: z.object({
          noteNumber: z.string(),
          status: z.string(),
          sellerName: z.string().nullable().optional(),
          customerName: z.string().nullable().optional(),
          consigneeName: z.string().nullable().optional(),
          orderNumber: z.string().nullable().optional(),
          tripNumber: z.string().nullable().optional(),
          origin: z.string(),
          destination: z.string(),
          cargoDescription: z.string(),
          cargoQuantity: z.string().nullable().optional(),
          cargoUnit: z.string().nullable().optional(),
          cargoWeightKg: z.string().nullable().optional(),
          cargoVolumeM3: z.string().nullable().optional(),
          cargoHazardous: z.boolean(),
          cargoRefrigerated: z.boolean(),
          sealNumber: z.string().nullable().optional(),
          driverName: z.string().nullable().optional(),
          vehiclePlate: z.string().nullable().optional(),
          issuedAt: z.string().nullable().optional(),
          deliveredAt: z.string().nullable().optional(),
          receivedByName: z.string().nullable().optional(),
          podReference: z.string().nullable().optional(),
          updatedAt: z.string().nullable().optional(),
        }),
      }],
    },
  },
}
