'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function NewWorkspaceForm() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    const response = await fetch('/api/workspaces', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    })
    const payload = await response.json().catch(() => ({}))
    setSaving(false)
    if (!response.ok) return setError(payload.error || 'Workspace could not be created.')
    router.push(`/workspaces/${payload.workspace.id}`)
    router.refresh()
  }

  if (!open) return <button className="button button-primary" onClick={() => setOpen(true)}>＋ New workspace</button>

  return (
    <form className="panel form-stack compact-form" onSubmit={submit}>
      <div className="form-heading"><div><h3>Create a workspace</h3><p>Bring a team or project together.</p></div><button className="icon-button" type="button" onClick={() => setOpen(false)} aria-label="Close">×</button></div>
      <label>Workspace name<input autoFocus maxLength={100} required value={name} onChange={(event) => setName(event.target.value)} placeholder="Product launch" /></label>
      <label>Description <span className="muted">Optional</span><textarea maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="A place for your team videos" rows={2} /></label>
      {error && <p className="inline-error">{error}</p>}
      <button className="button button-primary" disabled={saving}>{saving ? 'Creating…' : 'Create workspace'}</button>
    </form>
  )
}
