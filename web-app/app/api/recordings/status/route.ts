import { apiUser, errorJson } from '@/lib/api'
import { query } from '@/lib/db'

const filenamePattern = /^[0-9a-f-]{36}-[a-zA-Z0-9_-]{1,16}(?:-[0-9a-f-]{36})?\.webm$/i

export async function GET(request: Request) {
  const result = await apiUser(request)
  if (result.response) return result.response
  const filename = new URL(request.url).searchParams.get('filename')
  if (!filename || !filenamePattern.test(filename)) return errorJson('Recording not found.', 404)
  try {
    const recording = await query<{ status: 'PROCESSING' | 'READY' | 'FAILED' }>(
      'SELECT status FROM recordings WHERE object_key = $1 AND owner_id = $2 LIMIT 1',
      [filename, result.user.clerkId]
    )
    return Response.json({ status: recording.rows[0]?.status ?? 'PROCESSING' }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Unable to check recording status:', error)
    return errorJson('Recording status is temporarily unavailable.', 503)
  }
}
