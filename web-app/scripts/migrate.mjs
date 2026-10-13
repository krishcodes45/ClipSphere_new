import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import dotenv from 'dotenv'
import pg from 'pg'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(projectRoot, '.env.local') })

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
const migration = await readFile(path.join(projectRoot, 'migrations/001_initial.sql'), 'utf8')

try {
  await client.connect()
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())')
  await client.query('BEGIN')
  const existing = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', ['001_initial'])
  if (existing.rowCount === 0) {
    await client.query(migration)
    await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', ['001_initial'])
  }
  await client.query('COMMIT')
  process.stdout.write('Database schema is current.\n')
} catch (error) {
  await client.query('ROLLBACK').catch(() => {})
  process.stderr.write(`Database migration failed: ${error.message}\n`)
  process.exitCode = 1
} finally {
  await client.end()
}
