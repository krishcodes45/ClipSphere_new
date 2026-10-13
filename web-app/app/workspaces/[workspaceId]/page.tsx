import type { Metadata } from 'next'
import Link from 'next/link'
import { auth } from '@clerk/nextjs/server'
import { notFound, redirect } from 'next/navigation'
import { WorkspaceDetail } from '@/components/workspace-detail'
import { workspaceRole } from '@/lib/auth'
import { query } from '@/lib/db'

type WorkspaceDetails = { id: string; name: string; description: string; visibility: 'PRIVATE' | 'PUBLIC'; createdAt: string }
type WorkspaceRecording = { id: string; title: string; description: string; status: string; createdAt: string; firstName: string | null; lastName: string | null }
type WorkspaceMember = { id: string; email: string; firstName: string | null; lastName: string | null; role: string }

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ workspaceId: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { workspaceId } = await params
  const result = await query<{ name: string }>('SELECT name FROM workspaces WHERE id = $1', [workspaceId]).catch(() => null)
  return { title: result?.rows[0]?.name || 'Workspace' }
}

export default async function WorkspacePage({ params }: Props) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  const { workspaceId } = await params
  const role = await workspaceRole(workspaceId, userId)
  if (!role) notFound()
  const [workspace, recordings, members] = await Promise.all([
    query<WorkspaceDetails>('SELECT id, name, description, visibility, created_at AS "createdAt" FROM workspaces WHERE id = $1', [workspaceId]),
    query<WorkspaceRecording>(
      `SELECT r.id, r.title, r.description, r.status, r.created_at AS "createdAt",
              u.first_name AS "firstName", u.last_name AS "lastName"
       FROM recordings r JOIN app_users u ON u.clerk_id = r.owner_id
       WHERE r.workspace_id = $1 AND r.status <> 'FAILED' ORDER BY r.created_at DESC`,
      [workspaceId]
    ),
    query<WorkspaceMember>(
      `SELECT u.clerk_id AS id, u.email, u.first_name AS "firstName", u.last_name AS "lastName", m.role
       FROM workspace_members m JOIN app_users u ON u.clerk_id = m.clerk_id
       WHERE m.workspace_id = $1 ORDER BY m.joined_at`,
      [workspaceId]
    ),
  ])
  if (!workspace.rowCount) notFound()
  return <div className="page-shell workspace-page"><div className="breadcrumbs"><Link href="/">Workspaces</Link><span>/</span><span>{workspace.rows[0].name}</span></div><div className="page-heading workspace-title"><div><span className="eyebrow">WORKSPACE · {role}</span><h1>{workspace.rows[0].name}</h1><p>{workspace.rows[0].description || 'Your team’s recordings, notes, and shared context.'}</p></div><span className="workspace-icon large">◈</span></div><WorkspaceDetail workspace={{ ...workspace.rows[0], role }} recordings={recordings.rows} members={members.rows} /></div>
}
