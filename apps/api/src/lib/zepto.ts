import type { Env } from '../types.js'
import { assertDevOnly } from './env.js'

export interface ZeptoConfig {
  apiKey?: string
  senderId?: string
}

export function createZeptoConfig(env: Env): ZeptoConfig {
  return {
    apiKey: env.ZEPTO_API_KEY,
    senderId: env.ZEPTO_SENDER_ID,
  }
}

export async function sendOtp(
  env: Env,
  config: ZeptoConfig,
  phone: string,
  code: string,
): Promise<void> {
  if (!config.apiKey) {
    assertDevOnly(env, 'Zepto API key')
    // ponytail: stub in dev only; never log real OTPs in production
    console.log(`[ZEPTO STUB] OTP for ${phone}: ${code}`)
    return
  }

  const res = await fetch('https://api.zeptomail.com/v1/sms', {
    method: 'POST',
    headers: {
      Authorization: `Zoho-enczapikey ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: [{ phone }],
      sender: config.senderId ?? 'ShuttleGate',
      body: `Your ShuttleGate code is ${code}. It expires in 10 minutes.`,
    }),
  })

  if (!res.ok) {
    throw new Error(`Zepto SMS failed: ${res.status} ${await res.text()}`)
  }
}
