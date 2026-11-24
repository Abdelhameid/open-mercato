import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import FreightPaymentReceipt from '../../../../../components/FreightPaymentReceipt'

export default async function FreightPaymentReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <Page>
      <PageBody>
        <FreightPaymentReceipt id={id} />
      </PageBody>
    </Page>
  )
}
