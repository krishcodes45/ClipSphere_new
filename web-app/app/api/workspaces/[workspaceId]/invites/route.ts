import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { apiUser, errorJson, isUuid } from '@/lib/api'
import { workspaceRole } from '@/lib/auth'
import { query } from '@/lib/db'
import { newShareToken, tokenHash } from '@/lib/security'

type Context = { params: Promise<{ workspaceId: string }> }
const inviteInput = z.object({
  email: z.string().trim().email().max(254),
  role: z.enum(['EDITOR', 'VIEWER']).default('EDITOR'),
})

export async function POST(request: Request, context: Context) {
  const result = await apiUser(request)
  if (result.response) return result.response
  const { workspaceId } = await context.params
  if (!isUuid(workspaceId)) return errorJson('Workspace not found.', 404)
  if (await workspaceRole(workspaceId, result.user.clerkId) !== 'OWNER') {
    return errorJson('Only the workspace owner can invite collaborators.', 403)
  }
  const parsed = inviteInput.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return errorJson('Enter a valid email address.')
  const email = parsed.data.email.toLowerCase()
  const member = await query(
    'SELECT 1 FROM workspace_members m JOIN app_users u ON u.clerk_id = m.clerk_id WHERE m.workspace_id = $1 AND lower(u.email) = $2',
    [workspaceId, email]
  )
  if (member.rowCount) return errorJson('That person is already a workspace member.', 409)

  const token = newShareToken()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  try {
    await query(
      `INSERT INTO workspace_invites (id, workspace_id, email, role, token_hash, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [randomUUID(), workspaceId, email, parsed.data.role, tokenHash(token), result.user.clerkId, expiresAt]
    )
    const base = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
    return Response.json({ url: `${base.replace(/\/$/, '')}/invite/${token}`, email, role: parsed.data.role, expiresAt }, { status: 201 })
  } catch (error) {
    console.error('Unable to create workspace invitation:', error)
    return errorJson('The invitation could not be created.', 503)
  }
}
