export const metadata = {
  requireAuth: true,
  requireFeatures: ['freight.checklist_templates.manage'],
  pageTitle: 'New checklist template',
  pageTitleKey: 'freight_operations.checklist_templates.form.createTitle',
  pageGroup: 'Freight',
  pageGroupKey: 'freight_operations.nav.group',
  pageOrder: 251,
  icon: 'clipboard-check',
  navHidden: true,
  breadcrumb: [
    { label: 'Freight', labelKey: 'freight_operations.nav.group' },
    { label: 'Checklist templates', labelKey: 'freight_operations.checklist_templates.page.title', href: '/backend/freight/checklist-templates' },
    { label: 'New template', labelKey: 'freight_operations.checklist_templates.form.createTitle' },
  ],
}
