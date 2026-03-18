# CLiDE

**Commercium Link & Dispatch Engine** — Multi-tenant link management and SMS dispatch platform built on Cloudflare's edge infrastructure.

## Features

- **Standalone URL Shortening** — Create branded short links with custom slugs and click analytics
- **SMS Campaigns** — Upload contact CSVs, generate personalized tracking links, dispatch SMS via multiple providers
- **Click Triggers** — Automatically send follow-up SMS based on link click/no-click behavior
- **Multi-Tenant** — Workspace isolation with per-workspace SMS config and custom domains
- **Real-time Analytics** — Click tracking, SMS delivery stats, campaign performance dashboards

## Architecture

| Layer | Technology |
|-------|-----------|
| API + Redirects | Cloudflare Workers + Hono |
| Database | Cloudflare D1 (SQLite) |
| Cache / Sessions | Cloudflare KV |
| File Storage | Cloudflare R2 |
| Async Processing | Cloudflare Queues (CSV, SMS, Triggers) |
| Frontend | Next.js 15 + React 19 + Tailwind CSS 4 |
| Auth | Google OAuth (restricted to @commercium.africa) |
| SMS Providers | Kudi, Termii, Africa's Talking (per-workspace config) |

## Monorepo Structure

```
packages/
  worker/    — Cloudflare Worker (API, redirects, queues, cron)
  web/       — Next.js frontend (dashboard, admin, campaigns, links)
```

## Quick Start

```bash
npm install
```

### Worker (API)

```bash
# Create packages/worker/.dev.vars with required secrets
npm run dev -w @clide/worker
# → http://localhost:8787
```

### Frontend

```bash
npm run dev -w @clide/web
# → http://localhost:3000
```

### Database

```bash
npm run db:migrate -w @clide/worker     # local
npm run db:migrate:remote -w @clide/worker  # production
```

## Deployment

Deploy Worker:
```bash
npm run deploy -w @clide/worker
```

Deploy Frontend (Cloudflare Pages):
```bash
cd packages/web
NEXT_PUBLIC_API_URL=https://api.cmaf.cc npm run build
npx wrangler pages deploy .next --project-name=clide-web
```

## License

Proprietary — Commercium Technologies
