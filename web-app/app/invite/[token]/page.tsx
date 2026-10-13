import { notFound } from 'next/navigation'
import { InvitationAccept } from '@/components/invitation-accept'
import { query } from '@/lib/db'
import { tokenHash } from '@/lib/security'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ token: string }> }

export default async function InvitationPage({ params }: Props) {
  const { token } = await params
  const result = await query<{ email: string; workspaceName: string; expired: boolean; accepted: boolean }>(
    `SELECT i.email, w.name AS "workspaceName", (i.expires_at <= NOW()) AS expired,
            (i.accepted_at IS NOT NULL) AS accepted
     FROM workspace_invites i JOIN workspaces w ON w.id = i.workspace_id WHERE i.token_hash = $1`,
    [tokenHash(token)]
  )
  if (!result.rowCount) notFound()
  const invite = result.rows[0]
  return <div className="page-shell invite-page"><InvitationAccept token={token} email={invite.email} expired={invite.expired} accepted={invite.accepted} /><p className="muted invite-caption">You’re joining <strong>{invite.workspaceName}</strong> on ClipSphere.</p></div>
}
