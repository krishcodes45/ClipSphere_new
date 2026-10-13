import { randomUUID } from 'node:crypto'
import { apiUser, errorJson, isUuid } from '@/lib/api'
import { workspaceRole } from '@/lib/auth'
import { query } from '@/lib/db'
import { newShareToken, tokenHash } from '@/lib/security'

type Context = { params: Promise<{ workspaceId: string }> }

export async function POST(request: Request, context: Context) {
  const result = await apiUser(request)
  if (result.response) return result.response
  const { workspaceId } = await context.params
  if (!isUuid(workspaceId)) return errorJson('Workspace not found.', 404)
  if (await workspaceRole(workspaceId, result.user.clerkId) !== 'OWNER') {
    return errorJson('Only the workspace owner can create share links.', 403)
  }

  const token = newShareToken()
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  try {
    await query(
      'INSERT INTO share_links (id, workspace_id, token_hash, created_by, expires_at) VALUES ($1, $2, $3, $4, $5)',
      [randomUUID(), workspaceId, tokenHash(token), result.user.clerkId, expiresAt]
    )
    const base = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
    return Response.json({ url: `${base.replace(/\/$/, '')}/share/${token}`, expiresAt }, { status: 201 })
  } catch (error) {
    console.error('Unable to create share link:', error)
    return errorJson('A share link could not be created.', 503)
  }
}
