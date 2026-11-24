export const metadata = {
  requireAuth: true,
  requireFeatures: ['freight.read'],
  pageTitle: 'Credit and debit notes',
  pageTitleKey: 'freight_operations.adjustment_notes.page.title',
  pageGroup: 'Freight',
  pageGroupKey: 'freight_operations.nav.group',
  pageOrder: 250,
  icon: 'receipt',
  breadcrumb: [
    { label: 'Freight', labelKey: 'freight_operations.nav.group' },
    { label: 'Credit and debit notes', labelKey: 'freight_operations.adjustment_notes.page.title' },
  ],
}
