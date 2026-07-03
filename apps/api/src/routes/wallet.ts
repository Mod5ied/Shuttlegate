import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq, sql, and } from 'drizzle-orm'
import { users, wallets, topups } from '../schema.js'
import { createDb } from '../lib/db.js'
import { requireAuth } from '../lib/middleware.js'
import {
  createFlutterwaveConfig,
  createPaymentLink,
  verifyWebhook,
  verifyTransaction,
} from '../lib/flutterwave.js'
import { TopupInitiateBody } from '@shuttlegate/types'
import { HTTPException } from 'hono/http-exception'
import type { Env } from '../types.js'

function now(): string {
  return new Date().toISOString()
}

function uuid(): string {
  return crypto.randomUUID()
}

// ponytail: hardcoded per-transaction cap to bound blast radius.
// Upgrade path: per-user daily limit and admin-configurable cap.
const TOPUP_MAX_MINOR = 1_000_000_00 // ₦1,000,000 in kobo

const app = new Hono<{ Bindings: Env }>()

// Public webhook: Flutterwave calls this, no auth header
app.post('/topup/webhook', async (c) => {
  const body = await c.req.text()
  const signature = c.req.header('verif-hash')
  const config = createFlutterwaveConfig(c.env)

  const valid = await verifyWebhook(c.env, config, signature ?? null, body)
  if (!valid) {
    throw new HTTPException(401, { message: 'Invalid webhook signature' })
  }

  const payload = JSON.parse(body) as {
    event?: string
    data?: {
      id?: number
      tx_ref?: string
      status?: string
      amount?: number
      currency?: string
    }
  }
  const txRef = payload.data?.tx_ref
  const status = payload.data?.status

  if (!txRef) {
    throw new HTTPException(400, { message: 'Missing tx_ref' })
  }

  const db = createDb(c.env.DB)

  const topup = await db
    .select()
    .from(topups)
    .where(eq(topups.provider_ref, txRef))
    .get()
  if (!topup) {
    throw new HTTPException(404, { message: 'Topup not found' })
  }

  // Reconcile amount/currency. `amount` is required, not optionally
  // checked-if-present — a forged payload that omits it must not be able
  // to skip reconciliation by simply leaving the field out.
  const webhookAmount = payload.data?.amount
  if (webhookAmount === undefined || webhookAmount !== topup.amount_fiat / 100) {
    // Webhook amount is in base units; topup.amount_fiat is minor units
    throw new HTTPException(400, { message: 'Amount mismatch or missing' })
  }

  // When a real Flutterwave secret is configured, server-side verification
  // against Flutterwave's API is mandatory, not best-effort: a forged
  // webhook cannot dodge it by omitting the transaction id.
  if (config.secretKey) {
    const transactionId = payload.data?.id ? String(payload.data.id) : undefined
    if (!transactionId) {
      throw new HTTPException(400, { message: 'Missing transaction id' })
    }
    const verified = await verifyTransaction(c.env, config, transactionId)
    if (!verified || verified.status !== 'successful' || verified.tx_ref !== txRef) {
      throw new HTTPException(400, { message: 'Transaction verification failed' })
    }
    if (verified.amount !== topup.amount_fiat / 100) {
      throw new HTTPException(400, { message: 'Verified amount mismatch' })
    }
  }

  if (status === 'successful') {
    // Atomic compare-and-swap: only one concurrent request flips pending → confirmed
    const claim = await db
      .update(topups)
      .set({ status: 'confirmed' })
      .where(and(eq(topups.id, topup.id), eq(topups.status, 'pending')))
      .run()

    if (claim.meta.changes === 0) {
      return c.json({ message: 'Already processed' })
    }

    await db
      .update(wallets)
      .set({
        points: sql`${wallets.points} + ${topup.amount_points}`,
        updated_at: now(),
      })
      .where(eq(wallets.user_id, topup.user_id))
  } else {
    // Conditional on 'pending' too: an out-of-order/duplicate webhook must
    // never be able to flip an already-confirmed record back to 'failed'.
    await db
      .update(topups)
      .set({ status: 'failed' })
      .where(and(eq(topups.id, topup.id), eq(topups.status, 'pending')))
  }

  return c.json({ message: 'Webhook processed' })
})

// Authenticated endpoints
app.use('*', requireAuth())

app.get('/balance', async (c) => {
  const { userId } = c.get('auth')
  const db = createDb(c.env.DB)

  const wallet = await db
    .select()
    .from(wallets)
    .where(eq(wallets.user_id, userId))
    .get()
  if (!wallet) {
    throw new HTTPException(404, { message: 'Wallet not found' })
  }

  return c.json({
    id: wallet.id,
    user_id: wallet.user_id,
    points: wallet.points,
    updated_at: wallet.updated_at,
  })
})

app.post('/topup/initiate', zValidator('json', TopupInitiateBody), async (c) => {
  const { userId } = c.get('auth')
  const body = c.req.valid('json')
  const db = createDb(c.env.DB)

  if (body.amount_fiat > TOPUP_MAX_MINOR) {
    throw new HTTPException(400, { message: 'Top-up amount exceeds limit' })
  }

  const user = await db.select().from(users).where(eq(users.id, userId)).get()
  if (!user) {
    throw new HTTPException(404, { message: 'User not found' })
  }

  // ponytail: hardcoded NGN-like minor-to-major conversion (100 minors = 1 point).
  // Upgrade path: make this currency-aware when adding non-100-divisible currencies.
  if (body.amount_fiat % 100 !== 0) {
    throw new HTTPException(400, { message: 'amount_fiat must be a whole number of major currency units' })
  }
  const points = body.amount_fiat / 100
  if (points <= 0) {
    throw new HTTPException(400, { message: 'amount_fiat must be positive' })
  }

  const topupId = uuid()
  const providerRef = `sg-topup-${topupId}`
  const createdAt = now()

  await db.insert(topups).values({
    id: topupId,
    user_id: userId,
    amount_fiat: body.amount_fiat,
    amount_points: points,
    provider_ref: providerRef,
    status: 'pending',
    created_at: createdAt,
  })

  const redirectUrl = `${c.env.APP_URL ?? 'http://localhost:8787'}/wallet/topup/return`
  const config = createFlutterwaveConfig(c.env)
  const link = await createPaymentLink(c.env, config, {
    txRef: providerRef,
    amount: points,
    currency: c.env.CURRENCY ?? 'NGN',
    redirectUrl,
    customerPhone: user.phone,
    customerName: user.name,
  })

  return c.json({ topup_id: topupId, payment_link: link })
})

export default app
