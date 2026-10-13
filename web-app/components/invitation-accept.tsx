'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SignInButton, useAuth } from '@clerk/nextjs'

export function InvitationAccept({ token, email, expired, accepted }: { token: string; email: string; expired: boolean; accepted: boolean }) {
  const { isSignedIn } = useAuth()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  async function accept() {
    setBusy(true); setError('')
    const response = await fetch(`/api/invitations/${token}`, { method: 'POST' })
    const payload = await response.json().catch(() => ({}))
    setBusy(false)
    if (!response.ok) return setError(payload.error || 'Invitation could not be accepted.')
    router.push(`/workspaces/${payload.workspaceId}`)
  }

  return (
    <div className="invite-card panel">
      <span className="workspace-icon large">✉</span>
      <span className="eyebrow">WORKSPACE INVITATION</span>
      <h1>{accepted ? 'This invitation was already accepted' : expired ? 'This invitation has expired' : 'You’ve been invited'}</h1>
      <p>This invitation is for <strong>{email}</strong>. Sign in with that email address to join.</p>
      {error && <p className="inline-error">{error}</p>}
      {!expired && !accepted && (isSignedIn ? <button className="button button-primary" onClick={accept} disabled={busy}>{busy ? 'Joining…' : 'Accept invitation'}</button> : <SignInButton><button className="button button-primary">Sign in to accept</button></SignInButton>)}
    </div>
  )
}
