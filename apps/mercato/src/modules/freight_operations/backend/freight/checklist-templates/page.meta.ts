export const metadata = {
  requireAuth: true,
  requireFeatures: ['freight.checklist_templates.manage'],
  pageTitle: 'Driver checklist templates',
  pageTitleKey: 'freight_operations.checklist_templates.page.title',
  pageGroup: 'Freight',
  pageGroupKey: 'freight_operations.nav.group',
  pageOrder: 250,
  icon: 'clipboard-check',
  breadcrumb: [
    { label: 'Freight', labelKey: 'freight_operations.nav.group' },
    { label: 'Checklist templates', labelKey: 'freight_operations.checklist_templates.page.title' },
  ],
}
