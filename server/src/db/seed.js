import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { getDatabase, initDatabase } from './database.js';
import { SUB_ASSEMBLY_ITEMS, PDR_MECHANICAL_MANPOWER, PDR_ELECTRICAL_TEAMS, CRM_ELECTRICAL_TEAMS } from '../data/masterData.js';

export async function seedDatabase(customDb) {
  const db = customDb || getDatabase();

  const saltRounds = 10;

  // 1. Seed Authorized User Accounts
  const usersToSeed = [
    { id: 'usr_ksm', username: 'ksm', role: 'KSM', pin: process.env.SEED_PIN_KSM || 'dev-ksm-pin', displayName: 'KSM Area Lead', isAdmin: 0 },
    { id: 'usr_pdr', username: 'pdr', role: 'PDR', pin: process.env.SEED_PIN_PDR || 'dev-pdr-pin', displayName: 'PDR Area Lead', isAdmin: 0 },
    { id: 'usr_crm', username: 'crm', role: 'CRM', pin: process.env.SEED_PIN_CRM || 'dev-crm-pin', displayName: 'CRM Area Lead', isAdmin: 0 },
    { id: 'usr_akr', username: 'akr', role: 'AKR', pin: process.env.SEED_PIN_AKR || 'dev-akr-pin', displayName: 'AKR Master Administrator', isAdmin: 1 },
    { id: 'usr_ckg', username: 'ckg', role: 'CKG', pin: process.env.SEED_PIN_CKG || 'dev-ckg-pin', displayName: 'CKG Master Administrator', isAdmin: 1 }
  ];

  const checkUserStmt = db.prepare('SELECT id FROM users WHERE username = ?');
  const insertUserStmt = db.prepare(`
    INSERT INTO users (id, username, password_hash, role, display_name, is_admin, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date().toISOString();

  for (const u of usersToSeed) {
    const existing = checkUserStmt.get(u.username);
    if (!existing) {
      const hash = await bcrypt.hash(u.pin, saltRounds);
      insertUserStmt.run(u.id, u.username, hash, u.role, u.displayName, u.isAdmin, now);
    }
  }

  // 2. Seed Current Month's Initial Plans
  const currentMonth = new Date().toISOString().slice(0, 7); // e.g. "2026-10"
  const checkPlanStmt = db.prepare('SELECT id FROM monthly_plans WHERE id = ?');
  const insertPlanStmt = db.prepare(`
    INSERT INTO monthly_plans (id, month, area, team_or_person, traction_plan, dcs_plan, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  // PDR Mechanical
  for (const person of PDR_MECHANICAL_MANPOWER) {
    const planId = `${currentMonth}_${person.name}`;
    if (!checkPlanStmt.get(planId)) {
      insertPlanStmt.run(planId, currentMonth, 'PDR', person.name, 5, 15, now);
    }
  }

  // PDR Electrical
  for (const team of PDR_ELECTRICAL_TEAMS) {
    const planId = `${currentMonth}_${team.id}`;
    if (!checkPlanStmt.get(planId)) {
      // Team 6 is LV primary (e.g. 20 Traction LV, 2 DCS)
      if (team.id === 'PDR Team 6') {
        insertPlanStmt.run(planId, currentMonth, 'PDR', team.id, 20, 2, now);
      } else {
        insertPlanStmt.run(planId, currentMonth, 'PDR', team.id, 2, 3, now);
      }
    }
  }

  // CRM Electrical
  for (const team of CRM_ELECTRICAL_TEAMS) {
    const planId = `${currentMonth}_${team.id}`;
    if (!checkPlanStmt.get(planId)) {
      insertPlanStmt.run(planId, currentMonth, 'CRM', team.id, 2, 3, now);
    }
  }

  // 3. Seed Today's Sub-Assembly Items for KSM
  const todayDate = new Date().toISOString().slice(0, 10);
  const checkSubStmt = db.prepare('SELECT id FROM sub_assembly WHERE id = ?');
  const insertSubStmt = db.prepare(`
    INSERT INTO sub_assembly (id, date, item, daily_capacity, target, actual, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const item of SUB_ASSEMBLY_ITEMS) {
    const subId = `${todayDate}_${item.item}`;
    if (!checkSubStmt.get(subId)) {
      insertSubStmt.run(subId, todayDate, item.item, item.dailyCapacity, 0, 0, now);
    }
  }

  // 4. Seed Initial Demonstration Panels (TR-101 and DCS-101) if no panels exist
  const panelCount = db.prepare('SELECT COUNT(*) as count FROM panels').get().count;
  if (panelCount === 0) {
    const dueDate = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);
    
    // Panel TR-101: Waiting at Stage 1 (Mech Stage 1)
    db.prepare(`
      INSERT INTO panels (id, type, project, priority, due_date, current_stage, current_area, status, assigned_to, hold_reason, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('TR-101', 'Traction', 'WAG-9 Locomotive', 'High', dueDate, 1, 'KSM', 'Waiting', null, null, now, now);

    // Initial stage_history entry for Stage 1
    db.prepare(`
      INSERT INTO stage_history (id, panel_id, stage_number, stage_name, area, assigned_to, started_at, completed_at, hold_reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('sh_' + crypto.randomUUID(), 'TR-101', 1, 'Mech Stage 1', 'KSM', null, null, null, null, now);

    // Panel DCS-101: Waiting at Stage 1 (Door / Side Cover)
    db.prepare(`
      INSERT INTO panels (id, type, project, priority, due_date, current_stage, current_area, status, assigned_to, hold_reason, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('DCS-101', 'DCS', 'Kolkata Metro DCS', 'Medium', dueDate, 1, 'KSM', 'Waiting', null, null, now, now);

    db.prepare(`
      INSERT INTO stage_history (id, panel_id, stage_number, stage_name, area, assigned_to, started_at, completed_at, hold_reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('sh_' + crypto.randomUUID(), 'DCS-101', 1, 'Door / Side Cover', 'KSM', null, null, null, null, now);
  }

  // Audit log entry for seeding
  db.prepare(`
    INSERT INTO audit_logs (id, timestamp, user_id, username, action, entity_type, entity_id, details)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('log_' + crypto.randomUUID(), now, 'SYSTEM', 'SYSTEM', 'DATABASE_SEEDED', 'SYSTEM', null, 'Initial database seeding completed');

  return { success: true };
}

// Allow direct CLI execution
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  initDatabase();
  seedDatabase().then(() => {
    console.log('Seeding completed successfully!');
    process.exit(0);
  }).catch((err) => {
    console.error('Seeding error:', err);
    process.exit(1);
  });
}
