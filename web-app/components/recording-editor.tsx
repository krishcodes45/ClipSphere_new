'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RecordingComments } from '@/components/recording-comments'

export type RecordingDetails = {
  id: string; title: string; description: string; transcript: string; status: string;
  createdAt: string; objectKey?: string; ownerName?: string; workspaceName?: string
}

export function RecordingEditor({ recording, editable = false, shareToken, publicWorkspaceId }: { recording: RecordingDetails; editable?: boolean; shareToken?: string; publicWorkspaceId?: string }) {
  const [title, setTitle] = useState(recording.title)
  const [description, setDescription] = useState(recording.description)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const router = useRouter()

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true); setMessage('')
    const response = await fetch(`/api/recordings/${recording.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description }),
    })
    const payload = await response.json().catch(() => ({}))
    setSaving(false)
    if (!response.ok) return setMessage(payload.error || 'Changes could not be saved.')
    setMessage('Saved'); router.refresh()
  }

  const mediaAccess = shareToken
    ? `share=${encodeURIComponent(shareToken)}`
    : publicWorkspaceId ? `workspace=${encodeURIComponent(publicWorkspaceId)}` : ''
  const mediaUrl = `/api/recordings/${recording.id}/media${mediaAccess ? `?${mediaAccess}` : ''}`

  return (
    <div className="recording-layout">
      <div className="recording-main">
        <div className="video-frame">
          {recording.status === 'READY' ? <video controls preload="metadata" src={mediaUrl} /> : <div className="video-placeholder"><span className="video-symbol">◉</span><strong>{recording.status === 'FAILED' ? 'Processing failed' : 'Your recording is processing'}</strong><p>{recording.status === 'FAILED' ? 'The original file may still be available for retry.' : 'This page will show the video when processing finishes.'}</p></div>}
        </div>
        <form className="recording-info panel" onSubmit={save}>
          {editable ? <label className="title-edit"><span className="eyebrow">TITLE</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} required /></label> : <div><span className="eyebrow">RECORDING</span><h1>{recording.title}</h1></div>}
          <p className="recording-meta">{recording.ownerName ? `Recorded by ${recording.ownerName} · ` : ''}{new Date(recording.createdAt).toLocaleString()}</p>
          {editable ? <label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={4000} rows={3} placeholder="Add context for your collaborators" /></label> : description ? <p className="recording-description">{description}</p> : null}
          {editable && <div className="form-bottom">{message && <span className={message === 'Saved' ? 'success-text' : 'inline-error'}>{message}</span>}<button className="button button-primary" disabled={saving}>{saving ? 'Saving…' : 'Save details'}</button></div>}
        </form>
        {recording.transcript && <details className="transcript-panel panel"><summary><span><span className="eyebrow">ACCESSIBILITY</span><strong>Transcript</strong></span><span className="muted">Show / hide</span></summary><p>{recording.transcript}</p></details>}
      </div>
        <RecordingComments recordingId={recording.id} shareToken={shareToken} publicWorkspaceId={publicWorkspaceId} />
    </div>
  )
}
