-- Migration 0001: Initial BHEL Portal Schema + Free-Tier Optimization Indexes

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('KSM', 'PDR', 'CRM', 'AKR', 'CKG')),
  display_name TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS panels (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('Traction', 'DCS')),
  project TEXT NOT NULL,
  priority TEXT NOT NULL CHECK(priority IN ('High', 'Medium', 'Low')),
  start_date TEXT,
  due_date TEXT NOT NULL,
  current_stage INTEGER NOT NULL,
  current_area TEXT NOT NULL CHECK(current_area IN ('KSM', 'PDR', 'CRM')),
  status TEXT NOT NULL CHECK(status IN ('Waiting', 'In Progress', 'Held', 'Done')),
  assigned_to TEXT,
  hold_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stage_history (
  id TEXT PRIMARY KEY,
  panel_id TEXT NOT NULL REFERENCES panels(id) ON DELETE CASCADE,
  stage_number INTEGER NOT NULL,
  stage_name TEXT NOT NULL,
  area TEXT NOT NULL,
  assigned_to TEXT,
  started_at TEXT,
  completed_at TEXT,
  hold_reason TEXT,
  undone_at TEXT,
  undone_by TEXT,
  undo_reason TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hold_history (
  id TEXT PRIMARY KEY,
  panel_id TEXT NOT NULL REFERENCES panels(id) ON DELETE CASCADE,
  stage_number INTEGER NOT NULL,
  held_at TEXT NOT NULL,
  resumed_at TEXT,
  reason TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS monthly_plans (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL,
  area TEXT NOT NULL,
  team_or_person TEXT NOT NULL,
  traction_plan REAL NOT NULL DEFAULT 0,
  dcs_plan REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  UNIQUE(month, team_or_person)
);

CREATE TABLE IF NOT EXISTS daily_status (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  area TEXT NOT NULL,
  team_or_person TEXT NOT NULL,
  target REAL NOT NULL DEFAULT 0,
  actual REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  UNIQUE(date, team_or_person)
);

CREATE TABLE IF NOT EXISTS sub_assembly (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  item TEXT NOT NULL,
  daily_capacity REAL NOT NULL,
  target REAL NOT NULL DEFAULT 0,
  actual REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  UNIQUE(date, item)
);

CREATE TABLE IF NOT EXISTS what_if_scenarios (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  scenario_data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  user_id TEXT,
  username TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details TEXT
);

CREATE TABLE IF NOT EXISTS custom_manpower (
  id TEXT PRIMARY KEY,
  area TEXT NOT NULL CHECK(area IN ('KSM', 'PDR', 'CRM')),
  type TEXT NOT NULL CHECK(type IN ('worker', 'team')),
  name TEXT NOT NULL,
  members TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(area, type, name)
);

-- Indexes to minimize D1 rows read and keep queries fast
CREATE INDEX IF NOT EXISTS idx_panels_status ON panels(status);
CREATE INDEX IF NOT EXISTS idx_panels_area ON panels(current_area);
CREATE INDEX IF NOT EXISTS idx_panels_type ON panels(type);
CREATE INDEX IF NOT EXISTS idx_panels_created_at ON panels(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stage_history_panel_id ON stage_history(panel_id);
CREATE INDEX IF NOT EXISTS idx_stage_history_assigned_to ON stage_history(assigned_to);
CREATE INDEX IF NOT EXISTS idx_stage_history_completed_at ON stage_history(completed_at);
CREATE INDEX IF NOT EXISTS idx_hold_history_panel_id ON hold_history(panel_id);
CREATE INDEX IF NOT EXISTS idx_monthly_plans_month ON monthly_plans(month);
CREATE INDEX IF NOT EXISTS idx_daily_status_area_date ON daily_status(area, date);
CREATE INDEX IF NOT EXISTS idx_sub_assembly_date ON sub_assembly(date);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_custom_manpower_active ON custom_manpower(is_active, area);

