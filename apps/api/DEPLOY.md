# ShuttleGate Production Deployment Runbook

## Prerequisites

- Cloudflare account with Workers, D1, KV, and Queues enabled.
- `wrangler` CLI authenticated: `wrangler login`
- Real Flutterwave, Zepto, and admin credentials ready.

## 1. Provision Cloudflare resources

```bash
# D1 database
wrangler d1 create shuttle-gate-db
# Copy the returned database_id into wrangler.toml [env.production.d1_databases]

# KV namespace
wrangler kv namespace create KV
# Copy the returned id into wrangler.toml [env.production.kv_namespaces]

# Queue (only needs to be created once per account)
wrangler queues create scan-events
```

## 2. Set production secrets

```bash
wrangler secret put JWT_SECRET --env production
wrangler secret put FLUTTERWAVE_SECRET_KEY --env production
wrangler secret put FLUTTERWAVE_WEBHOOK_HASH --env production
wrangler secret put ZEPTO_API_KEY --env production
wrangler secret put ZEPTO_SENDER_ID --env production
wrangler secret put ADMIN_API_KEY --env production
```

Plain-text vars are already set in `[env.production.vars]`:

- `ENVIRONMENT = "production"`
- `ALLOW_DEV_STUBS` is deliberately omitted so stubs fail closed.

## 3. Deploy the Worker

```bash
npm run deploy -w apps/api
```

## 4. Apply D1 migrations

```bash
wrangler d1 migrations apply shuttle-gate-db --env production
```

## 5. Verify

```bash
# Health check
curl https://<your-worker>.workers.dev/

# Smoke test (read-only, uses admin key)
ADMIN_API_KEY=<value> ./apps/api/test-smoke.sh https://<your-worker>.workers.dev
```

## 6. Mobile secure storage

Before shipping the mobile app, register the native `SecureStorageModule` in the iOS/Android host app. See `shuttlegate-app/native/SETUP.md`. The JavaScript build will fall back to insecure in-memory storage if the module is not registered.

## Rollback

Re-deploy the previous Worker version from the Cloudflare dashboard or via `wrangler rollback --env production`.
