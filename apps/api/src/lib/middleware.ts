import type { MiddlewareHandler } from 'hono'
import { verifyToken } from './auth.js'
import { getSession } from './kv.js'
import { HTTPException } from 'hono/http-exception'

export interface AuthContext {
  userId: string
  role: string
  sessionId: string
}

declare module 'hono' {
  interface ContextVariableMap {
    auth: AuthContext
  }
}

export function requireAuth(): MiddlewareHandler {
  return async (c, next) => {
    const header = c.req.header('Authorization')
    if (!header?.startsWith('Bearer ')) {
      throw new HTTPException(401, { message: 'Missing Authorization header' })
    }

    const token = header.slice(7)
    const secret = c.env.JWT_SECRET
    if (!secret) {
      throw new HTTPException(500, { message: 'JWT_SECRET not configured' })
    }

    let payload
    try {
      payload = await verifyToken(secret, token)
    } catch {
      throw new HTTPException(401, { message: 'Invalid token' })
    }

    const session = await getSession(c.env.KV, payload.sid)
    if (!session) {
      throw new HTTPException(401, { message: 'Session expired' })
    }

    c.set('auth', {
      userId: payload.sub,
      role: payload.role,
      sessionId: payload.sid,
    })

    await next()
  }
}
