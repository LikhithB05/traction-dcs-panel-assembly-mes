# Testing & Verification Record

## 1. Automated Backend Suites (`server/tests/`)

Seven Node.js native test files (`node --test server/tests/*.test.js`) exercise the full REST API against isolated `:memory:` and disposable SQLite databases:

| Suite File | Focus Area |
|---|---|
| `auth.test.js` | Unauthenticated `401` enforcement, 5-role logins, wrong PIN/user `401`, validation `400`, JWT integrity, audit logs, full RBAC write matrix |
| `workflow.test.js` | 8-stage Traction & 6-stage DCS full lifecycles, CRM HV access, Stage 4 mechanical continuity update, Hold/Resume, Bulk Excel import, Admin Edit, Production Reports CSV formula safety |
| `capacity_and_sim.test.js` | Shared Load % equation (`5T + 15D = 100%`), `409` Overload gate, Simulator isolation, bounds validation & feasible integer outputs |
| `daily_status.test.js` | Mandatory persistence scenario (`Target=10, Actual=8` -> Variance `-2`, `80%` -> update `Actual=9` -> Variance `-1`, `90%`), 8 KSM sub-assemblies |
| `undo_and_custom_manpower.test.js` | Custom `+ Others` manpower permissions & execution, full stage-by-stage Admin Undo reversal (`8 -> 1`), DCS Undo & report check |
| `backup.test.js` | Live record counts, JSON/CSV exports, atomic ID-merge restore, malformed restore rollback, CSV quoting |
| `deployment_readiness.test.js` | `/health` check, single-port SPA `index.html`, server restart DB persistence check |

> **Verification Maintenance Note:** During post-October audit testing, `undo_and_custom_manpower.test.js` initially failed on dates outside October 2026 due to a hardcoded `startDate=2026-10-01&endDate=2026-10-31` query parameter in test case 5 (`54/56` passed on raw untouched source on `2026-11-27`). In this repository build, test case 5 uses dynamic relative UTC dates around runtime so the suite remains date-independent.

## 2. Cloudflare Worker & Production Edge Checks

- Syntax verification (`node --check`) across all 14 ES modules in `worker/src/`.
- Read-only HTTPS inspection of live endpoint `https://bhel-portal.likhithb2005.workers.dev/`:
  - `GET /health` -> `HTTP 200` (`{"status":"ok","database":"ok","runtime":"Cloudflare Workers + D1"}`)
  - `GET /` -> `HTTP 200` (`text/html`, `X-Frame-Options: DENY`)
  - `GET /api/panels` (unauthenticated) -> `HTTP 401` (`Authentication required. No session token provided.`)
- `worker/tests/e2e_verify.mjs` provides end-to-end HTTP verification for local `wrangler dev` or staging endpoints (using `TEST_PIN_*` environment variables or `dev-*-pin` local defaults).

