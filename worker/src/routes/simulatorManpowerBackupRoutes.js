import { Hono } from 'hono';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { SimulatorService } from '../services/simulatorService.js';
import { WorkflowEngine } from '../services/workflowEngine.js';
import {
  FACTORY_AREAS,
  KSM_MANPOWER,
  PDR_MECHANICAL_MANPOWER,
  PDR_ELECTRICAL_TEAMS,
  CRM_ELECTRICAL_TEAMS,
  SUB_ASSEMBLY_ITEMS,
  TRACTION_WORKFLOW,
  DCS_WORKFLOW,
  FACTORY_ASSUMPTIONS
} from '../data/masterData.js';

export const smbRoutes = new Hono();
smbRoutes.use('*', authenticateToken);

const MAX_OVERTIME_HOURS = 8;
const MAX_EXTRA_SHIFTS = 2;
const MAX_ADDITIONAL_HEADCOUNT = 50;

function escapeCsvCell(val) {
  if (val === null || val === undefined) return '';
  let str = String(val);
  if (/^[\=\+\-\@\t\r]/.test(str)) {
    str = "'" + str;
  }
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// === MASTER DATA ===
smbRoutes.get('/master-data', async (c) => {
  try {
    let customEntries = [];
    try {
      const { results } = await c.env.DB.prepare('SELECT * FROM custom_manpower WHERE is_active = 1 ORDER BY name ASC').all();
      customEntries = results;
    } catch (_) {}

    const attachCustom = (wf) => wf.map(s => {
      const allowedAreas = s.eligibleAreas || [s.area];
      const customNames = customEntries.filter(ce => allowedAreas.includes(ce.area)).map(ce => ce.name);
      return { ...s, eligibleWorkers: Array.from(new Set([...s.eligibleWorkers, ...customNames])) };
    });

    return c.json({
      areas: FACTORY_AREAS,
      manpower: {
        ksm: KSM_MANPOWER,
        pdrMechanical: PDR_MECHANICAL_MANPOWER,
        pdrElectrical: PDR_ELECTRICAL_TEAMS,
        crmElectrical: CRM_ELECTRICAL_TEAMS,
        custom: customEntries
      },
      subAssemblySpecs: SUB_ASSEMBLY_ITEMS,
      workflows: { traction: attachCustom(TRACTION_WORKFLOW), dcs: attachCustom(DCS_WORKFLOW) },
      assumptions: FACTORY_ASSUMPTIONS
    });
  } catch (err) {
    return c.json({ error: 'Failed to retrieve master data.' }, 500);
  }
});

// === CUSTOM MANPOWER ===
smbRoutes.get('/custom-manpower', async (c) => {
  try {
    const { area, type, includeInactive } = c.req.query();
    let query = 'SELECT * FROM custom_manpower WHERE 1=1';
    const params = [];
    if (!includeInactive || includeInactive === 'false') query += ' AND is_active = 1';
    if (area) { query += ' AND area = ?'; params.push(area); }
    if (type) { query += ' AND type = ?'; params.push(type); }
    query += ' ORDER BY type ASC, name ASC';

    const { results } = await c.env.DB.prepare(query).bind(...params).all();
    return c.json(results);
  } catch (err) {
    return c.json({ error: err.message || 'Failed to fetch custom manpower.' }, 500);
  }
});

smbRoutes.post('/custom-manpower', async (c) => {
  try {
    const db = c.env.DB;
    const user = c.get('user');
    const { area, type, name, members } = await c.req.json().catch(() => ({}));

    if (!area || !['KSM', 'PDR', 'CRM'].includes(area)) return c.json({ error: 'Valid area (KSM, PDR, or CRM) is required.' }, 400);
    if (!type || !['worker', 'team'].includes(type)) return c.json({ error: "Type must be either 'worker' or 'team'." }, 400);
    if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 60) {
      return c.json({ error: 'Name is required and must be between 2 and 60 characters.' }, 400);
    }

    const cleanName = name.trim();
    let cleanMembers = null;
    if (type === 'team') {
      if (!members || typeof members !== 'string' || members.trim().length === 0) {
        return c.json({ error: 'Team members are required for a custom team assignment.' }, 400);
      }
      cleanMembers = members.trim();
    }

    const isMasterAdmin = user.isAdmin || user.role === 'AKR' || user.role === 'CKG';
    if (!isMasterAdmin && user.role !== area) {
      return c.json({ error: `Permission denied. User with role '${user.role}' cannot add custom manpower for area '${area}'.` }, 403);
    }

    const now = new Date().toISOString();
    const existing = await db.prepare('SELECT * FROM custom_manpower WHERE area = ? AND type = ? AND name = ?').bind(area, type, cleanName).first();

    if (existing) {
      if (existing.is_active === 1) {
        return c.json({ message: `Custom ${type} '${cleanName}' is already registered for ${area}.`, data: existing });
      }
      await db.batch([
        db.prepare('UPDATE custom_manpower SET is_active = 1, members = COALESCE(?, members), updated_at = ? WHERE id = ?').bind(cleanMembers, now, existing.id),
        db.prepare('INSERT INTO audit_logs (id, timestamp, user_id, username, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .bind('log_' + crypto.randomUUID(), now, user.id, user.username, 'REACTIVATE_CUSTOM_MANPOWER', 'CUSTOM_MANPOWER', existing.id, `Reactivated custom ${type} '${cleanName}' in ${area}`)
      ]);
      const updated = await db.prepare('SELECT * FROM custom_manpower WHERE id = ?').bind(existing.id).first();
      return c.json({ message: `Custom ${type} '${cleanName}' reactivated successfully for ${area}.`, data: updated });
    }

    const id = 'cm_' + crypto.randomUUID();
    await db.batch([
      db.prepare('INSERT INTO custom_manpower (id, area, type, name, members, is_active, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)')
        .bind(id, area, type, cleanName, cleanMembers, user.username, now, now),
      db.prepare('INSERT INTO audit_logs (id, timestamp, user_id, username, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind('log_' + crypto.randomUUID(), now, user.id, user.username, 'CREATE_CUSTOM_MANPOWER', 'CUSTOM_MANPOWER', id, `Created custom ${type} '${cleanName}' for ${area}`)
    ]);
    const created = await db.prepare('SELECT * FROM custom_manpower WHERE id = ?').bind(id).first();
    return c.json({ message: `Custom ${type} '${cleanName}' registered successfully for ${area}.`, data: created }, 201);
  } catch (err) {
    return c.json({ error: err.message || 'Failed to create custom manpower.' }, 500);
  }
});

smbRoutes.patch('/custom-manpower/:id', async (c) => {
  try {
    const db = c.env.DB;
    const user = c.get('user');
    const id = c.req.param('id');
    const { name, members, is_active } = await c.req.json().catch(() => ({}));

    const existing = await db.prepare('SELECT * FROM custom_manpower WHERE id = ?').bind(id).first();
    if (!existing) return c.json({ error: `Custom manpower with ID '${id}' not found.` }, 404);

    const isMasterAdmin = user.isAdmin || user.role === 'AKR' || user.role === 'CKG';
    if (!isMasterAdmin && user.role !== existing.area) {
      return c.json({ error: `Permission denied. User with role '${user.role}' cannot modify custom manpower for area '${existing.area}'.` }, 403);
    }

    const updatedName = (name !== undefined && name.trim()) ? name.trim() : existing.name;
    const updatedMembers = members !== undefined ? (members ? members.trim() : null) : existing.members;
    const updatedActive = (is_active !== undefined) ? (is_active ? 1 : 0) : existing.is_active;
    const now = new Date().toISOString();

    await db.batch([
      db.prepare('UPDATE custom_manpower SET name = ?, members = ?, is_active = ?, updated_at = ? WHERE id = ?')
        .bind(updatedName, updatedMembers, updatedActive, now, id),
      db.prepare('INSERT INTO audit_logs (id, timestamp, user_id, username, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind('log_' + crypto.randomUUID(), now, user.id, user.username, 'UPDATE_CUSTOM_MANPOWER', 'CUSTOM_MANPOWER', id, `Updated custom manpower ${id}`)
    ]);
    const updated = await db.prepare('SELECT * FROM custom_manpower WHERE id = ?').bind(id).first();
    return c.json({ message: 'Custom manpower updated successfully.', data: updated });
  } catch (err) {
    return c.json({ error: err.message || 'Failed to update custom manpower.' }, 500);
  }
});

smbRoutes.delete('/custom-manpower/:id', requireAdmin, async (c) => {
  try {
    const db = c.env.DB;
    const user = c.get('user');
    const id = c.req.param('id');
    const existing = await db.prepare('SELECT * FROM custom_manpower WHERE id = ?').bind(id).first();
    if (!existing) return c.json({ error: `Custom manpower with ID '${id}' not found.` }, 404);

    await db.batch([
      db.prepare('DELETE FROM custom_manpower WHERE id = ?').bind(id),
      db.prepare('INSERT INTO audit_logs (id, timestamp, user_id, username, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind('log_' + crypto.randomUUID(), new Date().toISOString(), user.id, user.username, 'DELETE_CUSTOM_MANPOWER', 'CUSTOM_MANPOWER', id, `Deleted custom manpower ${existing.name}`)
    ]);
    return c.json({ message: `Custom manpower '${existing.name}' permanently deleted.` });
  } catch (err) {
    return c.json({ error: err.message || 'Failed to delete custom manpower.' }, 500);
  }
});

// === WHAT-IF SIMULATOR ===
smbRoutes.post('/simulator/simulate', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const {
      tractionTarget, dcsTarget, workingDays = 26, overtimeHours = 0,
      additionalMechanicalWorkers = 0, additionalElectricalTeams = 0, extraShifts = 0, acceptAssumptions = false
    } = body;

    if (tractionTarget === undefined || dcsTarget === undefined) {
      return c.json({ error: 'Monthly targets for Traction and DCS are required.' }, 400);
    }

    const tTarget = Number(tractionTarget), dTarget = Number(dcsTarget), days = Number(workingDays),
          ot = Number(overtimeHours), addMech = Number(additionalMechanicalWorkers),
          addElec = Number(additionalElectricalTeams), shifts = Number(extraShifts);

    if (!Number.isFinite(tTarget) || tTarget < 0 || !Number.isInteger(tTarget) || tTarget > 10000) return c.json({ error: 'Traction target must be a non-negative integer up to 10,000.' }, 400);
    if (!Number.isFinite(dTarget) || dTarget < 0 || !Number.isInteger(dTarget) || dTarget > 10000) return c.json({ error: 'DCS target must be a non-negative integer up to 10,000.' }, 400);
    if (!Number.isFinite(days) || days < 1 || days > 31 || !Number.isInteger(days)) return c.json({ error: 'Working days must be an integer between 1 and 31.' }, 400);
    if (!Number.isFinite(ot) || ot < 0 || ot > MAX_OVERTIME_HOURS) return c.json({ error: `Overtime hours must be a number between 0 and ${MAX_OVERTIME_HOURS}.` }, 400);
    if (!Number.isFinite(addMech) || addMech < 0 || !Number.isInteger(addMech) || addMech > MAX_ADDITIONAL_HEADCOUNT) return c.json({ error: `Additional mechanical workers must be an integer between 0 and ${MAX_ADDITIONAL_HEADCOUNT}.` }, 400);
    if (!Number.isFinite(addElec) || addElec < 0 || !Number.isInteger(addElec) || addElec > MAX_ADDITIONAL_HEADCOUNT) return c.json({ error: `Additional electrical teams must be an integer between 0 and ${MAX_ADDITIONAL_HEADCOUNT}.` }, 400);
    if (!Number.isFinite(shifts) || shifts < 0 || !Number.isInteger(shifts) || shifts > MAX_EXTRA_SHIFTS) return c.json({ error: `Extra shifts must be an integer between 0 and ${MAX_EXTRA_SHIFTS}.` }, 400);

    const result = SimulatorService.runSimulation({
      tractionTarget: tTarget, dcsTarget: dTarget, workingDays: days, overtimeHours: ot,
      additionalMechanicalWorkers: addMech, additionalElectricalTeams: addElec, extraShifts: shifts,
      acceptAssumptions: Boolean(acceptAssumptions)
    });
    return c.json(result);
  } catch (err) {
    return c.json({ error: 'Failed to run scenario simulation.' }, 500);
  }
});

smbRoutes.get('/simulator/scenarios', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM what_if_scenarios ORDER BY created_at DESC').all();
    return c.json(results.map(r => ({
      id: r.id, name: r.name, notes: r.notes, createdBy: r.created_by, createdAt: r.created_at,
      scenarioData: JSON.parse(r.scenario_data)
    })));
  } catch (err) {
    return c.json({ error: 'Failed to retrieve saved scenarios.' }, 500);
  }
});

smbRoutes.post('/simulator/scenarios', async (c) => {
  try {
    const user = c.get('user');
    const { name, notes, scenarioData } = await c.req.json().catch(() => ({}));
    if (!name || typeof name !== 'string' || !name.trim()) return c.json({ error: 'Scenario name is required.' }, 400);
    if (!scenarioData || typeof scenarioData !== 'object') return c.json({ error: 'Valid simulation result data is required.' }, 400);

    const id = 'scen_' + crypto.randomUUID();
    const now = new Date().toISOString();
    const createdBy = user ? user.username : 'OPERATOR';
    await c.env.DB.prepare('INSERT INTO what_if_scenarios (id, name, notes, created_by, created_at, scenario_data) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, name.trim(), (notes || '').trim(), createdBy, now, JSON.stringify(scenarioData)).run();

    return c.json({ message: 'Scenario saved successfully.', id, name: name.trim() }, 201);
  } catch (err) {
    return c.json({ error: 'Failed to save scenario.' }, 500);
  }
});

smbRoutes.delete('/simulator/scenarios/:id', async (c) => {
  try {
    const db = c.env.DB;
    const user = c.get('user');
    const id = c.req.param('id');
    const scen = await db.prepare('SELECT * FROM what_if_scenarios WHERE id = ?').bind(id).first();
    if (!scen) return c.json({ error: `Scenario '${id}' not found.` }, 404);

    const isAdmin = user && (user.isAdmin || user.role === 'AKR' || user.role === 'CKG');
    if (!isAdmin && user.username !== scen.created_by) {
      return c.json({ error: 'Permission denied. Only Admins or the scenario author can delete this scenario.' }, 403);
    }
    await db.prepare('DELETE FROM what_if_scenarios WHERE id = ?').bind(id).run();
    return c.json({ message: 'Scenario deleted.' });
  } catch (err) {
    return c.json({ error: 'Failed to delete scenario.' }, 500);
  }
});

// === BACKUP & RESTORE ===
smbRoutes.get('/backup/counts', async (c) => {
  try {
    const db = c.env.DB;
    const [p, sh, mp, ds, sa, sc, al] = await Promise.all([
      db.prepare('SELECT COUNT(*) as c FROM panels').first(),
      db.prepare('SELECT COUNT(*) as c FROM stage_history').first(),
      db.prepare('SELECT COUNT(*) as c FROM monthly_plans').first(),
      db.prepare('SELECT COUNT(*) as c FROM daily_status').first(),
      db.prepare('SELECT COUNT(*) as c FROM sub_assembly').first(),
      db.prepare('SELECT COUNT(*) as c FROM what_if_scenarios').first(),
      db.prepare('SELECT COUNT(*) as c FROM audit_logs').first()
    ]);
    return c.json({
      panels: p.c, stageHistories: sh.c, monthlyPlans: mp.c,
      dailyTargets: ds.c, subAssemblies: sa.c, scenarios: sc.c, auditLogs: al.c
    });
  } catch (err) {
    return c.json({ error: 'Failed to retrieve record counts.' }, 500);
  }
});

smbRoutes.get('/backup/export-json', requireAdmin, async (c) => {
  try {
    const db = c.env.DB;
    const user = c.get('user');
    const [
      { results: panels }, { results: stageHistory }, { results: holdHistory },
      { results: monthlyPlans }, { results: dailyStatus }, { results: subAssembly },
      { results: whatIfScenarios }, { results: auditLogs }
    ] = await Promise.all([
      db.prepare('SELECT * FROM panels').all(),
      db.prepare('SELECT * FROM stage_history').all(),
      db.prepare('SELECT * FROM hold_history').all(),
      db.prepare('SELECT * FROM monthly_plans').all(),
      db.prepare('SELECT * FROM daily_status').all(),
      db.prepare('SELECT * FROM sub_assembly').all(),
      db.prepare('SELECT * FROM what_if_scenarios').all(),
      db.prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 500').all()
    ]);

    const backupPackage = {
      metadata: {
        system: 'BHEL Traction & DCS Panel Assembly Management Portal',
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        exportedBy: user ? user.username : 'ADMIN',
        counts: {
          panels: panels.length, stageHistory: stageHistory.length, holdHistory: holdHistory.length,
          monthlyPlans: monthlyPlans.length, dailyStatus: dailyStatus.length, subAssembly: subAssembly.length,
          scenarios: whatIfScenarios.length, auditLogs: auditLogs.length
        }
      },
      data: { panels, stageHistory, holdHistory, monthlyPlans, dailyStatus, subAssembly, whatIfScenarios, auditLogs }
    };

    return new Response(JSON.stringify(backupPackage, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="bhel_portal_backup_${new Date().toISOString().slice(0, 10)}.json"`
      }
    });
  } catch (err) {
    return c.json({ error: 'Failed to create JSON backup.' }, 500);
  }
});

smbRoutes.get('/backup/export-csv', requireAdmin, async (c) => {
  try {
    const { results: panels } = await c.env.DB.prepare('SELECT * FROM panels ORDER BY created_at DESC').all();
    const today = new Date().toISOString().slice(0, 10);
    const headers = ['Panel ID', 'Type', 'Project', 'Priority', 'Due Date', 'Current Stage', 'Area', 'Team / Person', 'Status', 'Days in Stage', 'Days Overdue'];
    const rows = [headers.join(',')];

    for (const p of panels) {
      const stageDef = WorkflowEngine.getStageDefinition(p.type, p.current_stage);
      const diffMs = Date.now() - new Date(p.updated_at || p.created_at).getTime();
      const daysInStage = Math.max(0, Math.floor(diffMs / 86400000));
      const isOverdue = p.status !== 'Done' && p.due_date < today;
      const daysOverdue = isOverdue ? Math.floor((new Date(today).getTime() - new Date(p.due_date).getTime()) / 86400000) : 0;
      rows.push([
        escapeCsvCell(p.id), escapeCsvCell(p.type), escapeCsvCell(p.project), escapeCsvCell(p.priority),
        escapeCsvCell(p.due_date), escapeCsvCell(`Stage ${p.current_stage}: ${stageDef.name}`),
        escapeCsvCell(p.current_area), escapeCsvCell(p.assigned_to || 'Unassigned'),
        escapeCsvCell(p.status), daysInStage, daysOverdue
      ].join(','));
    }

    return new Response(rows.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="bhel_panels_export_${today}.csv"`
      }
    });
  } catch (err) {
    return c.json({ error: 'Failed to generate CSV export.' }, 500);
  }
});

smbRoutes.post('/backup/restore', requireAdmin, async (c) => {
  try {
    const db = c.env.DB;
    const user = c.get('user');
    const payload = await c.req.json().catch(() => null);

    if (!payload || !payload.data || typeof payload.data !== 'object') {
      return c.json({ error: 'Invalid backup JSON format. Missing "data" wrapper object.' }, 400);
    }

    const { panels = [], stageHistory = [], holdHistory = [], monthlyPlans = [], dailyStatus = [], subAssembly = [], whatIfScenarios = [] } = payload.data;
    const stmts = [];

    for (const p of panels) {
      if (!p.id || !p.type || !p.project || !p.priority || !p.due_date || !p.current_stage || !p.current_area || !p.status) {
        return c.json({ error: `Invalid panel record in backup: ${JSON.stringify(p)}` }, 400);
      }
      stmts.push(db.prepare(`
        INSERT INTO panels (id, type, project, priority, start_date, due_date, current_stage, current_area, status, assigned_to, hold_reason, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          type=excluded.type, project=excluded.project, priority=excluded.priority, start_date=excluded.start_date,
          due_date=excluded.due_date, current_stage=excluded.current_stage, current_area=excluded.current_area,
          status=excluded.status, assigned_to=excluded.assigned_to, hold_reason=excluded.hold_reason, updated_at=excluded.updated_at
      `).bind(p.id, p.type, p.project, p.priority, p.start_date || null, p.due_date, p.current_stage, p.current_area, p.status, p.assigned_to || null, p.hold_reason || null, p.created_at || new Date().toISOString(), p.updated_at || new Date().toISOString()));
    }

    for (const s of stageHistory) {
      stmts.push(db.prepare(`
        INSERT INTO stage_history (id, panel_id, stage_number, stage_name, area, assigned_to, started_at, completed_at, hold_reason, undone_at, undone_by, undo_reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          assigned_to=excluded.assigned_to, started_at=excluded.started_at, completed_at=excluded.completed_at,
          hold_reason=excluded.hold_reason, undone_at=excluded.undone_at, undone_by=excluded.undone_by, undo_reason=excluded.undo_reason
      `).bind(s.id, s.panel_id, s.stage_number, s.stage_name, s.area, s.assigned_to || null, s.started_at || null, s.completed_at || null, s.hold_reason || null, s.undone_at || null, s.undone_by || null, s.undo_reason || null, s.created_at || new Date().toISOString()));
    }

    for (const h of holdHistory) {
      stmts.push(db.prepare(`
        INSERT INTO hold_history (id, panel_id, stage_number, held_at, resumed_at, reason)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET resumed_at=excluded.resumed_at, reason=excluded.reason
      `).bind(h.id, h.panel_id, h.stage_number, h.held_at, h.resumed_at || null, h.reason));
    }

    for (const mp of monthlyPlans) {
      stmts.push(db.prepare(`
        INSERT INTO monthly_plans (id, month, area, team_or_person, traction_plan, dcs_plan, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(month, team_or_person) DO UPDATE SET traction_plan=excluded.traction_plan, dcs_plan=excluded.dcs_plan, updated_at=excluded.updated_at
      `).bind(mp.id, mp.month, mp.area, mp.team_or_person, mp.traction_plan, mp.dcs_plan, mp.updated_at || new Date().toISOString()));
    }

    for (const ds of dailyStatus) {
      stmts.push(db.prepare(`
        INSERT INTO daily_status (id, date, area, team_or_person, target, actual, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(date, team_or_person) DO UPDATE SET target=excluded.target, actual=excluded.actual, updated_at=excluded.updated_at
      `).bind(ds.id, ds.date, ds.area, ds.team_or_person, ds.target, ds.actual, ds.updated_at || new Date().toISOString()));
    }

    for (const sa of subAssembly) {
      stmts.push(db.prepare(`
        INSERT INTO sub_assembly (id, date, item, daily_capacity, target, actual, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(date, item) DO UPDATE SET target=excluded.target, actual=excluded.actual, updated_at=excluded.updated_at
      `).bind(sa.id, sa.date, sa.item, sa.daily_capacity, sa.target, sa.actual, sa.updated_at || new Date().toISOString()));
    }

    for (const sc of whatIfScenarios) {
      stmts.push(db.prepare(`
        INSERT INTO what_if_scenarios (id, name, notes, created_by, created_at, scenario_data)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, notes=excluded.notes, scenario_data=excluded.scenario_data
      `).bind(sc.id, sc.name, sc.notes || null, sc.created_by, sc.created_at, sc.scenario_data));
    }

    stmts.push(db.prepare(`
      INSERT INTO audit_logs (id, timestamp, user_id, username, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind('log_' + crypto.randomUUID(), new Date().toISOString(), user.id, user.username, 'RESTORE_BACKUP', 'SYSTEM', null, `ID-based merge restore: ${panels.length} panels, ${monthlyPlans.length} plans, ${dailyStatus.length} daily records`));

    if (stmts.length > 0) {
      await db.batch(stmts);
    }

    return c.json({
      message: 'Backup restored successfully via atomic ID-based merge.',
      restoredCounts: { panels: panels.length, stageHistory: stageHistory.length, holdHistory: holdHistory.length, monthlyPlans: monthlyPlans.length, dailyStatus: dailyStatus.length, subAssembly: subAssembly.length, whatIfScenarios: whatIfScenarios.length }
    });
  } catch (err) {
    return c.json({ error: `Restore failed cleanly (rolled back): ${err.message}` }, 400);
  }
});

