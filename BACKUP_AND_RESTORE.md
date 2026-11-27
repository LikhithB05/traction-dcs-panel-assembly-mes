# Backup and Restore Procedures

## 1. Automated In-Portal Backups (Admin Only)
1. Sign in as `akr` or `ckg` (Master Administrator).
2. Open the **Backup & Master Data** tab.
3. Click **Download Full Backup (JSON)** to export all `panels`, `stage_history`, `hold_history`, `monthly_plans`, `daily_status`, `sub_assembly`, `what_if_scenarios`, and `audit_logs` records.
4. Click **Download Panels CSV (Excel)** for spreadsheet-safe archival.

## 2. Cloudflare D1 Command-Line Backup & Time Travel
Cloudflare D1 Free Tier includes **7 days of Time Travel** (point-in-time recovery):
```bash
cd worker
# Export remote D1 database to a local ignored backup directory
mkdir -p ../backups
npx wrangler d1 export bhel-portal-db --remote --output=../backups/d1_backup_$(date +%Y%m%d).sql

# Inspect D1 Time Travel restore points
npx wrangler d1 time-travel info bhel-portal-db
```

## 3. Safe Merge Restore via Portal UI
1. In **Backup & Master Data**, paste a valid JSON backup payload (`{"metadata": ..., "data": ...}`) into **Safe Restore from Backup JSON**.
2. Click **Execute Safe Restore**. The backend executes an atomic batch/transaction ID-based merge (`ON CONFLICT DO UPDATE`), preserving non-conflicting records and rolling back cleanly if any record fails validation.
