import { eq, sql } from 'drizzle-orm'
import { otp_attempts } from '../schema.js'
import type { Db } from './db.js'

const OTP_ATTEMPT_LIMIT = 5

/**
 * Atomic increment via D1 INSERT ... ON CONFLICT DO UPDATE ... RETURNING.
 * D1/SQLite serializes writes, so this is safe under concurrent requests
 * for the same phone — unlike a KV get-then-put counter, which can lose
 * updates when multiple attempts land at once.
 */
export async function incrementOtpAttempts(db: Db, phone: string): Promise<number> {
  const updatedAt = new Date().toISOString()
  const row = await db
    .insert(otp_attempts)
    .values({ phone, count: 1, updated_at: updatedAt })
    .onConflictDoUpdate({
      target: otp_attempts.phone,
      set: { count: sql`${otp_attempts.count} + 1`, updated_at: updatedAt },
    })
    .returning({ count: otp_attempts.count })
    .get()
  return row?.count ?? 1
}

export async function resetOtpAttempts(db: Db, phone: string): Promise<void> {
  await db.delete(otp_attempts).where(eq(otp_attempts.phone, phone))
}

export function isOtpAttemptLimitReached(count: number): boolean {
  return count >= OTP_ATTEMPT_LIMIT
}
