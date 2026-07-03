export interface Env {
  ENVIRONMENT: string
  // Explicit opt-in for dev/stub fallbacks (unsigned webhooks, logged OTPs,
  // fake payment links). Must never be "true" in a production deployment.
  ALLOW_DEV_STUBS?: string
  DB: D1Database
  KV: KVNamespace
  SCAN_QUEUE: Queue
  JWT_SECRET: string
  APP_URL?: string
  CURRENCY?: string
  CORS_ORIGINS?: string
  ZEPTO_API_KEY?: string
  ZEPTO_SENDER_ID?: string
  FLUTTERWAVE_PUBLIC_KEY?: string
  FLUTTERWAVE_SECRET_KEY?: string
  FLUTTERWAVE_WEBHOOK_HASH?: string
  FLUTTERWAVE_BASE_URL?: string
  ADMIN_API_KEY?: string
}
