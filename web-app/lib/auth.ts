import { auth, clerkClient } from '@clerk/nextjs/server'
import { randomUUID } from 'node:crypto'
import { query, transaction } from '@/lib/db'

export type AppUser = {
  clerkId: string
  email: string
  firstName: string | null
  lastName: string | null
}

export async function syncUser(clerkId: string): Promise<AppUser> {
  const clerk = await clerkClient()
  const identity = await clerk.users.getUser(clerkId)
  const email = identity.primaryEmailAddress?.emailAddress
    ?? identity.emailAddresses[0]?.emailAddress
  if (!email) throw new Error('Your Clerk account needs a verified email address.')

  const firstName = identity.firstName ?? null
  const lastName = identity.lastName ?? null
  await transaction(async (client) => {
    await client.query(
      `INSERT INTO app_users (clerk_id, email, first_name, last_name)
       VALUES ($1, lower($2), $3, $4)
       ON CONFLICT (clerk_id) DO UPDATE SET email = lower(EXCLUDED.email),
         first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
         updated_at = NOW()`,
      [clerkId, email, firstName, lastName]
    )
    const ownedWorkspace = await client.query(
      "SELECT 1 FROM workspace_members WHERE clerk_id = $1 AND role = 'OWNER' LIMIT 1",
      [clerkId]
    )
    if (ownedWorkspace.rowCount === 0) {
      const workspaceId = randomUUID()
      const displayName = firstName ? `${firstName}'s workspace` : 'My workspace'
      await client.query(
        'INSERT INTO workspaces (id, name, created_by) VALUES ($1, $2, $3)',
        [workspaceId, displayName, clerkId]
      )
      await client.query(
        "INSERT INTO workspace_members (workspace_id, clerk_id, role) VALUES ($1, $2, 'OWNER')",
        [workspaceId, clerkId]
      )
    }
    await client.query(
      'INSERT INTO studio_settings (clerk_id) VALUES ($1) ON CONFLICT (clerk_id) DO NOTHING',
      [clerkId]
    )
  })

  return { clerkId, email: email.toLowerCase(), firstName, lastName }
}

export async function currentUser() {
  const session = await auth()
  if (!session.userId) return null
  try {
    return await syncUser(session.userId)
  } catch (error) {
    console.error('Unable to load ClipSphere account:', error)
    return null
  }
}

export async function workspaceRole(workspaceId: string, clerkId: string) {
  const result = await query<{ role: 'OWNER' | 'EDITOR' | 'VIEWER' }>(
    'SELECT role FROM workspace_members WHERE workspace_id = $1 AND clerk_id = $2',
    [workspaceId, clerkId]
  )
  return result.rows[0]?.role ?? null
}

export async function canReadRecording(recordingId: string, clerkId: string) {
  const result = await query<{ allowed: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM recordings r
       JOIN workspace_members m ON m.workspace_id = r.workspace_id
       WHERE r.id = $1 AND m.clerk_id = $2
     ) AS allowed`,
    [recordingId, clerkId]
  )
  return result.rows[0]?.allowed ?? false
}
