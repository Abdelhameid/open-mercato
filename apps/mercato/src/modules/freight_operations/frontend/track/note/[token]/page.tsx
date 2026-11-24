import PublicDeliveryNoteView from '../../../../components/PublicDeliveryNoteView'

export default async function PublicDeliveryNotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <PublicDeliveryNoteView token={token} />
}
