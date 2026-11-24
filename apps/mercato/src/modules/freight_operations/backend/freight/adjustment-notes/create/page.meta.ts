export const metadata = {
  requireAuth: true,
  requireFeatures: ['freight.adjustment_notes.manage'],
  pageTitle: 'New credit or debit note',
  pageTitleKey: 'freight_operations.adjustment_notes.form.create.title',
  pageGroup: 'Freight',
  pageGroupKey: 'freight_operations.nav.group',
  pageOrder: 252,
  icon: 'receipt',
  navHidden: true,
  breadcrumb: [
    { label: 'Freight', labelKey: 'freight_operations.nav.group' },
    { label: 'Credit and debit notes', labelKey: 'freight_operations.adjustment_notes.page.title', href: '/backend/freight/adjustment-notes' },
    { label: 'New note', labelKey: 'freight_operations.adjustment_notes.form.create.title' },
  ],
}
