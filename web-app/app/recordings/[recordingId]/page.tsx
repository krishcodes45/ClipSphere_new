import Link from 'next/link'
import { auth } from '@clerk/nextjs/server'
import { notFound, redirect } from 'next/navigation'
import { RecordingEditor } from '@/components/recording-editor'
import { workspaceRole } from '@/lib/auth'
import { query } from '@/lib/db'
import type { RecordingDetails } from '@/components/recording-editor'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ recordingId: string }> }

export default async function RecordingPage({ params }: Props) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  const { recordingId } = await params
  const result = await query<RecordingDetails & { ownerId: string; workspaceId: string; firstName: string | null; lastName: string | null }>(
    `SELECT r.id, r.title, r.description, r.transcript, r.status,
            r.created_at AS "createdAt", r.owner_id AS "ownerId",
            r.workspace_id AS "workspaceId", w.name AS "workspaceName",
            u.first_name AS "firstName", u.last_name AS "lastName"
     FROM recordings r JOIN workspaces w ON w.id = r.workspace_id
     JOIN app_users u ON u.clerk_id = r.owner_id WHERE r.id = $1`,
    [recordingId]
  )
  if (!result.rowCount) notFound()
  const recording = result.rows[0]
  const role = await workspaceRole(recording.workspaceId, userId)
  if (!role) notFound()
  const ownerName = [recording.firstName, recording.lastName].filter(Boolean).join(' ')
  return <div className="page-shell recording-page"><div className="breadcrumbs"><Link href={`/workspaces/${recording.workspaceId}`}>{recording.workspaceName}</Link><span>/</span><span>Recording</span></div><RecordingEditor recording={{ ...recording, ownerName }} editable={role !== 'VIEWER'} /></div>
}
