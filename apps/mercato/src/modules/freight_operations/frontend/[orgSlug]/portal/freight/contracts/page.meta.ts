import type { PageMetadata } from '@open-mercato/shared/modules/registry'

export const metadata: PageMetadata = {
  requireCustomerAuth: true,
  requireCustomerFeatures: ['portal.freight.view'],
  titleKey: 'freight_operations.portal.contracts.title',
  title: 'Contracts',
  nav: {
    label: 'Contracts',
    labelKey: 'freight_operations.portal.contracts.title',
    group: 'main',
    order: 61,
  },
}

export default metadata
