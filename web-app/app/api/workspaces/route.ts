import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { apiUser, errorJson } from '@/lib/api'
import { query, transaction } from '@/lib/db'

const workspaceInput = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000).optional().default(''),
})

export async function GET(request: Request) {
  const result = await apiUser(request)
  if (result.response) return result.response
  try {
    const workspaces = await query(
      `SELECT w.id, w.name, w.description, w.visibility, m.role,
              w.created_at AS "createdAt",
              COUNT(r.id)::int AS "recordingCount"
       FROM workspace_members m
       JOIN workspaces w ON w.id = m.workspace_id
       LEFT JOIN recordings r ON r.workspace_id = w.id AND r.status <> 'FAILED'
       WHERE m.clerk_id = $1
       GROUP BY w.id, m.role
       ORDER BY w.updated_at DESC`,
      [result.user.clerkId]
    )
    return Response.json({ workspaces: workspaces.rows })
  } catch (error) {
    console.error('Unable to list workspaces:', error)
    return errorJson('Workspaces are temporarily unavailable.', 503)
  }
}

export async function POST(request: Request) {
  const result = await apiUser(request)
  if (result.response) return result.response
  const parsed = workspaceInput.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return errorJson('Enter a workspace name up to 100 characters.')
  const id = randomUUID()
  try {
    await transaction(async (client) => {
      await client.query(
        'INSERT INTO workspaces (id, name, description, created_by) VALUES ($1, $2, $3, $4)',
        [id, parsed.data.name, parsed.data.description, result.user.clerkId]
      )
      await client.query(
        "INSERT INTO workspace_members (workspace_id, clerk_id, role) VALUES ($1, $2, 'OWNER')",
        [id, result.user.clerkId]
      )
    })
    return Response.json({ workspace: { id, ...parsed.data, visibility: 'PRIVATE', role: 'OWNER' } }, { status: 201 })
  } catch (error) {
    console.error('Unable to create workspace:', error)
    return errorJson('The workspace could not be created.', 503)
  }
}
