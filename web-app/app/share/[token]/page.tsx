import { notFound } from 'next/navigation'
import { RecordingEditor } from '@/components/recording-editor'
import { query } from '@/lib/db'
import { tokenHash } from '@/lib/security'
import type { RecordingDetails } from '@/components/recording-editor'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ token: string }> }

export default async function SharedWorkspacePage({ params }: Props) {
  const { token } = await params
  const link = await query<{ workspaceId: string; workspaceName: string }>(
    `SELECT w.id AS "workspaceId", w.name AS "workspaceName"
     FROM share_links s JOIN workspaces w ON w.id = s.workspace_id
     WHERE s.token_hash = $1 AND s.revoked_at IS NULL
       AND (s.expires_at IS NULL OR s.expires_at > NOW())`,
    [tokenHash(token)]
  )
  if (!link.rowCount) notFound()
  const recordings = await query<RecordingDetails & { firstName: string | null; lastName: string | null }>(
    `SELECT r.id, r.title, r.description, r.transcript, r.status,
            r.created_at AS "createdAt", u.first_name AS "firstName", u.last_name AS "lastName"
     FROM recordings r JOIN app_users u ON u.clerk_id = r.owner_id
     WHERE r.workspace_id = $1 AND r.status = 'READY' ORDER BY r.created_at DESC`,
    [link.rows[0].workspaceId]
  )
  const first = link.rows[0]
  return <div className="page-shell shared-page"><div className="share-banner"><span className="brand-mark small">C</span><span>Shared with you on ClipSphere</span></div><div className="page-heading"><div><span className="eyebrow">SHARED WORKSPACE</span><h1>{first.workspaceName}</h1><p>Watch recordings and join the discussion.</p></div></div>
    {recordings.rows.length ? <div className="shared-recordings">{recordings.rows.map((recording) => <article className="shared-recording panel" key={recording.id}><RecordingEditor recording={{ ...recording, ownerName: [recording.firstName, recording.lastName].filter(Boolean).join(' ') }} shareToken={token} /></article>)}</div> : <div className="empty-state panel"><span className="empty-icon">◉</span><h2>No published recordings yet</h2><p>When a recording is ready, it will appear here.</p></div>}
  </div>
}
