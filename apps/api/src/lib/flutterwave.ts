import type { Env } from '../types.js'
import { assertDevOnly } from './env.js'

export interface FlutterwaveConfig {
  publicKey?: string
  secretKey?: string
  webhookHash?: string
  baseUrl: string
}

export function createFlutterwaveConfig(env: Env): FlutterwaveConfig {
  return {
    publicKey: env.FLUTTERWAVE_PUBLIC_KEY,
    secretKey: env.FLUTTERWAVE_SECRET_KEY,
    webhookHash: env.FLUTTERWAVE_WEBHOOK_HASH,
    baseUrl: env.FLUTTERWAVE_BASE_URL ?? 'https://api.flutterwave.com/v3',
  }
}

export async function createPaymentLink(
  env: Env,
  config: FlutterwaveConfig,
  opts: {
    txRef: string
    amount: number
    currency: string
    redirectUrl: string
    customerPhone: string
    customerName: string
  },
): Promise<string> {
  if (!config.secretKey) {
    assertDevOnly(env, 'Flutterwave secret key')
    return `${opts.redirectUrl}?status=successful&tx_ref=${opts.txRef}&transaction_id=stub-${opts.txRef}`
  }

  const res = await fetch(`${config.baseUrl}/payments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tx_ref: opts.txRef,
      amount: opts.amount,
      currency: opts.currency,
      redirect_url: opts.redirectUrl,
      customer: {
        phone_number: opts.customerPhone,
        name: opts.customerName,
      },
      payment_options: 'card,ussd,mpesa,mobilemoney',
    }),
  })

  const data = (await res.json()) as { status?: string; data?: { link?: string }; message?: string }
  if (!res.ok || data.status !== 'success' || !data.data?.link) {
    throw new Error(`Flutterwave payment link failed: ${data.message ?? await res.text()}`)
  }
  return data.data.link
}

export async function verifyTransaction(
  env: Env,
  config: FlutterwaveConfig,
  transactionId: string,
): Promise<{ status: string; amount: number; currency: string; tx_ref: string } | null> {
  if (!config.secretKey) {
    assertDevOnly(env, 'Flutterwave secret key')
    return null
  }

  const res = await fetch(`${config.baseUrl}/transactions/${transactionId}/verify`, {
    headers: { Authorization: `Bearer ${config.secretKey}` },
  })

  const data = (await res.json()) as {
    status?: string
    data?: { status: string; amount: number; currency: string; tx_ref: string }
    message?: string
  }
  if (!res.ok || data.status !== 'success' || !data.data) {
    throw new Error(`Flutterwave verify failed: ${data.message ?? await res.text()}`)
  }
  return data.data
}

export async function verifyWebhook(
  env: Env,
  config: FlutterwaveConfig,
  signature: string | null,
  body: string,
): Promise<boolean> {
  if (!config.webhookHash) {
    assertDevOnly(env, 'Flutterwave webhook hash')
    return true
  }
  if (!signature) return false

  const expected = await hmacSha256(body, config.webhookHash)
  return timingSafeEqual(signature, expected)
}

async function hmacSha256(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}
