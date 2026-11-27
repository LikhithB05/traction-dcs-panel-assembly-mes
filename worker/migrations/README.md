# D1 Schema Migrations

- `0001_init.sql`: Initializes all 10 relational tables and 13 indexes for Cloudflare D1 (`bhel-portal-db`).

> **Security Note:** Production database snapshots (`0002_seed_recovered_data.sql`) and live PBKDF2 password hashes are excluded from this public repository. For local testing or fresh deployments, generate your own seed SQL with rotated PINs via `worker/scripts/export-sqlite-to-d1.mjs` using environment variables (`SEED_PIN_*`).
