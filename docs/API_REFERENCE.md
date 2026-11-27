# REST API Reference

All `/api/*` endpoints (except `POST /api/auth/login`) require `Authorization: Bearer <jwt>`. Health checks are served at `GET /health` without authentication.

## Authentication (`/api/auth`)
- `POST /api/auth/login` — Body: `{ username, pin }` -> `200 { token, user }` | `400` invalid input | `401` invalid credentials | `429` rate limit exceeded (Workers).
- `GET /api/auth/me` — Validates current JWT -> `200 { user }`.
- `POST /api/auth/logout` — Writes `USER_LOGOUT` audit entry -> `200`.

## Master Data & Custom Manpower
- `GET /api/master-data` — Returns areas, shop manpower, sub-assembly specs, workflows (merged with active custom entries), and factory assumptions.
- `GET /api/custom-manpower?area=&type=&includeInactive=` — Lists dynamic workers/teams.
- `POST /api/custom-manpower` — Area Lead (own area) or Admin; creates or reactivates custom worker/team.
- `PATCH /api/custom-manpower/:id` — Toggles `is_active` or updates `members` (Area Lead / Admin).
- `DELETE /api/custom-manpower/:id` — Admin only (`requireAdmin`).

## Panels & Execution (`/api/panels`)
- `GET /api/panels?type=&area=&status=&search=` — Lists panels enriched with `stageName`, `daysInStage`, `isOverdue`, `daysOverdue`.
- `GET /api/panels/:id` — Panel detail + `stageHistory` + `holdHistory`.
- `POST /api/panels` — `KSM` or Admin; validates ID uniqueness (`409` on duplicate) and `startDate <= dueDate`.
- `POST /api/panels/bulk-import` — `KSM` or Admin; atomic all-or-nothing batch insert from parsed Excel/CSV rows (`400` on any row error).
- `PATCH /api/panels/:id/admin-edit` — Admin only; edits `project`, `startDate`, `dueDate`.
- `POST /api/panels/:id/start` — Body: `{ assignedTo, confirmedOverload?, customManpower? }`; returns HTTP `409 { requiresConfirmation: true, currentLoad }` if load hits `>= 100%` without confirmation.
- `POST /api/panels/:id/complete` — Advances `In Progress` panel to next stage (`Waiting`) or marks final stage `Done`.
- `POST /api/panels/:id/undo` — Admin only; reverses last completed stage if next stage has not started/held.
- `POST /api/panels/:id/hold` — Requires non-empty `reason`; sets `status = 'Held'`.
- `POST /api/panels/:id/resume` — Restores `In Progress` and closes open `hold_history`.
- `DELETE /api/panels/:id` — Admin only; cascades deletion of `hold_history` & `stage_history`.

## Planning, Daily Status, Overview, Reports, Simulator & Backup
- `GET /api/plans?month=YYYY-MM` | `POST /api/plans` — Returns & updates monthly plans; returns `409` if `planLoad > 100%` without `confirmedOverload: true`.
- `GET /api/daily-status?area=&date=` | `POST /api/daily-status` — Worker targets/actuals + independent `autoLoggedDone`.
- `GET /api/sub-assemblies?date=` | `POST /api/sub-assemblies` — KSM/Admin sub-assembly tracking (8 items).
- `GET /api/overview` — Live KPIs, `areaStats`, `heldPanels`, `overduePanels`, `stageCounts`, `teamWorkloads`, `bottlenecks`.
- `GET /api/reports/production?startDate=&endDate=&department=&employee=&panelType=` & `/api/reports/production/csv`.
- `POST /api/simulator/simulate` | `GET /api/simulator/scenarios` | `POST /api/simulator/scenarios` | `DELETE /api/simulator/scenarios/:id`.
- `GET /api/backup/counts` | `GET /api/backup/export-json` (Admin) | `GET /api/backup/export-csv` (Admin) | `POST /api/backup/restore` (Admin atomic ID-merge upsert).

