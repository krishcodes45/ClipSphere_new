import Link from 'next/link'

type Props = {
  workspace: { id: string; name: string; description: string; visibility: string; role: string; recordingCount: number; createdAt: string }
}

export function WorkspaceCard({ workspace }: Props) {
  return (
    <Link className="workspace-card" href={`/workspaces/${workspace.id}`}>
      <div className="card-topline"><span className="workspace-icon">◈</span><span className={`pill ${workspace.visibility === 'PUBLIC' ? 'pill-public' : ''}`}>{workspace.visibility.toLowerCase()}</span></div>
      <h2>{workspace.name}</h2>
      <p>{workspace.description || 'A shared space for your recordings and ideas.'}</p>
      <div className="card-footer"><span>{workspace.recordingCount} {workspace.recordingCount === 1 ? 'recording' : 'recordings'}</span><span>{workspace.role.toLowerCase()}</span><span className="arrow">↗</span></div>
    </Link>
  )
}
