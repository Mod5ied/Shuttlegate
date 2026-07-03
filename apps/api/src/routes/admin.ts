import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq, sql, and } from 'drizzle-orm'
import { cashouts, wallets } from '../schema.js'
import { createDb } from '../lib/db.js'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { Env } from '../types.js'

function now(): string {
  return new Date().toISOString()
}

function requireAdmin(): import('hono').MiddlewareHandler {
  return async (c, next) => {
    const header = c.req.header('Authorization')
    const key = c.env.ADMIN_API_KEY
    if (!key) {
      throw new HTTPException(500, { message: 'Admin API key not configured' })
    }
    if (!header?.startsWith('Bearer ') || header.slice(7) !== key) {
      throw new HTTPException(401, { message: 'Unauthorized' })
    }
    await next()
  }
}

const ProcessBody = z.object({
  status: z.enum(['processed', 'failed']),
})

const app = new Hono<{ Bindings: Env }>()

app.use('*', requireAdmin())

app.get('/cashouts', async (c) => {
  const status = c.req.query('status')
  const db = createDb(c.env.DB)

  const conditions = []
  if (status) {
    conditions.push(eq(cashouts.status, status as 'pending' | 'processed' | 'failed'))
  }

  const rows = await db
    .select()
    .from(cashouts)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sql`${cashouts.created_at} DESC`)

  return c.json({ cashouts: rows })
})

app.post('/cashout/:id/process', zValidator('json', ProcessBody), async (c) => {
  const id = c.req.param('id')
  const body = c.req.valid('json')
  const db = createDb(c.env.DB)

  const cashout = await db.select().from(cashouts).where(eq(cashouts.id, id)).get()
  if (!cashout) {
    throw new HTTPException(404, { message: 'Cash-out not found' })
  }
  if (cashout.status !== 'pending') {
    throw new HTTPException(400, { message: 'Cash-out is not pending' })
  }

  if (body.status === 'processed') {
    await db
      .update(cashouts)
      .set({ status: 'processed' })
      .where(eq(cashouts.id, id))
  } else {
    // Failed: credit the points back to the driver's wallet.
    await db.batch([
      db
        .update(cashouts)
        .set({ status: 'failed' })
        .where(eq(cashouts.id, id)),
      db
        .update(wallets)
        .set({
          points: sql`${wallets.points} + ${cashout.points}`,
          updated_at: now(),
        })
        .where(eq(wallets.user_id, cashout.user_id)),
    ])
  }

  const updated = await db.select().from(cashouts).where(eq(cashouts.id, id)).get()
  return c.json(updated)
})

export default app
