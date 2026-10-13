'use client'

import { useCallback, useEffect, useState } from 'react'
import { SignInButton, useAuth } from '@clerk/nextjs'

type Comment = { id: string; body: string; createdAt: string; firstName: string | null; lastName: string | null; email: string }

export function RecordingComments({ recordingId, shareToken, publicWorkspaceId }: { recordingId: string; shareToken?: string; publicWorkspaceId?: string }) {
  const { isSignedIn } = useAuth()
  const [comments, setComments] = useState<Comment[]>([])
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [posting, setPosting] = useState(false)
  const access = shareToken ? `share=${encodeURIComponent(shareToken)}`
    : publicWorkspaceId ? `workspace=${encodeURIComponent(publicWorkspaceId)}` : ''
  const query = access ? `?${access}` : ''

  const loadComments = useCallback(async () => {
    setLoading(true)
    const response = await fetch(`/api/recordings/${recordingId}/comments${query}`, { cache: 'no-store' })
    const payload = await response.json().catch(() => ({}))
    if (response.ok) setComments(payload.comments)
    setLoading(false)
  }, [recordingId, query])

  useEffect(() => { void loadComments() }, [loadComments])

  async function postComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPosting(true); setError('')
    const response = await fetch(`/api/recordings/${recordingId}/comments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body, shareToken, publicWorkspaceId }),
    })
    const payload = await response.json().catch(() => ({}))
    setPosting(false)
    if (!response.ok) return setError(payload.error || 'Comment could not be posted.')
    setComments((current) => [...current, payload.comment])
    setBody('')
  }

  return (
    <section className="comments-panel">
      <div className="section-heading"><div><span className="eyebrow">CONVERSATION</span><h2>Comments <span className="count-badge">{comments.length}</span></h2></div></div>
      {loading ? <p className="muted">Loading comments…</p> : comments.length === 0 ? <p className="empty-inline">No comments yet. Start the conversation.</p> : (
        <div className="comment-list">{comments.map((comment) => <article className="comment" key={comment.id}><span className="avatar-small">{(comment.firstName || comment.email).slice(0, 1).toUpperCase()}</span><div><div className="comment-meta"><strong>{[comment.firstName, comment.lastName].filter(Boolean).join(' ') || comment.email}</strong><time>{new Date(comment.createdAt).toLocaleString()}</time></div><p>{comment.body}</p></div></article>)}</div>
      )}
      {isSignedIn ? <form className="comment-form" onSubmit={postComment}><label htmlFor={`comment-${recordingId}`}>Add a comment</label><textarea id={`comment-${recordingId}`} value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} rows={3} placeholder="Share a thought or leave feedback…" required /><div className="form-bottom">{error ? <span className="inline-error">{error}</span> : <span className="muted">Be kind and constructive.</span>}<button className="button button-primary" disabled={posting || !body.trim()}>{posting ? 'Posting…' : 'Post comment'}</button></div></form> : <p className="signin-prompt"><SignInButton><button className="text-link">Sign in</button></SignInButton> to join the conversation.</p>}
    </section>
  )
}
