import Link from 'next/link'
import { auth } from '@clerk/nextjs/server'
import { NewWorkspaceForm } from '@/components/new-workspace-form'
import { WorkspaceCard } from '@/components/workspace-card'
import { syncUser } from '@/lib/auth'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

type WorkspaceSummary = { id: string; name: string; description: string; visibility: 'PRIVATE' | 'PUBLIC'; role: string; createdAt: string; recordingCount: number }

export default async function HomePage() {
  const session = await auth()
  if (!session.userId) {
    return <div className="landing page-shell">
      <section className="hero">
        <div className="hero-copy"><span className="eyebrow">RECORD. UNDERSTAND. SHARE.</span><h1>Good ideas deserve<br /><span>a place to land.</span></h1><p>ClipSphere brings your recordings, searchable transcripts, and team feedback together in one calm workspace.</p><div className="hero-actions"><Link href="/sign-up" className="button button-primary">Create your free account <span>↗</span></Link><a href="#how-it-works" className="button button-quiet">See how it works</a></div><div className="hero-proof"><span className="proof-dot" />Private by default <span className="proof-separator">·</span> Share when you choose</div></div>
        <div className="hero-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="glass-card"><div className="glass-card-top"><span className="live-indicator"/> CLIPSPHERE STUDIO <span>•••</span></div><div className="glass-wave"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></div><div className="glass-card-footer"><span>● 00:12:48</span><span>1080p</span></div></div><div className="floating-note"><span>✦</span><div><strong>Ready to revisit</strong><small>Transcript + summary created</small></div></div><div className="hero-orb"/></div>
      </section>
      <section className="feature-strip" id="how-it-works"><div><span>01</span><strong>Capture without friction</strong><p>Record your screen and voice from the desktop studio.</p></div><div><span>02</span><strong>Find the useful parts</strong><p>Transcripts and summaries make every clip easier to scan.</p></div><div><span>03</span><strong>Bring people in</strong><p>Organize in workspaces, invite teammates, and share a link.</p></div></section>
      <section className="landing-bottom"><p>One home for the things worth remembering.</p><Link href="/sign-up" className="text-link">Start with ClipSphere ↗</Link></section>
    </div>
  }

  let user
  let workspaces
  try {
    user = await syncUser(session.userId)
    const result = await query<WorkspaceSummary>(
      `SELECT w.id, w.name, w.description, w.visibility, m.role,
              w.created_at AS "createdAt", COUNT(r.id)::int AS "recordingCount"
       FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id
       LEFT JOIN recordings r ON r.workspace_id = w.id AND r.status <> 'FAILED'
       WHERE m.clerk_id = $1 GROUP BY w.id, m.role ORDER BY w.updated_at DESC`,
      [session.userId]
    )
    workspaces = result.rows
  } catch (error) {
    console.error('Unable to load ClipSphere dashboard:', error)
    return <section className="page-shell setup-message"><span className="eyebrow">ALMOST THERE</span><h1>Your workspace is ready to connect.</h1><p>ClipSphere could not reach its database. Set <code>DATABASE_URL</code>, run <code>npm run db:migrate</code> in <code>web-app</code>, and refresh this page.</p></section>
  }

  return <div className="page-shell dashboard"><div className="page-heading"><div><span className="eyebrow">YOUR CLIPSPHERE</span><h1>Welcome back{user.firstName ? `, ${user.firstName}` : ''}.</h1><p>Your videos and the people you work with, all in one place.</p></div><NewWorkspaceForm /></div>
    {workspaces.length ? <section className="workspace-grid">{workspaces.map((workspace) => <WorkspaceCard key={workspace.id} workspace={workspace} />)}</section> : <div className="empty-state panel"><span className="empty-icon">◈</span><h2>Start with a workspace</h2><p>Create a place for a team, a course, or a project. Your recordings will be organized there.</p><NewWorkspaceForm /></div>}
    <div className="dashboard-tip"><span>✦</span><p>Recordings made in ClipSphere Studio are transcribed and summarized automatically.</p><span>Open ClipSphere Studio to add a recording.</span></div>
  </div>
}
