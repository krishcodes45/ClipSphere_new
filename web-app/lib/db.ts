import { Pool, type QueryResultRow } from 'pg'

const globalForPool = globalThis as typeof globalThis & { clipspherePool?: Pool }

export const pool = globalForPool.clipspherePool ?? new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
})

if (process.env.NODE_ENV !== 'production') globalForPool.clipspherePool = pool

export async function query<T extends QueryResultRow = QueryResultRow>(sql: string, values: unknown[] = []) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured')
  return pool.query<T>(sql, values)
}

export async function transaction<T>(work: (client: import('pg').PoolClient) => Promise<T>) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
