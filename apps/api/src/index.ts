import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import auth from './routes/auth.js'
import wallet from './routes/wallet.js'
import session from './routes/session.js'
import payment from './routes/payment.js'
import refund from './routes/refund.js'
import driver from './routes/driver.js'
import admin from './routes/admin.js'
import { idempotency } from './lib/idempotency.js'
import { isProduction, missingProductionSecrets } from './lib/env.js'
import { processScanEvent, settleStaleBatches } from './lib/queue.js'
import type { Env } from './types.js'
import type { ScanEvent } from './lib/queue.js'

const app = new Hono<{ Bindings: Env }>()

// Fail closed at request time if a production deploy is missing required
// secrets, rather than letting individual routes silently fall back to
// insecure dev stubs (see lib/env.ts assertDevOnly).
app.use('*', async (c, next) => {
  const missing = missingProductionSecrets(c.env)
  if (missing.length > 0) {
    console.error(`Refusing to serve: missing production secrets: ${missing.join(', ')}`)
    return c.json({ error: 'Service misconfigured' }, 500)
  }
  await next()
})

app.use('*', cors({
  origin: (origin, ctx) => {
    const allowlist = (ctx.env.CORS_ORIGINS ?? '')
      .split(',')
      .map((o: string) => o.trim())
      .filter(Boolean)
    if (allowlist.length > 0) {
      return origin && allowlist.includes(origin) ? origin : null
    }
    // No allowlist configured: permissive in dev for convenience, but
    // deny cross-origin browser requests by default in production rather
    // than falling back to a wildcard. Mobile app traffic is unaffected —
    // CORS is a browser-only enforcement mechanism.
    return isProduction(ctx.env) ? null : (origin ?? '*')
  },
  allowHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'],
}))
app.use('*', idempotency())

app.get('/', (c) => c.json({ ok: true, service: 'shuttlegate-api' }))

app.route('/auth', auth)
app.route('/wallet', wallet)
app.route('/session', session)
app.route('/payment', payment)
app.route('/refund', refund)
app.route('/driver', driver)
app.route('/admin', admin)

app.notFound((c) => c.json({ error: 'Not found' }, 404))

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status)
  }
  console.error(err)
  return c.json({ error: 'Internal server error' }, 500)
})

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        await processScanEvent(env, message.body as ScanEvent)
        message.ack()
      } catch (err) {
        console.error('Queue consumer failed:', err)
        message.retry()
      }
    }
  },
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('Running scheduled batch timeout job', event.cron)
    ctx.waitUntil(settleStaleBatches(env))
  },
}
