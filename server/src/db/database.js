import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let dbInstance = null;

export function initDatabase(dbPathCustom) {
  const dbPath = dbPathCustom || process.env.DB_PATH || path.resolve(__dirname, '../../data/bhel_portal.sqlite');

  if (dbInstance) {
    if (dbPathCustom && dbInstance._dbPath !== dbPath) {
      try { dbInstance.close(); } catch (_) {}
      dbInstance = null;
    } else {
      return dbInstance;
    }
  }
  
  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new DatabaseSync(dbPath);
  db._dbPath = dbPath;

  // Add transaction wrapper with nested savepoint support if not present on DatabaseSync
  let txDepth = 0;
  if (typeof db.transaction !== 'function') {
    db.transaction = function(fn) {
      return function(...args) {
        const isOuter = (txDepth === 0);
        const savepoint = `sp_${txDepth}`;
        if (isOuter) {
          db.exec('BEGIN IMMEDIATE TRANSACTION;');
        } else {
          db.exec(`SAVEPOINT ${savepoint};`);
        }
        txDepth++;
        try {
          const res = fn(...args);
          if (isOuter) {
            db.exec('COMMIT;');
          } else {
            db.exec(`RELEASE SAVEPOINT ${savepoint};`);
          }
          return res;
        } catch (err) {
          if (isOuter) {
            try { db.exec('ROLLBACK;'); } catch (_) {}
          } else {
            try {
              db.exec(`ROLLBACK TO SAVEPOINT ${savepoint};`);
              db.exec(`RELEASE SAVEPOINT ${savepoint};`);
            } catch (_) {}
          }
          throw err;
        } finally {
          txDepth--;
        }
      };
    };
  }

  if (dbPath !== ':memory:') {
    db.exec(`PRAGMA journal_mode = WAL;`);
  }
  db.exec(`PRAGMA foreign_keys = ON;`);

  // Initialize schema
  db.exec(`
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
  `);

  // Idempotent migration: add start_date if not exists on existing panels table
  try {
    const panelCols = db.prepare("PRAGMA table_info(panels)").all();
    if (!panelCols.some(c => c.name === 'start_date')) {
      db.exec("ALTER TABLE panels ADD COLUMN start_date TEXT;");
      db.exec("UPDATE panels SET start_date = substr(created_at, 1, 10) WHERE start_date IS NULL;");
    }
  } catch (migErr) {
    console.error('Migration notice (start_date):', migErr.message);
  }

  // Idempotent migration: add undo audit columns to stage_history table
  try {
    const stageCols = db.prepare("PRAGMA table_info(stage_history)").all();
    if (!stageCols.some(c => c.name === 'undone_at')) {
      db.exec("ALTER TABLE stage_history ADD COLUMN undone_at TEXT;");
    }
    if (!stageCols.some(c => c.name === 'undone_by')) {
      db.exec("ALTER TABLE stage_history ADD COLUMN undone_by TEXT;");
    }
    if (!stageCols.some(c => c.name === 'undo_reason')) {
      db.exec("ALTER TABLE stage_history ADD COLUMN undo_reason TEXT;");
    }
  } catch (migErr) {
    console.error('Migration notice (stage_history undo columns):', migErr.message);
  }

  // Idempotent migration: align stage numbers on historical completed panels to consolidated scheme
  try {
    db.exec(`
      UPDATE panels SET current_stage = 8 WHERE type = 'Traction' AND current_stage > 8 AND status = 'Done';
      UPDATE panels SET current_stage = 6 WHERE type = 'DCS' AND current_stage > 6 AND status = 'Done';
    `);
  } catch (migErr) {
    console.error('Migration notice (stage consolidation):', migErr.message);
  }

  dbInstance = db;
  return dbInstance;
}

export function getDatabase() {
  if (!dbInstance) {
    return initDatabase();
  }
  return dbInstance;
}

export function closeDatabase() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
