import { auth } from '@clerk/nextjs/server'
import { errorJson, isUuid } from '@/lib/api'
import { workspaceRole } from '@/lib/auth'
import { query } from '@/lib/db'
import { getRecordingObject } from '@/lib/s3'
import { tokenHash } from '@/lib/security'

type Context = { params: Promise<{ recordingId: string }> }

export async function GET(request: Request, context: Context) {
  const { recordingId } = await context.params
  if (!isUuid(recordingId)) return errorJson('Recording not found.', 404)
  const result = await query<{ object_key: string; workspace_id: string }>(
    `SELECT object_key, workspace_id FROM recordings WHERE id = $1 AND status = 'READY'`,
    [recordingId]
  )
  if (!result.rowCount) return errorJson('Recording not found.', 404)

  const session = await auth()
  let allowed = Boolean(session.userId && await workspaceRole(result.rows[0].workspace_id, session.userId))
  const shareToken = new URL(request.url).searchParams.get('share')
  const publicWorkspaceId = new URL(request.url).searchParams.get('workspace')
  if (!allowed && shareToken) {
    const link = await query(
      `SELECT 1 FROM share_links WHERE workspace_id = $1 AND token_hash = $2
       AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())`,
      [result.rows[0].workspace_id, tokenHash(shareToken)]
    )
    allowed = Boolean(link.rowCount)
  }
  if (!allowed && publicWorkspaceId === result.rows[0].workspace_id) {
    const workspace = await query(
      "SELECT 1 FROM workspaces WHERE id = $1 AND visibility = 'PUBLIC'",
      [publicWorkspaceId]
    )
    allowed = Boolean(workspace.rowCount)
  }
  if (!allowed) return errorJson('Recording not found.', 404)

  try {
    const object = await getRecordingObject(result.rows[0].object_key, request.headers.get('range'))
    if (!object.Body) return errorJson('Video data is unavailable.', 404)
    const headers = new Headers({
      'Content-Type': object.ContentType || 'video/webm',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    })
    if (object.ContentLength !== undefined) headers.set('Content-Length', String(object.ContentLength))
    if (object.ContentRange) headers.set('Content-Range', object.ContentRange)
    return new Response(object.Body.transformToWebStream(), {
      status: object.ContentRange ? 206 : 200,
      headers,
    })
  } catch (error) {
    console.error('Unable to stream recording:', error)
    return errorJson('Video playback is temporarily unavailable.', 503)
  }
}
