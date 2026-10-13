'use client'

import Link from 'next/link'
import { WorkspaceActions } from '@/components/workspace-actions'

type Recording = { id: string; title: string; description: string; status: string; createdAt: string; firstName: string | null; lastName: string | null }
type Member = { id: string; email: string; firstName: string | null; lastName: string | null; role: string }
type Workspace = { id: string; name: string; description: string; visibility: 'PRIVATE' | 'PUBLIC'; role: string; createdAt: string }

export function WorkspaceDetail({ workspace, recordings, members }: { workspace: Workspace; recordings: Recording[]; members: Member[] }) {
  return (
    <div className="workspace-detail-grid">
      <div className="workspace-content">
        <section className="recordings-section">
          <div className="section-heading"><div><span className="eyebrow">LIBRARY</span><h2>Recordings <span className="count-badge">{recordings.length}</span></h2></div><span className="muted">New clips appear here after desktop processing.</span></div>
          {recordings.length === 0 ? <div className="empty-state panel"><span className="empty-icon">◉</span><h3>Your first recording belongs here</h3><p>Record from the ClipSphere desktop app. Once it finishes processing, your video, transcript, and summary will show up in this workspace.</p></div> : (
            <div className="recording-list">{recordings.map((recording) => <Link href={`/recordings/${recording.id}`} className="recording-row" key={recording.id}>
              <span className="recording-thumbnail">◉</span><span className="recording-row-copy"><strong>{recording.title}</strong><span>{recording.description || 'No description yet'}</span></span>
              <span className={`status-pill status-${recording.status.toLowerCase()}`}>{recording.status.toLowerCase()}</span><span className="recording-date">{new Date(recording.createdAt).toLocaleDateString()}</span><span className="arrow">↗</span>
            </Link>)}</div>
          )}
        </section>
      </div>
      <aside className="workspace-aside">
        <WorkspaceActions workspaceId={workspace.id} visibility={workspace.visibility} role={workspace.role} />
        <section className="panel members-panel"><div className="section-heading"><div><span className="eyebrow">TEAM</span><h2>Members <span className="count-badge">{members.length}</span></h2></div></div>
          <div className="member-list">{members.map((member) => <div className="member-row" key={member.id}><span className="avatar-small">{(member.firstName || member.email).slice(0, 1).toUpperCase()}</span><span><strong>{[member.firstName, member.lastName].filter(Boolean).join(' ') || member.email}</strong><small>{member.email}</small></span><span className="member-role">{member.role.toLowerCase()}</span></div>)}</div>
        </section>
      </aside>
    </div>
  )
}
