import type { Context, MiddlewareHandler } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { idempotency_keys as idempotencyKeys } from '../schema.js'
import { createDb } from './db.js'
import { getIdempotency, setIdempotency } from './kv.js'
import { IdempotencyKey } from '@shuttlegate/types'

async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder()
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function idempotency(): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.method !== 'POST') {
      return next()
    }

    // External webhooks provide their own idempotency; skip them
    if (c.req.path.endsWith('/webhook')) {
      return next()
    }

    const key = c.req.header('Idempotency-Key')
    if (!key) {
      throw new HTTPException(400, { message: 'Idempotency-Key header is required' })
    }

    const parsed = IdempotencyKey.safeParse(key)
    if (!parsed.success) {
      throw new HTTPException(400, { message: 'Idempotency-Key must be a valid UUID' })
    }

    const body = await c.req.text()
    const bodyHash = await sha256(body)

    // Replay of a completed request: return cached response
    const cached = await getIdempotency<{ body_hash: string; status: number; body: unknown }>(c.env.KV, key)
    if (cached) {
      const record = cached
      if (record.body_hash !== bodyHash) {
        throw new HTTPException(409, { message: 'Idempotency-Key reused with different body' })
      }
      return c.json(record.body, record.status as ContentfulStatusCode)
    }

    // Atomically claim the key in D1 to prevent in-flight races
    const db = createDb(c.env.DB)
    try {
      await db.insert(idempotencyKeys).values({
        key,
        body_hash: bodyHash,
        created_at: new Date().toISOString(),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (message.includes('UNIQUE constraint failed')) {
        // Another request is in flight or just finished; prefer cached response
        const justCached = await getIdempotency<{ body_hash: string; status: number; body: unknown }>(c.env.KV, key)
        if (justCached) {
          const record = justCached
          if (record.body_hash !== bodyHash) {
            throw new HTTPException(409, { message: 'Idempotency-Key reused with different body' })
          }
          return c.json(record.body, record.status as ContentfulStatusCode)
        }
        throw new HTTPException(409, { message: 'Request already in progress' })
      }
      throw err
    }

    const releaseClaim = () => db.delete(idempotencyKeys).where(eq(idempotencyKeys.key, key)).run()

    try {
      await next()
    } catch (err) {
      // Hono's compose() normally converts a thrown HTTPException into a
      // response at the point it's thrown (caught below via c.res.status),
      // not by propagating a JS exception up through next(). This catch is
      // a defensive backstop for the rare non-Error throw that does bubble.
      await releaseClaim()
      throw err
    }

    const status = c.res.status
    if (status >= 200 && status < 300) {
      const cloned = c.res.clone()
      const responseBody = await cloned.json().catch(() => null)
      if (responseBody !== null) {
        await setIdempotency(c.env.KV, key, {
          body_hash: bodyHash,
          status,
          body: responseBody,
        })
        return
      }
    }

    // Non-2xx (validation error, business rule rejection, transient 5xx),
    // or a 2xx with no cacheable JSON body: release the claim rather than
    // permanently locking this key behind an unreplayable response. This
    // lets a client safely retry the same Idempotency-Key after a failure.
    await releaseClaim()
  }
}
