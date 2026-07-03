import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq, sql, and, or, desc } from 'drizzle-orm'
import { users, wallets, payment_sessions as paymentSessions, transactions } from '../schema.js'
import { createDb } from '../lib/db.js'
import { requireAuth } from '../lib/middleware.js'
import { ScanBody } from '@shuttlegate/types'
import { HTTPException } from 'hono/http-exception'
import type { Env } from '../types.js'
import type { ScanEvent } from '../lib/queue.js'

function now(): string {
  return new Date().toISOString()
}

function uuid(): string {
  return crypto.randomUUID()
}

const app = new Hono<{ Bindings: Env }>()

app.use('*', requireAuth())

app.post('/scan', zValidator('json', ScanBody), async (c) => {
  const { userId, role } = c.get('auth')
  const body = c.req.valid('json')
  const db = createDb(c.env.DB)

  if (role !== 'student') {
    throw new HTTPException(403, { message: 'Only students can scan to pay' })
  }

  const session = await db
    .select()
    .from(paymentSessions)
    .where(eq(paymentSessions.id, body.session_id))
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

  const studentWallet = await db
    .select()
    .from(wallets)
    .where(eq(wallets.user_id, userId))
    .get()
  if (!studentWallet || studentWallet.points < session.fare_points) {
    throw new HTTPException(400, {
      message: `Insufficient balance: fare is ${session.fare_points} points, you have ${studentWallet?.points ?? 0}`,
    })
  }

  if (session.type === 'temporary') {
    // Immediate, synchronous payment
    const transactionId = uuid()
    const idempotencyKey = c.req.header('Idempotency-Key')!

    await db.batch([
      db
        .update(wallets)
        .set({
          points: sql`${wallets.points} - ${session.fare_points}`,
          updated_at: now(),
        })
        .where(eq(wallets.user_id, userId)),
      db
        .update(wallets)
        .set({
          points: sql`${wallets.points} + ${session.fare_points}`,
          updated_at: now(),
        })
        .where(eq(wallets.user_id, session.driver_id)),
      db.insert(transactions).values({
        id: transactionId,
        session_id: session.id,
        from_user_id: userId,
        to_user_id: session.driver_id,
        points: session.fare_points,
        type: 'payment',
        batch_status: 'instant',
        idempotency_key: idempotencyKey,
        created_at: now(),
      }),
    ])

    return c.json({ message: 'Payment successful', transaction_id: transactionId })
  }

  // Long-running: enqueue for sequential batch processing
  const idempotencyKey = c.req.header('Idempotency-Key')
  if (!idempotencyKey) {
    throw new HTTPException(400, { message: 'Idempotency-Key header is required' })
  }

  const event: ScanEvent = {
    session_id: session.id,
    student_id: userId,
    fare_points: session.fare_points,
    idempotency_key: idempotencyKey,
  }

  await c.env.SCAN_QUEUE.send(event)

  return c.json({ message: 'Payment queued' }, 202)
})

app.get('/history', async (c) => {
  const { userId } = c.get('auth')
  const db = createDb(c.env.DB)
  const cursor = c.req.query('cursor')
  const limit = Math.min(Number(c.req.query('limit') ?? '20'), 100)

  const conditions = [or(eq(transactions.from_user_id, userId), eq(transactions.to_user_id, userId))]
  if (cursor) {
    conditions.push(sql`${transactions.created_at} < ${cursor}`)
  }

  const rows = await db
    .select()
    .from(transactions)
    .where(and(...conditions))
    .orderBy(desc(transactions.created_at))
    .limit(limit)

  // Attach driver/student names for display
  const userIds = [...new Set(rows.flatMap((r) => [r.from_user_id, r.to_user_id]))]
  const userRows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(sql`${users.id} IN ${userIds}`)

  const names = Object.fromEntries(userRows.map((u) => [u.id, u.name]))

  return c.json({
    transactions: rows.map((row) => ({
      ...row,
      from_name: names[row.from_user_id],
      to_name: names[row.to_user_id],
    })),
    next_cursor: rows.length === limit ? rows[rows.length - 1].created_at : null,
  })
})

app.get('/transaction/:id', async (c) => {
  const { userId } = c.get('auth')
  const id = c.req.param('id')
  const db = createDb(c.env.DB)

  const tx = await db.select().from(transactions).where(eq(transactions.id, id)).get()
  if (!tx) {
    throw new HTTPException(404, { message: 'Transaction not found' })
  }
  if (tx.from_user_id !== userId && tx.to_user_id !== userId) {
    throw new HTTPException(403, { message: 'Forbidden' })
  }

  return c.json(tx)
})

function isSessionExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt) < new Date()
}

export default app
