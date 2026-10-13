import { z } from 'zod'
import { apiUser, errorJson } from '@/lib/api'
import { query } from '@/lib/db'

type Context = { params: Promise<{ id: string }> }
const settingsInput = z.object({
  screen: z.string().min(1).max(500),
  audio: z.string().max(500),
  preset: z.enum(['HD', 'SD']),
})

export async function POST(request: Request, context: Context) {
  const result = await apiUser(request)
  if (result.response) return result.response
  const { id } = await context.params
  if (result.user.clerkId !== id) return errorJson('You cannot update another account.', 403)
  const parsed = settingsInput.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return errorJson('Recording settings are invalid.')
  try {
    await query(
      `INSERT INTO studio_settings (clerk_id, screen, mic, preset)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (clerk_id) DO UPDATE SET screen = EXCLUDED.screen, mic = EXCLUDED.mic,
         preset = EXCLUDED.preset, updated_at = NOW()`,
      [id, parsed.data.screen, parsed.data.audio, parsed.data.preset]
    )
    return Response.json({ status: 200, message: 'Recording settings saved.' })
  } catch (error) {
    console.error('Unable to save studio settings:', error)
    return errorJson('Recording settings could not be saved.', 503)
  }
}
