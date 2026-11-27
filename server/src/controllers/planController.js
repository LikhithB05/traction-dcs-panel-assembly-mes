import { getDatabase } from '../db/database.js';
import { CapacityService } from '../services/capacityService.js';
import {
  PDR_MECHANICAL_MANPOWER,
  PDR_ELECTRICAL_TEAMS,
  CRM_ELECTRICAL_TEAMS
} from '../data/masterData.js';

export class PlanController {
  static getMonthlyPlan(req, res) {
    try {
      const db = getDatabase();
      const month = req.query.month || new Date().toISOString().slice(0, 7);

      const existingPlans = db.prepare(`SELECT * FROM monthly_plans WHERE month = ?`).all(month);
      const planMap = new Map();
      for (const p of existingPlans) {
        planMap.set(p.team_or_person, p);
      }

      // Collect all teams/persons
      const items = [
        ...PDR_MECHANICAL_MANPOWER.map(m => ({ teamOrPerson: m.name, area: 'PDR', category: 'PDR Mechanical' })),
        ...PDR_ELECTRICAL_TEAMS.map(t => ({ teamOrPerson: t.id, area: 'PDR', category: 'PDR Electrical' })),
        ...CRM_ELECTRICAL_TEAMS.map(t => ({ teamOrPerson: t.id, area: 'CRM', category: 'CRM Electrical' }))
      ];

      const result = items.map(item => {
        const saved = planMap.get(item.teamOrPerson);
        const tractionPlan = saved ? saved.traction_plan : 0;
        const dcsPlan = saved ? saved.dcs_plan : 0;
        const spec = CapacityService.getCapacitySpec(item.teamOrPerson);

        const planLoadPercent = CapacityService.calculateLoadPercent(tractionPlan, dcsPlan, item.teamOrPerson);
        const actualWork = CapacityService.calculateActualWorkload(db, item.teamOrPerson, month);

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
          actualLoadPercent: actualWork.actualLoad,
          isOverloaded: planLoadPercent !== null && planLoadPercent > 100,
          updatedAt: saved ? saved.updated_at : null
        };
      });

      return res.json({
        month,
        plans: result
      });
    } catch (error) {
      console.error('Error fetching monthly plan:', error);
      return res.status(500).json({ error: 'Failed to retrieve monthly plan targets.' });
    }
  }

  static updateMonthlyPlan(req, res) {
    try {
      const db = getDatabase();
      const { month, area, teamOrPerson, tractionPlan, dcsPlan, confirmedOverload } = req.body;

      if (!month || !area || !teamOrPerson || tractionPlan === undefined || dcsPlan === undefined) {
        return res.status(400).json({ error: 'Missing required planning parameters.' });
      }

      if (!/^\d{4}-\d{2}$/.test(month)) {
        return res.status(400).json({ error: 'Month must be in YYYY-MM format.' });
      }

      const tNum = Number(tractionPlan);
      const dNum = Number(dcsPlan);

      if (!Number.isInteger(tNum) || tNum < 0) {
        return res.status(400).json({ error: 'Traction plan target must be a non-negative whole number integer.' });
      }

      if (!Number.isInteger(dNum) || dNum < 0) {
        return res.status(400).json({ error: 'DCS plan target must be a non-negative whole number integer.' });
      }

      // Permission check: Area Lead can only edit their own area; Admin can edit any
      if (!req.user.isAdmin && req.user.role !== 'AKR' && req.user.role !== 'CKG' && req.user.role !== area) {
        return res.status(403).json({ error: `Permission denied. User with role '${req.user.role}' cannot edit '${area}' plans.` });
      }

      const tCount = tNum;
      const dCount = dNum;

      // Check load %
      const planLoad = CapacityService.calculateLoadPercent(tCount, dCount, teamOrPerson);
      if (planLoad !== null && planLoad > 100 && !confirmedOverload) {
        return res.status(409).json({
          requiresConfirmation: true,
          planLoadPercent: planLoad,
          message: `Notice: This plan allocation results in ${planLoad}% load (exceeds 100% capacity) for ${teamOrPerson}. Please confirm to save.`
        });
      }

      const planId = `${month}_${teamOrPerson}`;
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO monthly_plans (id, month, area, team_or_person, traction_plan, dcs_plan, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          traction_plan = excluded.traction_plan,
          dcs_plan = excluded.dcs_plan,
          updated_at = excluded.updated_at
      `).run(planId, month, area, teamOrPerson, tCount, dCount, now);

      return res.json({
        message: 'Plan successfully updated and saved.',
        planId,
        planLoadPercent: planLoad
      });
    } catch (error) {
      console.error('Error saving monthly plan:', error);
      return res.status(500).json({ error: error.message || 'Failed to save monthly plan.' });
    }
  }
}
