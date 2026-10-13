import { notFound } from 'next/navigation'
import { RecordingEditor } from '@/components/recording-editor'
import { query } from '@/lib/db'
import type { RecordingDetails } from '@/components/recording-editor'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ workspaceId: string }> }

export default async function PublicWorkspacePage({ params }: Props) {
  const { workspaceId } = await params
  const workspace = await query<{ id: string; name: string; description: string }>(
    "SELECT id, name, description FROM workspaces WHERE id = $1 AND visibility = 'PUBLIC'",
    [workspaceId]
  )
  if (!workspace.rowCount) notFound()
  const recordings = await query<RecordingDetails & { firstName: string | null; lastName: string | null }>(
    `SELECT r.id, r.title, r.description, r.transcript, r.status,
            r.created_at AS "createdAt", u.first_name AS "firstName", u.last_name AS "lastName"
     FROM recordings r JOIN app_users u ON u.clerk_id = r.owner_id
     WHERE r.workspace_id = $1 AND r.status = 'READY'
     ORDER BY r.created_at DESC`,
    [workspaceId]
  )
  const details = workspace.rows[0]
  return <div className="page-shell shared-page">
    <div className="share-banner"><span className="brand-mark small">C</span><span>Public ClipSphere workspace</span></div>
    <div className="page-heading"><div><span className="eyebrow">PUBLIC WORKSPACE</span><h1>{details.name}</h1><p>{details.description || 'Shared recordings and team context.'}</p></div></div>
    {recordings.rows.length ? <div className="shared-recordings">{recordings.rows.map((recording) => <article className="shared-recording panel" key={recording.id}>
      <RecordingEditor recording={{ ...recording, ownerName: [recording.firstName, recording.lastName].filter(Boolean).join(' ') }} publicWorkspaceId={workspaceId} />
    </article>)}</div> : <div className="empty-state panel"><span className="empty-icon">◉</span><h2>No published recordings yet</h2><p>When a recording is ready, it will appear here.</p></div>}
  </div>
}
