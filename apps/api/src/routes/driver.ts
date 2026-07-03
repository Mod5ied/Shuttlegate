import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq, sql, and, gte } from 'drizzle-orm'
import { transactions, wallets, cashouts } from '../schema.js'
import { createDb } from '../lib/db.js'
import { requireAuth } from '../lib/middleware.js'
import { CashoutBody } from '@shuttlegate/types'
import { HTTPException } from 'hono/http-exception'
import type { Env } from '../types.js'

function now(): string {
  return new Date().toISOString()
}

function uuid(): string {
  return crypto.randomUUID()
}

// 1 point = 1 base currency unit = 100 minor units (e.g. kobo).
const POINTS_TO_MINOR = 100

const app = new Hono<{ Bindings: Env }>()

app.use('*', requireAuth())

app.post('/cashout', zValidator('json', CashoutBody), async (c) => {
  const { userId, role } = c.get('auth')
  const body = c.req.valid('json')
  const db = createDb(c.env.DB)

  if (role !== 'driver') {
    throw new HTTPException(403, { message: 'Only drivers can cash out' })
  }

  const cashoutId = uuid()
  const createdAt = now()

  // Compare-and-swap debit: only succeed if the driver still has enough points.
  // This closes the race where two concurrent cash-outs both see a balance that
  // is individually sufficient but jointly insufficient.
  const debit = await db
    .update(wallets)
    .set({
      points: sql`${wallets.points} - ${body.points}`,
      updated_at: createdAt,
    })
    .where(and(eq(wallets.user_id, userId), gte(wallets.points, body.points)))
    .run()

  if (debit.meta.changes === 0) {
    throw new HTTPException(400, { message: 'Insufficient balance for cash-out' })
  }

  try {
    await db.insert(cashouts).values({
      id: cashoutId,
      user_id: userId,
      points: body.points,
      amount_fiat: body.points * POINTS_TO_MINOR,
      destination: body.destination,
      status: 'pending',
      created_at: createdAt,
    })
  } catch (err) {
    // The debit already committed as a separate statement; if recording the
    // cash-out fails for any reason, reverse it rather than leaving the
    // driver silently out of pocket with no cash-out record.
    await db
      .update(wallets)
      .set({ points: sql`${wallets.points} + ${body.points}`, updated_at: now() })
      .where(eq(wallets.user_id, userId))
    throw err
  }

  const cashout = await db.select().from(cashouts).where(eq(cashouts.id, cashoutId)).get()
  return c.json(cashout, 201)
})

app.get('/cashout/:id', async (c) => {
  const { userId } = c.get('auth')
  const id = c.req.param('id')
  const db = createDb(c.env.DB)

  const cashout = await db.select().from(cashouts).where(eq(cashouts.id, id)).get()
  if (!cashout) {
    throw new HTTPException(404, { message: 'Cash-out not found' })
  }
  if (cashout.user_id !== userId) {
    throw new HTTPException(403, { message: 'Forbidden' })
  }

  return c.json(cashout)
})

app.get('/earnings', async (c) => {
  const { userId, role } = c.get('auth')
  const db = createDb(c.env.DB)

  if (role !== 'driver') {
    throw new HTTPException(403, { message: 'Only drivers can view earnings' })
  }

  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)
  const todayIso = todayStart.toISOString()

  const todayCondition = gte(transactions.created_at, todayIso)

  const [allTimePayments, todayPayments, allTimeRefunds, todayRefunds] = await db.batch([
    db
      .select({ total: sql<number>`COALESCE(SUM(${transactions.points}), 0)` })
      .from(transactions)
      .where(
        and(
          eq(transactions.to_user_id, userId),
          eq(transactions.type, 'payment'),
          sql`${transactions.batch_status} IN ('instant', 'completed')`,
        ),
      ),
    db
      .select({ total: sql<number>`COALESCE(SUM(${transactions.points}), 0)` })
      .from(transactions)
      .where(
        and(
          eq(transactions.to_user_id, userId),
          eq(transactions.type, 'payment'),
          sql`${transactions.batch_status} IN ('instant', 'completed')`,
          todayCondition,
        ),
      ),
    db
      .select({ total: sql<number>`COALESCE(SUM(${transactions.points}), 0)` })
      .from(transactions)
      .where(and(eq(transactions.from_user_id, userId), eq(transactions.type, 'refund'))),
    db
      .select({ total: sql<number>`COALESCE(SUM(${transactions.points}), 0)` })
      .from(transactions)
      .where(
        and(eq(transactions.from_user_id, userId), eq(transactions.type, 'refund'), todayCondition),
      ),
  ])

  const allTimePoints =
    Number(allTimePayments[0]?.total ?? 0) - Number(allTimeRefunds[0]?.total ?? 0)
  const todayPoints =
    Number(todayPayments[0]?.total ?? 0) - Number(todayRefunds[0]?.total ?? 0)

  return c.json({
    today: {
      points: todayPoints,
      amount_fiat: todayPoints * POINTS_TO_MINOR,
    },
    all_time: {
      points: allTimePoints,
      amount_fiat: allTimePoints * POINTS_TO_MINOR,
    },
  })
})

export default app
