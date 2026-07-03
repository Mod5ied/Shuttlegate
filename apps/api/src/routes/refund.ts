import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq, sql, and, gte } from 'drizzle-orm'
import { transactions, wallets, refunds } from '../schema.js'
import { createDb } from '../lib/db.js'
import { requireAuth } from '../lib/middleware.js'
import { RefundIssueBody } from '@shuttlegate/types'
import { HTTPException } from 'hono/http-exception'
import type { Env } from '../types.js'

function now(): string {
  return new Date().toISOString()
}

function uuid(): string {
  return crypto.randomUUID()
}

const app = new Hono<{ Bindings: Env }>()

app.use('*', requireAuth())

app.post('/issue', zValidator('json', RefundIssueBody), async (c) => {
  const { userId, role } = c.get('auth')
  const body = c.req.valid('json')
  const db = createDb(c.env.DB)

  if (role !== 'driver') {
    throw new HTTPException(403, { message: 'Only drivers can issue refunds' })
  }

  const originalTx = await db
    .select()
    .from(transactions)
    .where(eq(transactions.id, body.transaction_id))
    .get()

  if (!originalTx) {
    throw new HTTPException(404, { message: 'Transaction not found' })
  }
  if (originalTx.type !== 'payment') {
    throw new HTTPException(400, { message: 'Only payments can be refunded' })
  }
  if (!['instant', 'completed'].includes(originalTx.batch_status)) {
    throw new HTTPException(400, { message: 'Only settled payments can be refunded' })
  }
  if (originalTx.to_user_id !== userId) {
    throw new HTTPException(403, { message: 'You can only refund payments you received' })
  }

  const refundId = uuid()
  const refundTxId = uuid()
  const createdAt = now()
  const idempotencyKey = c.req.header('Idempotency-Key')!

  // Compare-and-swap debit: only succeed if the driver still has enough points.
  // This closes the race where two concurrent refunds each see a balance that
  // is individually sufficient but jointly insufficient.
  const debit = await db
    .update(wallets)
    .set({
      points: sql`${wallets.points} - ${originalTx.points}`,
      updated_at: createdAt,
    })
    .where(and(eq(wallets.user_id, userId), gte(wallets.points, originalTx.points)))
    .run()

  if (debit.meta.changes === 0) {
    throw new HTTPException(400, { message: 'Insufficient balance to issue refund' })
  }

  try {
    await db.batch([
      db.insert(refunds).values({
        id: refundId,
        transaction_id: originalTx.id,
        driver_id: userId,
        student_id: originalTx.from_user_id,
        points: originalTx.points,
        reason: body.reason,
        status: 'completed',
        created_at: createdAt,
      }),
      db
        .update(wallets)
        .set({
          points: sql`${wallets.points} + ${originalTx.points}`,
          updated_at: createdAt,
        })
        .where(eq(wallets.user_id, originalTx.from_user_id)),
      db.insert(transactions).values({
        id: refundTxId,
        session_id: originalTx.session_id,
        from_user_id: userId,
        to_user_id: originalTx.from_user_id,
        points: originalTx.points,
        type: 'refund',
        batch_status: 'instant',
        batch_epoch: 0,
        idempotency_key: idempotencyKey,
        created_at: createdAt,
      }),
    ])
  } catch (err) {
    // The driver debit already committed as a separate statement before this
    // batch. Reverse it on ANY failure here, not just the specific duplicate-
    // refund race, so a transient batch failure never leaves the driver
    // debited with no refund record.
    await db
      .update(wallets)
      .set({
        points: sql`${wallets.points} + ${originalTx.points}`,
        updated_at: now(),
      })
      .where(eq(wallets.user_id, userId))

    const message = err instanceof Error ? err.message : ''
    if (message.includes('UNIQUE constraint failed') && message.includes('refunds.transaction_id')) {
      // Another request already created the refund between our check and insert.
      throw new HTTPException(400, { message: 'This transaction has already been refunded' })
    }
    throw err
  }

  const refund = await db.select().from(refunds).where(eq(refunds.id, refundId)).get()
  return c.json(refund, 201)
})

app.get('/:id', async (c) => {
  const { userId } = c.get('auth')
  const id = c.req.param('id')
  const db = createDb(c.env.DB)

  const refund = await db.select().from(refunds).where(eq(refunds.id, id)).get()
  if (!refund) {
    throw new HTTPException(404, { message: 'Refund not found' })
  }
  if (refund.driver_id !== userId && refund.student_id !== userId) {
    throw new HTTPException(403, { message: 'Forbidden' })
  }

  return c.json(refund)
})

export default app
