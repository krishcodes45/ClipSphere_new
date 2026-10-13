'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Props = { workspaceId: string; visibility: 'PRIVATE' | 'PUBLIC'; role: string }

export function WorkspaceActions({ workspaceId, visibility, role }: Props) {
  const [email, setEmail] = useState('')
  const [inviteLink, setInviteLink] = useState('')
  const [shareLink, setShareLink] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const router = useRouter()
  const canManage = role === 'OWNER'

  async function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true); setMessage(''); setInviteLink('')
    const response = await fetch(`/api/workspaces/${workspaceId}/invites`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role: 'EDITOR' }),
    })
    const payload = await response.json().catch(() => ({}))
    setBusy(false)
    if (!response.ok) return setMessage(payload.error || 'Invitation could not be created.')
    setInviteLink(payload.url)
    setEmail('')
  }

  async function createShare() {
    setBusy(true); setMessage(''); setShareLink('')
    const response = await fetch(`/api/workspaces/${workspaceId}/share`, { method: 'POST' })
    const payload = await response.json().catch(() => ({}))
    setBusy(false)
    if (!response.ok) return setMessage(payload.error || 'Share link could not be created.')
    setShareLink(payload.url)
  }

  async function toggleVisibility() {
    setBusy(true); setMessage('')
    const response = await fetch(`/api/workspaces/${workspaceId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility: visibility === 'PUBLIC' ? 'PRIVATE' : 'PUBLIC' }),
    })
    const payload = await response.json().catch(() => ({}))
    setBusy(false)
    if (!response.ok) return setMessage(payload.error || 'Visibility could not be changed.')
    router.refresh()
  }

  return (
    <section className="panel action-panel">
      <div className="section-heading"><div><span className="eyebrow">COLLABORATE</span><h2>People and sharing</h2></div><span className="pill">{visibility.toLowerCase()}</span></div>
      {canManage && <>
        <form className="invite-form" onSubmit={invite}>
          <label htmlFor="invite-email">Invite a teammate</label>
          <div className="inline-form"><input id="invite-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" /><button className="button button-secondary" disabled={busy}>{busy ? 'Working…' : 'Create invite'}</button></div>
        </form>
        {inviteLink && <LinkCopy value={inviteLink} label="Invitation link (valid for 7 days)" />}
        {visibility === 'PUBLIC' && <LinkCopy value={`/public/workspaces/${workspaceId}`} label="Public workspace link" />}
        <div className="share-settings"><div><strong>Public workspace</strong><p>Public workspaces are viewable at their workspace link. Expiring share links remain separate.</p></div><button className={`switch ${visibility === 'PUBLIC' ? 'switch-on' : ''}`} onClick={toggleVisibility} disabled={busy} aria-label="Toggle public workspace"><span /></button></div>
        <button className="button button-secondary" onClick={createShare} disabled={busy}>Create a 30-day share link</button>
        {shareLink && <LinkCopy value={shareLink} label="Share link (valid for 30 days)" />}
      </>}
      {!canManage && <p className="muted">Only the workspace owner can invite people or manage public links.</p>}
      {message && <p className="inline-error">{message}</p>}
    </section>
  )
}

function LinkCopy({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return <div className="copy-row"><label>{label}</label><div className="inline-form"><input readOnly value={value} onFocus={(event) => event.currentTarget.select()} /><button className="button button-quiet" onClick={async () => { await navigator.clipboard.writeText(value.startsWith('/') ? new URL(value, window.location.origin).href : value); setCopied(true) }}>{copied ? 'Copied' : 'Copy'}</button></div></div>
}
