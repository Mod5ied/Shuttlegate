import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq } from 'drizzle-orm'
import { users, payment_sessions as paymentSessions } from '../schema.js'
import { createDb } from '../lib/db.js'
import { requireAuth } from '../lib/middleware.js'
import { SessionCreateBody } from '@shuttlegate/types'
import { settleBatch } from '../lib/queue.js'
import { HTTPException } from 'hono/http-exception'
import type { Env } from '../types.js'

function now(): string {
  return new Date().toISOString()
}

function uuid(): string {
  return crypto.randomUUID()
}

const TEMPORARY_SESSION_TTL_HOURS = 4

const app = new Hono<{ Bindings: Env }>()

app.use('*', requireAuth())

app.post('/create', zValidator('json', SessionCreateBody), async (c) => {
  const { userId, role } = c.get('auth')
  const body = c.req.valid('json')

  if (role !== 'driver') {
    throw new HTTPException(403, { message: 'Only drivers can create sessions' })
  }

  const db = createDb(c.env.DB)
  const driver = await db.select().from(users).where(eq(users.id, userId)).get()
  if (!driver) {
    throw new HTTPException(404, { message: 'Driver not found' })
  }

  const sessionId = uuid()
  const createdAt = now()
  const expiresAt =
    body.type === 'temporary'
      ? new Date(Date.now() + TEMPORARY_SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString()
      : null

  await db.insert(paymentSessions).values({
    id: sessionId,
    driver_id: userId,
    type: body.type,
    fare_points: body.fare_points,
    capacity: body.capacity,
    batch_count: 0,
    batch_epoch: 0,
    status: 'active',
    expires_at: expiresAt,
    created_at: createdAt,
  })

  const session = await db
    .select()
    .from(paymentSessions)
    .where(eq(paymentSessions.id, sessionId))
    .get()

  return c.json(session, 201)
})

app.get('/:id', async (c) => {
  const { userId } = c.get('auth')
  const id = c.req.param('id')
  const db = createDb(c.env.DB)

  const session = await db
    .select()
    .from(paymentSessions)
    .where(eq(paymentSessions.id, id))
    .get()
  if (!session) {
    throw new HTTPException(404, { message: 'Session not found' })
  }

  // Session details are driver-owner only. Students use /qr-data for the
  // limited fare/type payload needed before scanning.
  if (session.driver_id !== userId) {
    throw new HTTPException(403, { message: 'Forbidden' })
  }

  return c.json(session)
})

app.get('/:id/qr-data', async (c) => {
  const id = c.req.param('id')
  const db = createDb(c.env.DB)

  const session = await db
    .select()
    .from(paymentSessions)
    .where(eq(paymentSessions.id, id))
    .get()
  if (!session) {
    throw new HTTPException(404, { message: 'Session not found' })
  }

  if (session.status !== 'active') {
    throw new HTTPException(400, { message: 'Session is not active' })
  }

  if (isSessionExpired(session.expires_at)) {
    throw new HTTPException(400, { message: 'Session has expired' })
  }

  return c.json({
    session_id: session.id,
    type: session.type,
    fare_points: session.fare_points,
  })
})

app.post('/:id/close', async (c) => {
  const { userId, role } = c.get('auth')
  const id = c.req.param('id')
  const db = createDb(c.env.DB)

  if (role !== 'driver') {
    throw new HTTPException(403, { message: 'Only drivers can close sessions' })
  }

  const session = await db
    .select()
    .from(paymentSessions)
    .where(eq(paymentSessions.id, id))
    .get()
  if (!session) {
    throw new HTTPException(404, { message: 'Session not found' })
  }
  if (session.driver_id !== userId) {
    throw new HTTPException(403, { message: 'Forbidden' })
  }
  if (session.status !== 'active') {
    throw new HTTPException(400, { message: 'Session is already closed' })
  }

  if (session.type === 'temporary') {
    await db
      .update(paymentSessions)
      .set({ status: 'closed' })
      .where(eq(paymentSessions.id, id))
    return c.json({ message: 'Session closed' })
  }

  // Long-running: "Close & Settle Batch" — pay out whatever is pending for
  // the current trip, then keep the banner session active for the next trip.
  await settleBatch(c.env, id)

  return c.json({ message: 'Batch settled; session remains active' })
})

function isSessionExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt) < new Date()
}

export default app
