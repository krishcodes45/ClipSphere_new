import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export function newShareToken() {
  return randomBytes(32).toString('base64url')
}

export function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function validWebhookSecret(received: string | null) {
  const expected = process.env.CLIPSPHERE_WEBHOOK_SECRET
  if (!expected || !received) return false
  const actualBuffer = Buffer.from(received)
  const expectedBuffer = Buffer.from(expected)
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
}

export function webhookAuthorized(request: Request) {
  const authorization = request.headers.get('authorization')
  return validWebhookSecret(authorization?.replace(/^Bearer\s+/i, '') ?? null)
}
