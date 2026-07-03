export type KV = KVNamespace

const SESSION_TTL = 7 * 24 * 60 * 60 // 7 days
const OTP_TTL = 10 * 60 // 10 minutes
const OTP_COOLDOWN_TTL = 60 // 1 minute
const IDEMPOTENCY_TTL = 24 * 60 * 60 // 24 hours

interface Session {
  userId: string
  role: string
}

interface Otp {
  code: string
}

export async function getSession(
  kv: KV,
  sessionId: string,
): Promise<Session | null> {
  const parsed = await kv.get<Session>(`session:${sessionId}`, 'json')
  return parsed && parsed.userId && parsed.role ? parsed : null
}

export async function setSession(
  kv: KV,
  sessionId: string,
  userId: string,
  role: string,
) {
  return kv.put(
    `session:${sessionId}`,
    JSON.stringify({ userId, role }),
    { expirationTtl: SESSION_TTL },
  )
}

export async function deleteSession(kv: KV, sessionId: string) {
  return kv.delete(`session:${sessionId}`)
}

export async function getOtp(kv: KV, phone: string): Promise<Otp | null> {
  const parsed = await kv.get<Otp>(`otp:${phone}`, 'json')
  return parsed && parsed.code ? parsed : null
}

export async function setOtp(kv: KV, phone: string, code: string) {
  return kv.put(`otp:${phone}`, JSON.stringify({ code }), {
    expirationTtl: OTP_TTL,
  })
}

export async function deleteOtp(kv: KV, phone: string) {
  return kv.delete(`otp:${phone}`)
}

export async function getOtpCooldown(kv: KV, phone: string): Promise<boolean> {
  const value = await kv.get(`otp_cooldown:${phone}`)
  return value !== null
}

export async function setOtpCooldown(kv: KV, phone: string) {
  return kv.put(`otp_cooldown:${phone}`, '1', { expirationTtl: OTP_COOLDOWN_TTL })
}

export async function getIdempotency<T = unknown>(kv: KV, key: string): Promise<T | null> {
  return kv.get<T>(`idempotency:${key}`, 'json')
}

export async function setIdempotency(
  kv: KV,
  key: string,
  response: unknown,
) {
  return kv.put(`idempotency:${key}`, JSON.stringify(response), {
    expirationTtl: IDEMPOTENCY_TTL,
  })
}
