import { buildLines } from '../freightAdjustment'

const accounts = {
  receivable: { id: 'ar' },
  revenue: { id: 'rev' },
  outputVat: { id: 'vat' },
}

const base = {
  tenantId: '00000000-0000-0000-0000-000000000001',
  organizationId: '00000000-0000-0000-0000-000000000002',
  sourceEntityId: '00000000-0000-0000-0000-000000000003',
  noteNumber: 'AN-00001',
  operation: 'upsert' as const,
  currencyCode: 'SAR',
  postingDate: '2026-11-23T00:00:00.000Z',
  netAmount: '100.00',
  taxAmount: '15.00',
  grossAmount: '115.00',
  description: 'Freight credit note AN-00001',
}

describe('freight adjustment posting lines', () => {
  it('posts a credit note as revenue/VAT debit against the receivable', () => {
    const lines = buildLines({ ...base, noteType: 'credit' }, accounts)
    expect(lines).toEqual([
      { accountId: 'rev', debitAmount: '100.00', creditAmount: '0', description: base.description, taxCode: null },
      { accountId: 'vat', debitAmount: '15.00', creditAmount: '0', description: base.description, taxCode: null },
      { accountId: 'ar', debitAmount: '0', creditAmount: '115.00', description: base.description, taxCode: null },
    ])
  })

  it('posts a debit note as a receivable debit against revenue/VAT', () => {
    const lines = buildLines({ ...base, noteType: 'debit' }, accounts)
    expect(lines).toEqual([
      { accountId: 'ar', debitAmount: '115.00', creditAmount: '0', description: base.description, taxCode: null },
      { accountId: 'rev', debitAmount: '0', creditAmount: '100.00', description: base.description, taxCode: null },
      { accountId: 'vat', debitAmount: '0', creditAmount: '15.00', description: base.description, taxCode: null },
    ])
  })

  it('drops zero-value lines', () => {
    const lines = buildLines(
      { ...base, noteType: 'credit', taxAmount: '0', grossAmount: '100.00' },
      accounts,
    )
    expect(lines.map((line) => line.accountId)).toEqual(['rev', 'ar'])
  })
})
