export const metadata = {
  requireAuth: true,
  requireFeatures: ['freight.adjustment_notes.manage'],
  pageTitle: 'Edit credit or debit note',
  pageTitleKey: 'freight_operations.adjustment_notes.form.edit.title',
  pageGroup: 'Freight',
  pageGroupKey: 'freight_operations.nav.group',
  pageOrder: 254,
  icon: 'receipt',
  navHidden: true,
  breadcrumb: [
    { label: 'Freight', labelKey: 'freight_operations.nav.group' },
    { label: 'Credit and debit notes', labelKey: 'freight_operations.adjustment_notes.page.title', href: '/backend/freight/adjustment-notes' },
    { label: 'Edit note', labelKey: 'freight_operations.adjustment_notes.form.edit.title' },
  ],
}
