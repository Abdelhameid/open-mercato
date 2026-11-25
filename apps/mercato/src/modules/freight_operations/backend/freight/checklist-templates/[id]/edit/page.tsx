import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ChecklistTemplateEditForm } from '../../../../../components/ChecklistTemplateForm'

export default async function FreightChecklistTemplateEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <Page>
      <PageBody>
        <ChecklistTemplateEditForm id={id} />
      </PageBody>
    </Page>
  )
}
