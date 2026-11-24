import { applyOdometerReading } from '../odometerSync'

function makeContext() {
  const execute = jest.fn().mockResolvedValue([])
  const em = { fork: () => ({ getConnection: () => ({ execute }) }) }
  return { ctx: { resolve: jest.fn().mockReturnValue(em) }, execute }
}

describe('odometer register sync', () => {
  it('advances the register with the observed reading', async () => {
    const { ctx, execute } = makeContext()
    await applyOdometerReading(
      { vehicleId: 'vehicle-1', tenantId: 'tenant-1', organizationId: 'org-1', odometer: 1234.9 },
      ctx,
    )
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute.mock.calls[0][1]).toEqual([1234, expect.any(Date), 'vehicle-1', 'tenant-1', 'org-1'])
  })

  it('skips incomplete payloads and invalid readings', async () => {
    const { ctx, execute } = makeContext()
    await applyOdometerReading({ vehicleId: 'vehicle-1', odometer: 10 }, { ...ctx, tenantId: null, organizationId: null })
    await applyOdometerReading({ vehicleId: 'vehicle-1', tenantId: 't', organizationId: 'o', odometer: -2 }, ctx)
    await applyOdometerReading({ vehicleId: 'vehicle-1', tenantId: 't', organizationId: 'o', odometer: 'not-a-number' }, ctx)
    expect(execute).not.toHaveBeenCalled()
  })

  it('falls back to the subscriber tenant scope when the payload omits it', async () => {
    const { ctx, execute } = makeContext()
    await applyOdometerReading(
      { vehicleId: 'vehicle-1', odometer: 50 },
      { ...ctx, tenantId: 'trusted-tenant', organizationId: 'trusted-org' },
    )
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute.mock.calls[0][1].slice(2)).toEqual(['vehicle-1', 'trusted-tenant', 'trusted-org'])
  })
})
