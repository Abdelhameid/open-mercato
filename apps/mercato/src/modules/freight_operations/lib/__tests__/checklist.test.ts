/** @jest-environment node */
import { buildChecklistRunSnapshot, buildChecklistWorkPayload, validateChecklistSubmission } from '../checklist'

const template = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Delivery checklist',
  items: [
    { key: 'seal', label: 'Seal intact', required: true, requiresAttachment: false },
    { key: 'photo', label: 'Cargo photo', required: true, requiresAttachment: true },
    { key: 'notes', label: 'Notes', required: false, requiresAttachment: false },
  ],
}

const submission = (overrides: Record<string, unknown> = {}) => ({
  templateId: template.id,
  items: [
    { key: 'seal', checked: true },
    { key: 'photo', checked: true, attachmentId: '22222222-2222-4222-8222-222222222222' },
  ],
  ...overrides,
})

describe('validateChecklistSubmission', () => {
  it('accepts a complete submission and normalizes the answer rows', () => {
    const result = validateChecklistSubmission(template, submission())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.items).toHaveLength(3)
    expect(result.items[0]).toMatchObject({ key: 'seal', checked: true, attachmentId: null })
    expect(result.items[1]).toMatchObject({ key: 'photo', requiresAttachment: true })
    expect(result.items[2]).toMatchObject({ key: 'notes', checked: false })
  })

  it('rejects a template that no longer matches', () => {
    const result = validateChecklistSubmission(template, submission({
      templateId: '33333333-3333-4333-8333-333333333333',
    }))
    expect(result).toEqual({ ok: false, code: 'checklist_template_mismatch' })
  })

  it('rejects unknown answer keys', () => {
    const result = validateChecklistSubmission(template, submission({
      items: [
        { key: 'seal', checked: true },
        { key: 'photo', checked: true, attachmentId: '22222222-2222-4222-8222-222222222222' },
        { key: 'surprise', checked: true },
      ],
    }))
    expect(result).toEqual({ ok: false, code: 'checklist_unknown_item', itemKey: 'surprise' })
  })

  it('refuses a required item that was not checked', () => {
    const result = validateChecklistSubmission(template, submission({
      items: [
        { key: 'seal', checked: false },
        { key: 'photo', checked: true, attachmentId: '22222222-2222-4222-8222-222222222222' },
      ],
    }))
    expect(result).toEqual({ ok: false, code: 'checklist_required', itemKey: 'seal' })
  })

  it('refuses an attachment-required item without a file', () => {
    const result = validateChecklistSubmission(template, submission({
      items: [
        { key: 'seal', checked: true },
        { key: 'photo', checked: true },
      ],
    }))
    expect(result).toEqual({ ok: false, code: 'checklist_attachment_required', itemKey: 'photo' })
  })

  it('allows an optional item to stay unchecked', () => {
    const result = validateChecklistSubmission(template, submission())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.items[2]?.checked).toBe(false)
  })
})

describe('checklist projections', () => {
  it('sends only template fields to the driver', () => {
    const payload = buildChecklistWorkPayload(template)
    expect(payload).toEqual({
      templateId: template.id,
      name: template.name,
      items: [
        { key: 'seal', label: 'Seal intact', description: null, required: true, requiresAttachment: false },
        { key: 'photo', label: 'Cargo photo', description: null, required: true, requiresAttachment: true },
        { key: 'notes', label: 'Notes', description: null, required: false, requiresAttachment: false },
      ],
    })
  })

  it('freezes the template into the run snapshot', () => {
    const snapshot = buildChecklistRunSnapshot(template)
    expect(snapshot).toEqual({
      id: template.id,
      name: template.name,
      items: [
        { key: 'seal', label: 'Seal intact', description: null, required: true, requiresAttachment: false },
        { key: 'photo', label: 'Cargo photo', description: null, required: true, requiresAttachment: true },
        { key: 'notes', label: 'Notes', description: null, required: false, requiresAttachment: false },
      ],
    })
  })
})
