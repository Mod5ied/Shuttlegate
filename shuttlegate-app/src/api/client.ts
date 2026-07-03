const API_BASE = 'http://localhost:8787'

export interface ApiResult<T = unknown> {
  ok: boolean
  status: number
  data: T
}

export async function apiPost<T = unknown>(
  path: string,
  body: unknown,
  opts: { token?: string; idempotencyKey?: string } = {},
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    const data = (await res.json().catch(() => ({}))) as T
    return { ok: res.ok, status: res.status, data }
  } catch {
    return { ok: false, status: 0, data: { error: 'You are offline. Please reconnect.' } as T }
  }
}

export async function apiGet<T = unknown>(
  path: string,
  token?: string,
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  try {
    const res = await fetch(`${API_BASE}${path}`, { headers })
    const data = (await res.json().catch(() => ({}))) as T
    return { ok: res.ok, status: res.status, data }
  } catch {
    return { ok: false, status: 0, data: { error: 'You are offline. Please reconnect.' } as T }
  }
}

export function generateIdempotencyKey(): string {
  return crypto.randomUUID()
}
