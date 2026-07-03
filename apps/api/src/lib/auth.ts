import { SignJWT, jwtVerify } from 'jose'

const TOKEN_TTL = '7d'

export interface TokenPayload {
  sub: string // user id
  role: string
  sid: string // session id
}

export async function signToken(
  secret: string,
  payload: TokenPayload,
): Promise<string> {
  const encoder = new TextEncoder()
  return new SignJWT({ role: payload.role, sid: payload.sid })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(encoder.encode(secret))
}

export async function verifyToken(
  secret: string,
  token: string,
): Promise<TokenPayload> {
  const encoder = new TextEncoder()
  const { payload } = await jwtVerify(token, encoder.encode(secret))
  if (!payload.sub || !payload.role || !payload.sid) {
    throw new Error('invalid token payload')
  }
  return {
    sub: payload.sub,
    role: String(payload.role),
    sid: String(payload.sid),
  }
}

export function generateCode(): string {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return String(100000 + (buf[0] % 900000))
}
