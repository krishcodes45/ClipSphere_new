import { apiUser, errorJson } from '@/lib/api'
import { query } from '@/lib/db'

type Context = { params: Promise<{ clerkId: string }> }

export async function GET(request: Request, context: Context) {
  const result = await apiUser(request)
  if (result.response) return result.response
  const { clerkId } = await context.params
  if (result.user.clerkId !== clerkId) return Response.json({ error: 'You cannot access another account.' }, { status: 403 })
  try {
    const studio = await query(
      `SELECT s.clerk_id AS id, s.clerk_id AS "userId", s.screen, s.mic, s.camera, s.preset,
              u.created_at AS "createdAt"
       FROM studio_settings s JOIN app_users u ON u.clerk_id = s.clerk_id
       WHERE s.clerk_id = $1`,
      [clerkId]
    )
    return Response.json({
      status: 200,
      user: {
        id: result.user.clerkId,
        email: result.user.email,
        firstname: result.user.firstName,
        lastname: result.user.lastName,
        createdAt: studio.rows[0]?.createdAt ?? null,
        clerkid: result.user.clerkId,
        subscription: { plan: 'FREE' },
        studio: studio.rows[0] ?? null,
      },
    })
  } catch (error) {
    console.error('Unable to load desktop profile:', error)
    return errorJson('Your ClipSphere profile is unavailable.', 503)
  }
}
