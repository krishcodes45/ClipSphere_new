import { auth } from '@clerk/nextjs/server'
import { verifyToken } from '@clerk/backend'
import { syncUser, type AppUser } from '@/lib/auth'

export function errorJson(message: string, status = 400) {
  return Response.json({ error: message }, { status })
}

export async function apiUser(request?: Request): Promise<{ user: AppUser; response?: never } | { user?: never; response: Response }> {
  let clerkId: string | null = null
  const bearer = request?.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (bearer) {
    try {
      if (!process.env.CLERK_SECRET_KEY) throw new Error('CLERK_SECRET_KEY is not configured')
      clerkId = (await verifyToken(bearer, { secretKey: process.env.CLERK_SECRET_KEY })).sub ?? null
    } catch {
      return { response: errorJson('Sign in to continue.', 401) }
    }
  } else {
    clerkId = (await auth()).userId
  }
  if (!clerkId) return { response: errorJson('Sign in to continue.', 401) }
  try {
    return { user: await syncUser(clerkId) }
  } catch (error) {
    console.error('Unable to synchronize ClipSphere account:', error)
    return { response: errorJson('Your account could not be loaded. Please try again.', 503) }
  }
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
