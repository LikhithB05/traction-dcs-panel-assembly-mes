# Database Migration & Schema Adaptation Guide

## 1. Migration Overview
The application originally ran on Node.js (`server/`) with local `node:sqlite` persistence and was migrated on `26 Nov 2026` to **Cloudflare Workers + Cloudflare D1** (`worker/`) to provide zero-cost, always-on edge hosting.

## 2. Schema & Password Hashing Adaptation
- **Unified Schema (`worker/migrations/0001_init.sql`):** Preserves all **10 relational tables**, primary keys, cascading foreign keys (`ON DELETE CASCADE`), `CHECK` constraints, `UNIQUE` constraints, and **13 query indexes** to minimize D1 row-read consumption.
- **CPU-Efficient Password Hashing:** To execute well within Cloudflare Workers Free Tier's `10 ms` CPU budget per invocation, `worker/src/utils/crypto.js` hashes and verifies user PINs using native Web Crypto **`PBKDF2-SHA256`** (`50,000` iterations, `16`-byte random salt, constant-time comparison).

## 3. Migration & Local Seeding Commands
```bash
# Optional: generate custom seed SQL from a local SQLite database using env-configured PINs
SEED_PIN_KSM=<pin> SEED_PIN_PDR=<pin> SEED_PIN_CRM=<pin> SEED_PIN_AKR=<pin> SEED_PIN_CKG=<pin> \
  node worker/scripts/export-sqlite-to-d1.mjs

# Apply schema migration to local D1 emulator
cd worker
npx wrangler d1 migrations apply bhel-portal-db --local

# Apply schema migration to remote production D1
npx wrangler d1 migrations apply bhel-portal-db --remote
```
