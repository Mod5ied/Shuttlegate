import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq } from 'drizzle-orm'
import { users, wallets } from '../schema.js'
import { createDb } from '../lib/db.js'
import { generateCode, signToken } from '../lib/auth.js'
import {
  setOtp,
  getOtp,
  deleteOtp,
  setSession,
  getSession,
  deleteSession,
  getOtpCooldown,
  setOtpCooldown,
} from '../lib/kv.js'
import {
  incrementOtpAttempts,
  resetOtpAttempts,
  isOtpAttemptLimitReached,
} from '../lib/otp-attempts.js'
import { createZeptoConfig, sendOtp } from '../lib/zepto.js'
import {
  RegisterBody,
  OtpRequestBody,
  OtpVerifyBody,
  type User,
} from '@shuttlegate/types'
import { HTTPException } from 'hono/http-exception'
import type { Env } from '../types.js'

function now(): string {
  return new Date().toISOString()
}

function uuid(): string {
  return crypto.randomUUID()
}

const app = new Hono<{ Bindings: Env }>()

app.post('/register', zValidator('json', RegisterBody), async (c) => {
  const body = c.req.valid('json')
  const db = createDb(c.env.DB)

  // ponytail: let the DB unique constraint be the final arbiter; catch it for a clean 409
  try {
    const userId = uuid()
    const walletId = uuid()
    const createdAt = now()

    await db.batch([
      db.insert(users).values({
        id: userId,
        name: body.name,
        phone: body.phone,
        role: body.role,
        created_at: createdAt,
      }),
      db.insert(wallets).values({
        id: walletId,
        user_id: userId,
        points: 0,
        updated_at: createdAt,
      }),
    ])

    const user: User = {
      id: userId,
      name: body.name,
      phone: body.phone,
      role: body.role,
      created_at: createdAt,
    }

    return c.json(user, 201)
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    if (message.includes('UNIQUE constraint failed') && message.includes('users.phone')) {
      throw new HTTPException(409, { message: 'Phone number already registered' })
    }
    throw err
  }
})

app.post('/otp/request', zValidator('json', OtpRequestBody), async (c) => {
  const { phone } = c.req.valid('json')
  const db = createDb(c.env.DB)

  const user = await db.select().from(users).where(eq(users.phone, phone)).get()
  if (!user) {
    // ponytail: do not reveal whether phone exists
    return c.json({ message: 'OTP sent if phone is registered' })
  }

  const cooldown = await getOtpCooldown(c.env.KV, phone)
  if (cooldown) {
    throw new HTTPException(429, { message: 'Please wait before requesting a new OTP' })
  }

  const code = generateCode()
  await setOtp(c.env.KV, phone, code)
  await setOtpCooldown(c.env.KV, phone)
  await resetOtpAttempts(db, phone)

  const config = createZeptoConfig(c.env)
  await sendOtp(c.env, config, phone, code)

  return c.json({ message: 'OTP sent if phone is registered' })
})

app.post('/otp/verify', zValidator('json', OtpVerifyBody), async (c) => {
  const { phone, code } = c.req.valid('json')
  const db = createDb(c.env.DB)

  const user = await db.select().from(users).where(eq(users.phone, phone)).get()
  if (!user) {
    throw new HTTPException(404, { message: 'User not found' })
  }

  const otp = await getOtp(c.env.KV, phone)
  if (!otp) {
    throw new HTTPException(400, { message: 'Invalid or expired OTP' })
  }

  const attempts = await incrementOtpAttempts(db, phone)
  if (isOtpAttemptLimitReached(attempts)) {
    await deleteOtp(c.env.KV, phone)
    throw new HTTPException(429, { message: 'Too many attempts. Request a new OTP.' })
  }

  if (otp.code !== code) {
    throw new HTTPException(400, { message: 'Invalid or expired OTP' })
  }

  await deleteOtp(c.env.KV, phone)
  await resetOtpAttempts(db, phone)

  const sessionId = uuid()
  await setSession(c.env.KV, sessionId, user.id, user.role)

  const secret = c.env.JWT_SECRET
  if (!secret) {
    throw new HTTPException(500, { message: 'JWT_SECRET not configured' })
  }

  const token = await signToken(secret, {
    sub: user.id,
    role: user.role,
    sid: sessionId,
  })

  const responseUser: User = {
    id: user.id,
    name: user.name,
    phone: user.phone,
    role: user.role as User['role'],
    created_at: user.created_at,
  }

  return c.json({ token, user: responseUser })
})

app.post('/refresh', async (c) => {
  const header = c.req.header('Authorization')
  if (!header?.startsWith('Bearer ')) {
    throw new HTTPException(401, { message: 'Missing Authorization header' })
  }

  const secret = c.env.JWT_SECRET
  if (!secret) {
    throw new HTTPException(500, { message: 'JWT_SECRET not configured' })
  }

  const { verifyToken } = await import('../lib/auth.js')
  let payload
  try {
    payload = await verifyToken(secret, header.slice(7))
  } catch {
    throw new HTTPException(401, { message: 'Invalid token' })
  }

  const session = await getSession(c.env.KV, payload.sid)
  if (!session) {
    throw new HTTPException(401, { message: 'Session expired' })
  }

  // Rotate session ID on refresh to bound replay window
  const newSid = uuid()
  await setSession(c.env.KV, newSid, payload.sub, payload.role)
  await deleteSession(c.env.KV, payload.sid)

  const token = await signToken(secret, {
    sub: payload.sub,
    role: payload.role,
    sid: newSid,
  })

  return c.json({ token })
})

export default app
