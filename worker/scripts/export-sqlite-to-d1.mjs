import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPin } from '../src/utils/crypto.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sqlitePath = path.resolve(__dirname, '../../BACKUPS/pre_migration_20261126/bhel_portal.sqlite');
const outPath = path.resolve(__dirname, '../migrations/0002_seed_recovered_data.sql');

const KNOWN_PINS = {
  ksm: process.env.SEED_PIN_KSM || 'dev-ksm-pin',
  pdr: process.env.SEED_PIN_PDR || 'dev-pdr-pin',
  crm: process.env.SEED_PIN_CRM || 'dev-crm-pin',
  akr: process.env.SEED_PIN_AKR || 'dev-akr-pin',
  ckg: process.env.SEED_PIN_CKG || 'dev-ckg-pin'
};

function sqlVal(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function main() {
  if (!fs.existsSync(sqlitePath)) {
    throw new Error(`Source SQLite database not found at ${sqlitePath}`);
  }

  const db = new DatabaseSync(sqlitePath);
  const lines = [
    '-- Migration 0002: Recovered Historical Data from SQLite Backup',
    `-- Generated at: ${new Date().toISOString()}`,
    ''
  ];

  // 1. Users (re-hashed with PBKDF2-SHA256 for <1ms Cloudflare Workers CPU time)
  const users = db.prepare('SELECT * FROM users').all();
  for (const u of users) {
    const pin = KNOWN_PINS[u.username];
    const hash = pin ? await hashPin(pin) : u.password_hash;
    lines.push(
      `INSERT OR IGNORE INTO users (id, username, password_hash, role, display_name, is_admin, created_at) VALUES (${sqlVal(u.id)}, ${sqlVal(u.username)}, ${sqlVal(hash)}, ${sqlVal(u.role)}, ${sqlVal(u.display_name)}, ${sqlVal(u.is_admin)}, ${sqlVal(u.created_at)});`
    );
  }
  lines.push('');

  // 2. Panels
  const panels = db.prepare('SELECT * FROM panels').all();
  for (const p of panels) {
    lines.push(
      `INSERT OR IGNORE INTO panels (id, type, project, priority, start_date, due_date, current_stage, current_area, status, assigned_to, hold_reason, created_at, updated_at) VALUES (${sqlVal(p.id)}, ${sqlVal(p.type)}, ${sqlVal(p.project)}, ${sqlVal(p.priority)}, ${sqlVal(p.start_date)}, ${sqlVal(p.due_date)}, ${sqlVal(p.current_stage)}, ${sqlVal(p.current_area)}, ${sqlVal(p.status)}, ${sqlVal(p.assigned_to)}, ${sqlVal(p.hold_reason)}, ${sqlVal(p.created_at)}, ${sqlVal(p.updated_at)});`
    );
  }
  lines.push('');

  // 3. Stage History
  const stages = db.prepare('SELECT * FROM stage_history').all();
  for (const s of stages) {
    lines.push(
      `INSERT OR IGNORE INTO stage_history (id, panel_id, stage_number, stage_name, area, assigned_to, started_at, completed_at, hold_reason, undone_at, undone_by, undo_reason, created_at) VALUES (${sqlVal(s.id)}, ${sqlVal(s.panel_id)}, ${sqlVal(s.stage_number)}, ${sqlVal(s.stage_name)}, ${sqlVal(s.area)}, ${sqlVal(s.assigned_to)}, ${sqlVal(s.started_at)}, ${sqlVal(s.completed_at)}, ${sqlVal(s.hold_reason)}, ${sqlVal(s.undone_at)}, ${sqlVal(s.undone_by)}, ${sqlVal(s.undo_reason)}, ${sqlVal(s.created_at)});`
    );
  }
  lines.push('');

  // 4. Hold History
  const holds = db.prepare('SELECT * FROM hold_history').all();
  for (const h of holds) {
    lines.push(
      `INSERT OR IGNORE INTO hold_history (id, panel_id, stage_number, held_at, resumed_at, reason) VALUES (${sqlVal(h.id)}, ${sqlVal(h.panel_id)}, ${sqlVal(h.stage_number)}, ${sqlVal(h.held_at)}, ${sqlVal(h.resumed_at)}, ${sqlVal(h.reason)});`
    );
  }
  lines.push('');

  // 5. Monthly Plans
  const plans = db.prepare('SELECT * FROM monthly_plans').all();
  for (const mp of plans) {
    lines.push(
      `INSERT OR IGNORE INTO monthly_plans (id, month, area, team_or_person, traction_plan, dcs_plan, updated_at) VALUES (${sqlVal(mp.id)}, ${sqlVal(mp.month)}, ${sqlVal(mp.area)}, ${sqlVal(mp.team_or_person)}, ${sqlVal(mp.traction_plan)}, ${sqlVal(mp.dcs_plan)}, ${sqlVal(mp.updated_at)});`
    );
  }
  lines.push('');

  // 6. Daily Status
  const daily = db.prepare('SELECT * FROM daily_status').all();
  for (const ds of daily) {
    lines.push(
      `INSERT OR IGNORE INTO daily_status (id, date, area, team_or_person, target, actual, updated_at) VALUES (${sqlVal(ds.id)}, ${sqlVal(ds.date)}, ${sqlVal(ds.area)}, ${sqlVal(ds.team_or_person)}, ${sqlVal(ds.target)}, ${sqlVal(ds.actual)}, ${sqlVal(ds.updated_at)});`
    );
  }
  lines.push('');

  // 7. Sub Assembly
  const subs = db.prepare('SELECT * FROM sub_assembly').all();
  for (const sa of subs) {
    lines.push(
      `INSERT OR IGNORE INTO sub_assembly (id, date, item, daily_capacity, target, actual, updated_at) VALUES (${sqlVal(sa.id)}, ${sqlVal(sa.date)}, ${sqlVal(sa.item)}, ${sqlVal(sa.daily_capacity)}, ${sqlVal(sa.target)}, ${sqlVal(sa.actual)}, ${sqlVal(sa.updated_at)});`
    );
  }
  lines.push('');

  // 8. What-If Scenarios
  const scenarios = db.prepare('SELECT * FROM what_if_scenarios').all();
  for (const sc of scenarios) {
    lines.push(
      `INSERT OR IGNORE INTO what_if_scenarios (id, name, notes, created_by, created_at, scenario_data) VALUES (${sqlVal(sc.id)}, ${sqlVal(sc.name)}, ${sqlVal(sc.notes)}, ${sqlVal(sc.created_by)}, ${sqlVal(sc.created_at)}, ${sqlVal(sc.scenario_data)});`
    );
  }
  lines.push('');

  // 9. Custom Manpower
  const custom = db.prepare('SELECT * FROM custom_manpower').all();
  for (const cm of custom) {
    lines.push(
      `INSERT OR IGNORE INTO custom_manpower (id, area, type, name, members, is_active, created_by, created_at, updated_at) VALUES (${sqlVal(cm.id)}, ${sqlVal(cm.area)}, ${sqlVal(cm.type)}, ${sqlVal(cm.name)}, ${sqlVal(cm.members)}, ${sqlVal(cm.is_active)}, ${sqlVal(cm.created_by)}, ${sqlVal(cm.created_at)}, ${sqlVal(cm.updated_at)});`
    );
  }
  lines.push('');

  // 10. Audit Logs
  const audits = db.prepare('SELECT * FROM audit_logs').all();
  for (const al of audits) {
    lines.push(
      `INSERT OR IGNORE INTO audit_logs (id, timestamp, user_id, username, action, entity_type, entity_id, details) VALUES (${sqlVal(al.id)}, ${sqlVal(al.timestamp)}, ${sqlVal(al.user_id)}, ${sqlVal(al.username)}, ${sqlVal(al.action)}, ${sqlVal(al.entity_type)}, ${sqlVal(al.entity_id)}, ${sqlVal(al.details)});`
    );
  }

  db.close();
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.log(`Migration SQL generated at ${outPath}`);
  console.log(`Counts -> users:${users.length}, panels:${panels.length}, stage_history:${stages.length}, hold_history:${holds.length}, monthly_plans:${plans.length}, daily_status:${daily.length}, sub_assembly:${subs.length}, scenarios:${scenarios.length}, custom_manpower:${custom.length}, audit_logs:${audits.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

