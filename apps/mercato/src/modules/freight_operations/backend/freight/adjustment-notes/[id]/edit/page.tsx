import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { AdjustmentNoteEditForm } from '../../../../../components/AdjustmentNoteForm'

export default async function FreightAdjustmentNoteEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <Page>
      <PageBody>
        <AdjustmentNoteEditForm id={id} />
      </PageBody>
    </Page>
  )
}
