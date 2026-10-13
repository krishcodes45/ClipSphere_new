import { z } from 'zod'
import { apiUser, errorJson, isUuid } from '@/lib/api'
import { workspaceRole } from '@/lib/auth'
import { query } from '@/lib/db'

type Context = { params: Promise<{ workspaceId: string }> }
const updateInput = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(1000).optional(),
  visibility: z.enum(['PRIVATE', 'PUBLIC']).optional(),
}).refine((input) => Object.keys(input).length > 0)

export async function GET(_request: Request, context: Context) {
  const result = await apiUser(_request)
  if (result.response) return result.response
  const { workspaceId } = await context.params
  if (!isUuid(workspaceId)) return errorJson('Workspace not found.', 404)
  const role = await workspaceRole(workspaceId, result.user.clerkId)
  if (!role) return errorJson('Workspace not found.', 404)
  try {
    const [workspace, recordings, members] = await Promise.all([
      query('SELECT id, name, description, visibility, created_at AS "createdAt" FROM workspaces WHERE id = $1', [workspaceId]),
      query(
        `SELECT r.id, r.title, r.description, r.status, r.created_at AS "createdAt",
                u.first_name AS "firstName", u.last_name AS "lastName"
         FROM recordings r JOIN app_users u ON u.clerk_id = r.owner_id
         WHERE r.workspace_id = $1 AND r.status <> 'FAILED'
         ORDER BY r.created_at DESC`,
        [workspaceId]
      ),
      query(
        `SELECT u.clerk_id AS id, u.email, u.first_name AS "firstName",
                u.last_name AS "lastName", m.role
         FROM workspace_members m JOIN app_users u ON u.clerk_id = m.clerk_id
         WHERE m.workspace_id = $1 ORDER BY m.joined_at`,
        [workspaceId]
      ),
    ])
    return Response.json({ workspace: { ...workspace.rows[0], role }, recordings: recordings.rows, members: members.rows })
  } catch (error) {
    console.error('Unable to load workspace:', error)
    return errorJson('Workspace content is temporarily unavailable.', 503)
  }
}

export async function PATCH(request: Request, context: Context) {
  const result = await apiUser(request)
  if (result.response) return result.response
  const { workspaceId } = await context.params
  if (!isUuid(workspaceId)) return errorJson('Workspace not found.', 404)
  const role = await workspaceRole(workspaceId, result.user.clerkId)
  if (!role || role === 'VIEWER') return errorJson('You cannot edit this workspace.', 403)
  const parsed = updateInput.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return errorJson('Workspace details are invalid.')
  if (parsed.data.visibility && role !== 'OWNER') return errorJson('Only the workspace owner can change visibility.', 403)

  const updates = parsed.data
  const values = [workspaceId]
  const setters: string[] = []
  for (const key of ['name', 'description', 'visibility'] as const) {
    const value = updates[key]
    if (value !== undefined) {
      values.push(value)
      setters.push(`${key} = $${values.length}`)
    }
  }
  setters.push('updated_at = NOW()')
  try {
    const saved = await query(
      `UPDATE workspaces SET ${setters.join(', ')} WHERE id = $1 RETURNING id, name, description, visibility`,
      values
    )
    return Response.json({ workspace: saved.rows[0] })
  } catch (error) {
    console.error('Unable to update workspace:', error)
    return errorJson('Workspace changes could not be saved.', 503)
  }
}
