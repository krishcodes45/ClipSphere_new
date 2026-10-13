import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { apiUser, errorJson, isUuid } from '@/lib/api'
import { workspaceRole } from '@/lib/auth'
import { query } from '@/lib/db'
import { tokenHash } from '@/lib/security'

type Context = { params: Promise<{ recordingId: string }> }
const commentInput = z.object({ body: z.string().trim().min(1).max(2000), shareToken: z.string().optional(), publicWorkspaceId: z.string().optional() })

async function getReadableWorkspace(recordingId: string, userId?: string, shareToken?: string, publicWorkspaceId?: string) {
  const recording = await query<{ workspace_id: string }>('SELECT workspace_id FROM recordings WHERE id = $1 AND status = \'READY\'', [recordingId])
  if (!recording.rowCount) return null
  const workspaceId = recording.rows[0].workspace_id
  if (userId && await workspaceRole(workspaceId, userId)) return workspaceId
  if (!shareToken) return null
  const link = await query(
    `SELECT 1 FROM share_links WHERE workspace_id = $1 AND token_hash = $2
     AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())`,
    [workspaceId, tokenHash(shareToken)]
  )
  if (link.rowCount) return workspaceId
  if (publicWorkspaceId === workspaceId) {
    const publicWorkspace = await query("SELECT 1 FROM workspaces WHERE id = $1 AND visibility = 'PUBLIC'", [workspaceId])
    if (publicWorkspace.rowCount) return workspaceId
  }
  return null
}

export async function GET(request: Request, context: Context) {
  const { recordingId } = await context.params
  if (!isUuid(recordingId)) return errorJson('Recording not found.', 404)
  const params = new URL(request.url).searchParams
  const shareToken = params.get('share') ?? undefined
  const publicWorkspaceId = params.get('workspace') ?? undefined
  let userId: string | undefined
  if (!shareToken && !publicWorkspaceId) {
    const result = await apiUser(request)
    if (result.response) return result.response
    userId = result.user.clerkId
  }
  const workspaceId = await getReadableWorkspace(recordingId, userId, shareToken, publicWorkspaceId)
  if (!workspaceId) return errorJson('Recording not found.', 404)
  const comments = await query(
    `SELECT c.id, c.body, c.created_at AS "createdAt", u.first_name AS "firstName",
            u.last_name AS "lastName", u.email
     FROM recording_comments c JOIN app_users u ON u.clerk_id = c.clerk_id
     WHERE c.recording_id = $1 ORDER BY c.created_at ASC`,
    [recordingId]
  )
  return Response.json({ comments: comments.rows })
}

export async function POST(request: Request, context: Context) {
  const result = await apiUser(request)
  if (result.response) return result.response
  const { recordingId } = await context.params
  if (!isUuid(recordingId)) return errorJson('Recording not found.', 404)
  const parsed = commentInput.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return errorJson('Comments must be 1 to 2,000 characters.')
  const workspaceId = await getReadableWorkspace(recordingId, result.user.clerkId, parsed.data.shareToken, parsed.data.publicWorkspaceId)
  if (!workspaceId) return errorJson('You cannot comment on this recording.', 403)
  try {
    const created = await query(
      `INSERT INTO recording_comments (id, recording_id, clerk_id, body)
       VALUES ($1, $2, $3, $4) RETURNING id, body, created_at AS "createdAt"`,
      [randomUUID(), recordingId, result.user.clerkId, parsed.data.body]
    )
    return Response.json({ comment: { ...created.rows[0], firstName: result.user.firstName, lastName: result.user.lastName, email: result.user.email } }, { status: 201 })
  } catch (error) {
    console.error('Unable to add comment:', error)
    return errorJson('Your comment could not be posted.', 503)
  }
}
