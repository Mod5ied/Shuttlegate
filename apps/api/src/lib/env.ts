import type { Env } from '../types.js'

export function isProduction(env: Env): boolean {
  return env.ENVIRONMENT === 'production'
}

/**
 * Dev/stub fallbacks (unsigned webhooks, logged OTPs, fake payment links)
 * must default to OFF. Requiring an explicit ALLOW_DEV_STUBS=true opt-in
 * means a forgotten or misconfigured ENVIRONMENT var fails closed instead
 * of silently re-enabling insecure stub behavior.
 */
export function assertDevOnly(env: Env, feature: string): void {
  if (env.ALLOW_DEV_STUBS !== 'true') {
    throw new Error(
      `${feature} is not configured and dev stubs are disabled (set ALLOW_DEV_STUBS=true for local/dev use only)`,
    )
  }
}

const REQUIRED_PRODUCTION_SECRETS: Array<keyof Env> = [
  'JWT_SECRET',
  'FLUTTERWAVE_SECRET_KEY',
  'FLUTTERWAVE_WEBHOOK_HASH',
  'ZEPTO_API_KEY',
  'ZEPTO_SENDER_ID',
  'ADMIN_API_KEY',
]

export function missingProductionSecrets(env: Env): string[] {
  if (!isProduction(env)) return []
  return REQUIRED_PRODUCTION_SECRETS.filter((key) => !env[key])
}
