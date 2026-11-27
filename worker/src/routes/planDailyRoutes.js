import { Hono } from 'hono';
import { authenticateToken } from '../middleware/auth.js';
import { CapacityService } from '../services/capacityService.js';
import { DailyStatusService } from '../services/dailyStatusService.js';
import {
  PDR_MECHANICAL_MANPOWER,
  PDR_ELECTRICAL_TEAMS,
  CRM_ELECTRICAL_TEAMS,
  SUB_ASSEMBLY_ITEMS
} from '../data/masterData.js';

export const planDailyRoutes = new Hono();
planDailyRoutes.use('*', authenticateToken);

// === PLANS ===
planDailyRoutes.get('/plans', async (c) => {
  try {
    const db = c.env.DB;
    const month = c.req.query('month') || new Date().toISOString().slice(0, 7);

    const [{ results: existingPlans }, { results: monthlyStageRows }] = await Promise.all([
      db.prepare('SELECT * FROM monthly_plans WHERE month = ?').bind(month).all(),
      db.prepare(`
        SELECT sh.assigned_to, p.type, COUNT(DISTINCT p.id) as count
        FROM stage_history sh
        JOIN panels p ON p.id = sh.panel_id
        WHERE sh.assigned_to IS NOT NULL
          AND (sh.started_at LIKE ? OR sh.completed_at LIKE ?)
        GROUP BY sh.assigned_to, p.type
      `).bind(`${month}%`, `${month}%`).all()
    ]);

    const planMap = new Map(existingPlans.map(p => [p.team_or_person, p]));
    const actualMap = new Map();
    for (const r of monthlyStageRows) {
      if (!actualMap.has(r.assigned_to)) actualMap.set(r.assigned_to, { traction: 0, dcs: 0 });
      const entry = actualMap.get(r.assigned_to);
      if (r.type === 'Traction') entry.traction = r.count;
      if (r.type === 'DCS') entry.dcs = r.count;
    }

    const items = [
      ...PDR_MECHANICAL_MANPOWER.map(m => ({ teamOrPerson: m.name, area: 'PDR', category: 'PDR Mechanical' })),
      ...PDR_ELECTRICAL_TEAMS.map(t => ({ teamOrPerson: t.id, area: 'PDR', category: 'PDR Electrical' })),
      ...CRM_ELECTRICAL_TEAMS.map(t => ({ teamOrPerson: t.id, area: 'CRM', category: 'CRM Electrical' }))
    ];

    const plans = items.map(item => {
      const saved = planMap.get(item.teamOrPerson);
      const tractionPlan = saved ? saved.traction_plan : 0;
      const dcsPlan = saved ? saved.dcs_plan : 0;
      const spec = CapacityService.getCapacitySpec(item.teamOrPerson);
      const planLoadPercent = CapacityService.calculateLoadPercent(tractionPlan, dcsPlan, item.teamOrPerson);
      const act = actualMap.get(item.teamOrPerson) || { traction: 0, dcs: 0 };
      const actualLoadPercent = CapacityService.calculateLoadPercent(act.traction, act.dcs, item.teamOrPerson);

      return {
        month,
        area: item.area,
        category: item.category,
        teamOrPerson: item.teamOrPerson,
        tractionPlan,
        dcsPlan,
        tractionCap: spec ? spec.tractionCap : null,
        dcsCap: spec ? spec.dcsCap : null,
        planLoadPercent,
        actualLoadPercent,
        isOverloaded: planLoadPercent !== null && planLoadPercent > 100,
        updatedAt: saved ? saved.updated_at : null
      };
    });

    return c.json({ month, plans });
  } catch (err) {
    return c.json({ error: 'Failed to retrieve monthly plan targets.' }, 500);
  }
});

planDailyRoutes.post('/plans', async (c) => {
  try {
    const db = c.env.DB;
    const user = c.get('user');
    const { month, area, teamOrPerson, tractionPlan, dcsPlan, confirmedOverload } = await c.req.json().catch(() => ({}));

    if (!month || !area || !teamOrPerson || tractionPlan === undefined || dcsPlan === undefined) {
      return c.json({ error: 'Missing required planning parameters.' }, 400);
    }
    if (!/^\d{4}-\d{2}$/.test(month)) return c.json({ error: 'Month must be in YYYY-MM format.' }, 400);

    const tNum = Number(tractionPlan);
    const dNum = Number(dcsPlan);
    if (!Number.isInteger(tNum) || tNum < 0) return c.json({ error: 'Traction plan target must be a non-negative whole number integer.' }, 400);
    if (!Number.isInteger(dNum) || dNum < 0) return c.json({ error: 'DCS plan target must be a non-negative whole number integer.' }, 400);

    if (!user.isAdmin && user.role !== 'AKR' && user.role !== 'CKG' && user.role !== area) {
      return c.json({ error: `Permission denied. User with role '${user.role}' cannot edit '${area}' plans.` }, 403);
    }

    const planLoad = CapacityService.calculateLoadPercent(tNum, dNum, teamOrPerson);
    if (planLoad !== null && planLoad > 100 && !confirmedOverload) {
      return c.json({
        requiresConfirmation: true,
        planLoadPercent: planLoad,
        message: `Notice: This plan allocation results in ${planLoad}% load (exceeds 100% capacity) for ${teamOrPerson}. Please confirm to save.`
      }, 409);
    }

    const planId = `${month}_${teamOrPerson}`;
    const now = new Date().toISOString();
    await db.prepare(`
      INSERT INTO monthly_plans (id, month, area, team_or_person, traction_plan, dcs_plan, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        traction_plan = excluded.traction_plan,
        dcs_plan = excluded.dcs_plan,
        updated_at = excluded.updated_at
    `).bind(planId, month, area, teamOrPerson, tNum, dNum, now).run();

    return c.json({ message: 'Plan successfully updated and saved.', planId, planLoadPercent: planLoad });
  } catch (err) {
    return c.json({ error: err.message || 'Failed to save monthly plan.' }, 500);
  }
});

// === DAILY STATUS ===
planDailyRoutes.get('/daily-status', async (c) => {
  try {
    const area = c.req.query('area') || 'KSM';
    const date = c.req.query('date') || new Date().toISOString().slice(0, 10);
    if (c.req.query('date') && !/^\d{4}-\d{2}-\d{2}$/.test(c.req.query('date'))) {
      return c.json({ error: 'Date query parameter must be in YYYY-MM-DD format.' }, 400);
    }
    const roster = await DailyStatusService.getDailyStatusForAreaAndDate(c.env.DB, area, date);
    return c.json({ area, date, roster });
  } catch (err) {
    return c.json({ error: 'Failed to retrieve daily status.' }, 500);
  }
});

planDailyRoutes.post('/daily-status', async (c) => {
  try {
    const db = c.env.DB;
    const user = c.get('user');
    const { date, area, teamOrPerson, target, actual } = await c.req.json().catch(() => ({}));

    if (!date || !area || !teamOrPerson || target === undefined || actual === undefined) {
      return c.json({ error: 'Missing required parameters (date, area, teamOrPerson, target, actual).' }, 400);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: 'Date must be in YYYY-MM-DD format.' }, 400);

    const numTarget = Number(target);
    const numActual = Number(actual);
    if (!Number.isInteger(numTarget) || numTarget < 0) return c.json({ error: 'Daily target must be a non-negative whole integer.' }, 400);
    if (!Number.isInteger(numActual) || numActual < 0) return c.json({ error: 'Daily actual must be a non-negative whole integer.' }, 400);

    if (!user.isAdmin && user.role !== 'AKR' && user.role !== 'CKG' && user.role !== area) {
      return c.json({ error: `Permission denied. User with role '${user.role}' cannot edit '${area}' daily status.` }, 403);
    }

    const entryId = `${date}_${teamOrPerson}`;
    const now = new Date().toISOString();
    await db.prepare(`
      INSERT INTO daily_status (id, date, area, team_or_person, target, actual, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(date, team_or_person) DO UPDATE SET
        target = excluded.target,
        actual = excluded.actual,
        updated_at = excluded.updated_at
    `).bind(entryId, date, area, teamOrPerson, numTarget, numActual, now).run();

    const autoLoggedDone = await DailyStatusService.getAutoLoggedDone(db, teamOrPerson, date);
    const variance = numActual - numTarget;
    const achievementPercent = numTarget > 0 ? Math.round((numActual / numTarget) * 100 * 10) / 10 : 0;

    return c.json({
      message: 'Daily status saved successfully.',
      entry: { id: entryId, date, area, teamOrPerson, target: numTarget, actual: numActual, autoLoggedDone, variance, achievementPercent, updatedAt: now }
    });
  } catch (err) {
    return c.json({ error: err.message || 'Failed to update daily status.' }, 500);
  }
});

// === SUB-ASSEMBLIES ===
planDailyRoutes.get('/sub-assemblies', async (c) => {
  try {
    const date = c.req.query('date') || new Date().toISOString().slice(0, 10);
    if (c.req.query('date') && !/^\d{4}-\d{2}-\d{2}$/.test(c.req.query('date'))) {
      return c.json({ error: 'Date query parameter must be in YYYY-MM-DD format.' }, 400);
    }
    const items = await DailyStatusService.getSubAssemblyForDate(c.env.DB, date);
    return c.json({ date, items });
  } catch (err) {
    return c.json({ error: 'Failed to retrieve sub-assembly entries.' }, 500);
  }
});

planDailyRoutes.post('/sub-assemblies', async (c) => {
  try {
    const db = c.env.DB;
    const user = c.get('user');
    const { date, item, target, actual } = await c.req.json().catch(() => ({}));

    if (!date || !item || target === undefined || actual === undefined) {
      return c.json({ error: 'Missing parameters (date, item, target, actual).' }, 400);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: 'Date must be in YYYY-MM-DD format.' }, 400);

    const numTarget = Number(target);
    const numActual = Number(actual);
    if (!Number.isInteger(numTarget) || numTarget < 0) return c.json({ error: 'Sub-assembly target must be a non-negative whole integer.' }, 400);
    if (!Number.isInteger(numActual) || numActual < 0) return c.json({ error: 'Sub-assembly actual must be a non-negative whole integer.' }, 400);

    if (!user.isAdmin && user.role !== 'AKR' && user.role !== 'CKG' && user.role !== 'KSM') {
      return c.json({ error: 'Permission denied. Only KSM or Admins can edit sub-assembly records.' }, 403);
    }

    const itemSpec = SUB_ASSEMBLY_ITEMS.find(s => s.item === item);
    const dailyCapacity = itemSpec ? itemSpec.dailyCapacity : 30;
    const entryId = `${date}_${item.replace(/\s+/g, '_')}`;
    const now = new Date().toISOString();

    await db.prepare(`
      INSERT INTO sub_assembly (id, date, item, daily_capacity, target, actual, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(date, item) DO UPDATE SET
        target = excluded.target,
        actual = excluded.actual,
        updated_at = excluded.updated_at
    `).bind(entryId, date, item, dailyCapacity, numTarget, numActual, now).run();

    const variance = numActual - numTarget;
    const achievementPercent = numTarget > 0 ? Math.round((numActual / numTarget) * 100 * 10) / 10 : 0;

    return c.json({
      message: 'Sub-assembly entry saved.',
      entry: { id: entryId, date, item, dailyCapacity, target: numTarget, actual: numActual, variance, achievementPercent, updatedAt: now }
    });
  } catch (err) {
    return c.json({ error: err.message || 'Failed to save sub-assembly.' }, 500);
  }
});

