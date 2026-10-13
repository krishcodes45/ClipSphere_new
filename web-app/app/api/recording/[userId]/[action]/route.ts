import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { errorJson, isUuid } from '@/lib/api'
import { query } from '@/lib/db'
import { workspaceRole } from '@/lib/auth'
import { webhookAuthorized } from '@/lib/security'

type Context = { params: Promise<{ userId: string; action: string }> }
const filenameSchema = z.string().regex(/^[0-9a-f-]{36}-[a-zA-Z0-9_-]{1,16}(?:-[0-9a-f-]{36})?\.webm$/i)
const webhookPayload = z.object({
  filename: filenameSchema,
  workspaceId: z.string().uuid().optional(),
  transcript: z.string().max(2_000_000).optional(),
  content: z.string().max(20_000).optional(),
})

export async function POST(request: Request, context: Context) {
  if (!webhookAuthorized(request)) return errorJson('Unauthorized service callback.', 401)
  const { userId, action } = await context.params
  if (userId.length > 255) return errorJson('Invalid user.', 400)
  const parsed = webhookPayload.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return errorJson('Invalid recording callback.', 400)
  const { filename, workspaceId, transcript = '', content = '' } = parsed.data

  try {
    if (action === 'processing') {
      const selectedRole = workspaceId ? await workspaceRole(workspaceId, userId) : null
      if (workspaceId && selectedRole !== 'OWNER' && selectedRole !== 'EDITOR') {
        return errorJson('The recording workspace is unavailable or read-only.', 403)
      }
      const workspace = workspaceId ? { rows: [{ id: workspaceId }], rowCount: 1 } : await query<{ id: string }>(
        `SELECT w.id FROM workspaces w JOIN workspace_members m ON m.workspace_id = w.id
         WHERE m.clerk_id = $1 AND m.role IN ('OWNER', 'EDITOR')
         ORDER BY (m.role = 'OWNER') DESC, m.joined_at ASC LIMIT 1`,
        [userId]
      )
      if (!workspace.rowCount) return errorJson('The recording owner has no workspace.', 404)
      await query(
        `INSERT INTO recordings (id, object_key, owner_id, workspace_id, title, status)
         VALUES ($1, $2, $3, $4, 'Processing recording', 'PROCESSING')
         ON CONFLICT (object_key) DO UPDATE SET workspace_id = EXCLUDED.workspace_id, status = 'PROCESSING', updated_at = NOW()`,
        [randomUUID(), filename, userId, workspace.rows[0].id]
      )
      return Response.json({ status: 'PROCESSING' }, { status: 202 })
    }

    if (action === 'transcribe') {
      let metadata: { title?: string; summary?: string } = {}
      try {
        const cleanContent = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
        metadata = JSON.parse(cleanContent)
      } catch {
        metadata = { summary: content }
      }
      const result = await query(
        `UPDATE recordings SET transcript = $1,
           title = COALESCE(NULLIF(left($2, 160), ''), title),
           description = left($3, 4000), updated_at = NOW()
         WHERE owner_id = $4 AND object_key = $5 RETURNING id`,
        [transcript, metadata.title ?? '', metadata.summary ?? '', userId, filename]
      )
      if (!result.rowCount) return errorJson('Recording not found.', 404)
      return Response.json({ status: 'TRANSCRIBED' })
    }

    if (action === 'complete') {
      const result = await query(
        `UPDATE recordings SET status = 'READY', updated_at = NOW()
         WHERE owner_id = $1 AND object_key = $2 RETURNING id`,
        [userId, filename]
      )
      if (!result.rowCount) return errorJson('Recording not found.', 404)
      return Response.json({ status: 'READY' })
    }

    if (action === 'failed') {
      await query(
        `UPDATE recordings SET status = 'FAILED', updated_at = NOW()
         WHERE owner_id = $1 AND object_key = $2`,
        [userId, filename]
      )
      return Response.json({ status: 'FAILED' })
    }

    return errorJson('Unknown callback action.', 404)
  } catch (error) {
    console.error('Recording service callback failed:', error)
    return errorJson('Recording status could not be updated.', 503)
  }
}
