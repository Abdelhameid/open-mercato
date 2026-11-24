export const metadata = {
  requireAuth: true,
  requireFeatures: ['freight.read'],
  pageTitle: 'Payment receipt',
  pageTitleKey: 'freight_operations.payments.receipt.title',
  pageGroup: 'Freight',
  pageGroupKey: 'freight_operations.nav.group',
  pageOrder: 260,
  icon: 'receipt',
  navHidden: true,
  breadcrumb: [
    { label: 'Freight', labelKey: 'freight_operations.nav.group' },
    { label: 'Payment receipt', labelKey: 'freight_operations.payments.receipt.title' },
  ],
}
