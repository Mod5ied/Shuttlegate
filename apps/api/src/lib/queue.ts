import { eq, sql, and } from 'drizzle-orm'
import { payment_sessions as paymentSessions, transactions, wallets } from '../schema.js'
import { createDb } from './db.js'
import type { Env } from '../types.js'

export interface ScanEvent {
  session_id: string
  student_id: string
  fare_points: number
  idempotency_key: string
}

function now(): string {
  return new Date().toISOString()
}

export async function processScanEvent(env: Env, event: ScanEvent): Promise<void> {
  const db = createDb(env.DB)
  const transactionId = crypto.randomUUID()

  const session = await db
    .select()
    .from(paymentSessions)
    .where(eq(paymentSessions.id, event.session_id))
    .get()

  if (!session || session.status !== 'active') {
    throw new Error('Session not active')
  }

  if (isSessionExpired(session.expires_at)) {
    throw new Error('Session expired')
  }

  // All mutation for a single scan is folded into one atomic batch:
  // deduct student wallet, insert the transaction stamped with the current
  // batch_epoch, and increment batch_count. If any step fails, the whole
  // batch rolls back, so a retried queue message can safely re-attempt.
  //
  // batch_epoch is stamped via a correlated subquery evaluated at insert
  // time (inside this same atomic batch), not the JS-side value read at
  // the top of this function. That closes the narrow window where a
  // concurrent settleBatch() (cron or driver close-and-settle) could
  // advance the epoch between the read above and this insert committing —
  // the row now always gets whatever epoch is live at the moment it's
  // actually written, so it can never be stamped with an already-closed
  // epoch and end up orphaned.
  try {
    await db.batch([
      db
        .update(wallets)
        .set({
          points: sql`${wallets.points} - ${event.fare_points}`,
          updated_at: now(),
        })
        .where(eq(wallets.user_id, event.student_id)),
      db.insert(transactions).values({
        id: transactionId,
        session_id: event.session_id,
        from_user_id: event.student_id,
        to_user_id: session.driver_id,
        points: event.fare_points,
        type: 'payment',
        batch_status: 'pending_batch',
        batch_epoch: sql`(SELECT ${paymentSessions.batch_epoch} FROM payment_sessions WHERE ${paymentSessions.id} = ${event.session_id})`,
        idempotency_key: event.idempotency_key,
        created_at: now(),
      }),
      db
        .update(paymentSessions)
        .set({ batch_count: sql`${paymentSessions.batch_count} + 1` })
        .where(eq(paymentSessions.id, event.session_id)),
    ])
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    if (message.includes('UNIQUE constraint failed') && message.includes('transactions.idempotency_key')) {
      // Already processed this exact event; ack without re-processing.
      return
    }
    throw err
  }

  // After the atomic batch, read the updated batch_count to decide whether
  // this scan filled the car. The consumer is serialised by max_concurrency=1,
  // but we still fence settlement with batch_epoch so cron/close-and-settle
  // can't race the queue.
  const updatedSession = await db
    .select({ batch_count: paymentSessions.batch_count, capacity: paymentSessions.capacity })
    .from(paymentSessions)
    .where(eq(paymentSessions.id, event.session_id))
    .get()

  if (updatedSession && updatedSession.batch_count >= updatedSession.capacity) {
    await settleBatch(env, event.session_id)
  }
}

export async function settleBatch(env: Env, sessionId: string): Promise<void> {
  const db = createDb(env.DB)

  // Claim settlement atomically: reset batch_count and advance batch_epoch.
  // Only one caller (queue consumer, cron, or driver close) can win this race.
  const claim = await db
    .update(paymentSessions)
    .set({
      batch_count: 0,
      batch_epoch: sql`${paymentSessions.batch_epoch} + 1`,
    })
    .where(and(eq(paymentSessions.id, sessionId), sql`${paymentSessions.batch_count} > 0`))
    .returning({
      batch_epoch: paymentSessions.batch_epoch,
      driver_id: paymentSessions.driver_id,
    })
    .get()

  if (!claim) {
    // Someone else already settled this batch.
    return
  }

  const settledEpoch = claim.batch_epoch - 1
  const driverId = claim.driver_id

  // Sum and settle only transactions that belong to the epoch we just closed.
  // The SUM is evaluated inside the same atomic db.batch() as the credit and
  // the status flip, so there is no window where a racing scan can be marked
  // completed without being counted.
  await db.batch([
    db
      .update(wallets)
      .set({
        points: sql`${wallets.points} + (
          SELECT COALESCE(SUM(${transactions.points}), 0)
          FROM transactions
          WHERE ${transactions.session_id} = ${sessionId}
            AND ${transactions.batch_status} = ${'pending_batch'}
            AND ${transactions.batch_epoch} = ${settledEpoch}
        )`,
        updated_at: now(),
      })
      .where(eq(wallets.user_id, driverId)),
    db
      .update(transactions)
      .set({ batch_status: 'completed' })
      .where(
        and(
          eq(transactions.session_id, sessionId),
          eq(transactions.batch_status, 'pending_batch'),
          eq(transactions.batch_epoch, settledEpoch),
        ),
      ),
  ])
}

export async function settleStaleBatches(env: Env): Promise<void> {
  const db = createDb(env.DB)
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const staleSessions = await db
    .selectDistinct({
      id: paymentSessions.id,
    })
    .from(paymentSessions)
    .innerJoin(transactions, eq(transactions.session_id, paymentSessions.id))
    .where(
      and(
        eq(paymentSessions.type, 'long_running'),
        eq(paymentSessions.status, 'active'),
        eq(transactions.batch_status, 'pending_batch'),
        sql`${transactions.created_at} < ${cutoff}`,
      ),
    )

  for (const session of staleSessions) {
    await settleBatch(env, session.id)
  }
}

function isSessionExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt) < new Date()
}
