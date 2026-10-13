import { z } from 'zod'
import { apiUser, errorJson, isUuid } from '@/lib/api'
import { workspaceRole } from '@/lib/auth'
import { query } from '@/lib/db'

type Context = { params: Promise<{ recordingId: string }> }
const editInput = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(4000).optional(),
}).refine((input) => Object.keys(input).length > 0)

export async function PATCH(request: Request, context: Context) {
  const result = await apiUser(request)
  if (result.response) return result.response
  const { recordingId } = await context.params
  if (!isUuid(recordingId)) return errorJson('Recording not found.', 404)
  const parsed = editInput.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return errorJson('Recording details are invalid.')
  try {
    const recording = await query<{ workspace_id: string }>('SELECT workspace_id FROM recordings WHERE id = $1', [recordingId])
    if (!recording.rowCount) return errorJson('Recording not found.', 404)
    const role = await workspaceRole(recording.rows[0].workspace_id, result.user.clerkId)
    if (!role || role === 'VIEWER') return errorJson('You cannot edit this recording.', 403)
    const values: unknown[] = [recordingId]
    const setters: string[] = []
    if (parsed.data.title !== undefined) { values.push(parsed.data.title); setters.push(`title = $${values.length}`) }
    if (parsed.data.description !== undefined) { values.push(parsed.data.description); setters.push(`description = $${values.length}`) }
    setters.push('updated_at = NOW()')
    await query(`UPDATE recordings SET ${setters.join(', ')} WHERE id = $1`, values)
    return Response.json({ status: 'saved' })
  } catch (error) {
    console.error('Unable to save recording metadata:', error)
    return errorJson('Recording details could not be saved.', 503)
  }
}
