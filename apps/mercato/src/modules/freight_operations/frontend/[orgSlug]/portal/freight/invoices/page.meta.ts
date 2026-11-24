import type { PageMetadata } from '@open-mercato/shared/modules/registry'

export const metadata: PageMetadata = {
  requireCustomerAuth: true,
  requireCustomerFeatures: ['portal.freight.view'],
  titleKey: 'freight_operations.portal.invoices.title',
  title: 'Invoices',
  nav: {
    label: 'Invoices',
    labelKey: 'freight_operations.portal.invoices.title',
    group: 'main',
    order: 62,
  },
}

export default metadata
