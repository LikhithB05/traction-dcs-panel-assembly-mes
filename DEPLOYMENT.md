# Cloud Deployment Guide

## 1. Selected Architecture & Platform Comparison

The portal runs on **Cloudflare Workers + Workers Static Assets + Cloudflare D1** (`$0/month` Free Tier, zero inactivity sleep), while retaining `Dockerfile`, `railway.json`, and `render.yaml` for self-hosted Node.js container deployments.

| Platform Option | Monthly Cost | Inactivity Sleep | Database Persistence | Status |
|---|---|---|---|---|
| **Cloudflare Workers + D1 + Static Assets** | **$0/mo** (Free Tier hard caps) | **None (`0 ms` sleep)** | Cloudflare D1 (SQLite, `500 MB` free) | **Active Production** |
| **Render / Docker Container** | Free / Paid tier | `15 min` free sleep | Persistent disk (`/var/data`) | Self-Hosted Option |
| **Railway** | Paid after trial | N/A | Persistent volume | Retired (Trial Expired) |

## 2. Cloudflare Free-Tier Quotas & Hard Limits
- **Workers Requests:** `100,000` requests/day.
- **Workers CPU Time:** `10 ms` CPU time per invocation (`PBKDF2-SHA256` runs in `<1 ms` via native Web Crypto).
- **D1 Limits:** `500 MB` storage, `5,000,000` rows read/day, `100,000` rows written/day.

## 3. Environment Variables & Secrets
- `NODE_ENV`: `"production"` (configured in `worker/wrangler.toml`)
- `JWT_SECRET`: Strong random secret stored via `npx wrangler secret put JWT_SECRET` (never committed to Git).
- `CLIENT_ORIGIN` *(optional)*: Extra allowed CORS origin if accessed from an external origin.

## 4. Build, Migrate & Deploy
```bash
# 1. Build React SPA -> client/dist/
npm run build

# 2. Configure <YOUR_CLOUDFLARE_D1_DATABASE_ID> in worker/wrangler.toml and apply schema
cd worker
npx wrangler d1 migrations apply bhel-portal-db --remote

# 3. Provision JWT_SECRET and deploy Worker + Static Assets
npx wrangler secret put JWT_SECRET
npx wrangler deploy
```

## 5. Rollback Options
- **Cloudflare Edge:** Run `npx wrangler rollback` inside `worker/` to revert immediately to the previous Worker deployment.
- **Local / Container Node.js:** Run `npm run build && npm start` (or build `Dockerfile`) with `JWT_SECRET` and `DB_PATH` configured.
