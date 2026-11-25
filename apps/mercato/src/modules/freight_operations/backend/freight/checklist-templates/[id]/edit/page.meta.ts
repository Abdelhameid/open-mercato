export const metadata = {
  requireAuth: true,
  requireFeatures: ['freight.checklist_templates.manage'],
  pageTitle: 'Edit checklist template',
  pageTitleKey: 'freight_operations.checklist_templates.form.editTitle',
  pageGroup: 'Freight',
  pageGroupKey: 'freight_operations.nav.group',
  pageOrder: 252,
  icon: 'clipboard-check',
  navHidden: true,
  breadcrumb: [
    { label: 'Freight', labelKey: 'freight_operations.nav.group' },
    { label: 'Checklist templates', labelKey: 'freight_operations.checklist_templates.page.title', href: '/backend/freight/checklist-templates' },
    { label: 'Edit template', labelKey: 'freight_operations.checklist_templates.form.editTitle' },
  ],
}
