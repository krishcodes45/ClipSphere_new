import { apiUser, errorJson } from '@/lib/api'
import { query, transaction } from '@/lib/db'
import { tokenHash } from '@/lib/security'

type Context = { params: Promise<{ token: string }> }

export async function GET(_request: Request, context: Context) {
  const { token } = await context.params
  const invite = await query(
    `SELECT i.email, i.role, i.expires_at AS "expiresAt", w.name AS "workspaceName",
            (i.accepted_at IS NOT NULL) AS accepted,
            (i.expires_at <= NOW()) AS expired
     FROM workspace_invites i JOIN workspaces w ON w.id = i.workspace_id
     WHERE i.token_hash = $1`,
    [tokenHash(token)]
  )
  if (!invite.rowCount) return errorJson('Invitation not found.', 404)
  return Response.json({ invitation: invite.rows[0] })
}

export async function POST(request: Request, context: Context) {
  const result = await apiUser(request)
  if (result.response) return result.response
  const { token } = await context.params
  try {
    const accepted = await transaction(async (client) => {
      const invite = await client.query<{ id: string; workspace_id: string; email: string; role: 'EDITOR' | 'VIEWER' }>(
        `SELECT id, workspace_id, email, role FROM workspace_invites
         WHERE token_hash = $1 AND accepted_at IS NULL AND expires_at > NOW()
         FOR UPDATE`,
        [tokenHash(token)]
      )
      const row = invite.rows[0]
      if (!row) return { error: 'This invitation is expired or has already been used.' }
      if (row.email.toLowerCase() !== result.user.email.toLowerCase()) {
        return { error: 'Sign in with the email address this invitation was sent to.' }
      }
      await client.query(
        `INSERT INTO workspace_members (workspace_id, clerk_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (workspace_id, clerk_id) DO NOTHING`,
        [row.workspace_id, result.user.clerkId, row.role]
      )
      await client.query('UPDATE workspace_invites SET accepted_at = NOW() WHERE id = $1', [row.id])
      return { workspaceId: row.workspace_id }
    })
    if ('error' in accepted && accepted.error) return errorJson(accepted.error, 400)
    return Response.json({ workspaceId: accepted.workspaceId })
  } catch (error) {
    console.error('Unable to accept workspace invitation:', error)
    return errorJson('The invitation could not be accepted.', 503)
  }
}
