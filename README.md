# ShuttleGate

Cashless campus transport payments. Students top up a points wallet and pay drivers by scanning a QR code; drivers collect fares, issue refunds, and cash out their earnings.

Built for African campuses with variable connectivity, edge-deployed and always available.
## How it works

- **Students** register with a phone number, verify via SMS OTP, top up their wallet, and pay for rides by scanning a driver's QR code.
- **Drivers** generate two kinds of QR codes: a **temporary** session for a single trip, or a **long-running "banner" QR** that can be printed and left on the windshield, collecting fares from multiple riders over time.
- Drivers can issue refunds, view earnings, and request cash-outs to mobile money or bank.

## Stack

| Layer | Technology |
|---|---|
| Mobile app | [Lynx](https://lynxjs.org/) |
| API | [Cloudflare Workers](https://workers.cloudflare.com/) ([Hono](https://hono.dev/)) |
| Database | [Cloudflare D1](https://developers.cloudflare.com/d1/) via [Drizzle ORM](https://orm.drizzle.team/) |
| Sessions / caching | [Cloudflare KV](https://developers.cloudflare.com/kv/) |
| Async processing | [Cloudflare Queues](https://developers.cloudflare.com/queues/) |
| Payments | [Flutterwave](https://flutterwave.com/) |
| SMS | [Zepto](https://www.zoho.com/zeptomail/) |

Monorepo, npm workspaces:

```
apps/api/          Cloudflare Workers API
shuttlegate-app/    Lynx mobile app
packages/types/     Shared Zod schemas / TypeScript types
```

## Getting started

Requirements: Node 20+, npm.

```bash
# Install dependencies
npm install

# Build the shared types package
npm run build -w @shuttlegate/types

# Copy the example env file and fill in local dev values
cp apps/api/.dev.vars.example apps/api/.dev.vars

# Apply database migrations locally
npm run db:migrate:local -w apps/api

# Start the API (http://localhost:8787)
npm run api

# In another terminal, start the mobile dev server
npm run mobile
```

The API runs entirely on Cloudflare's local dev tooling (`wrangler dev`) — no external services are required for local development; third-party integrations (payments, SMS) fall back to safe local stubs when their credentials aren't configured.

## Deploying

Deployment targets Cloudflare Workers, D1, KV, and Queues. See `apps/api/DEPLOY.md` for the full production runbook (provisioning, secrets, migrations, smoke test).

## License

MIT — see [LICENSE](./LICENSE).
