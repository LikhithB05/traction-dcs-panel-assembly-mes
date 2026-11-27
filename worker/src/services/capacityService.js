import {
  PDR_MECHANICAL_MANPOWER,
  PDR_ELECTRICAL_TEAMS,
  CRM_ELECTRICAL_TEAMS
} from '../data/masterData.js';

export class CapacityService {
  static getCapacitySpec(teamOrPerson) {
    const mech = PDR_MECHANICAL_MANPOWER.find(m => m.name === teamOrPerson);
    if (mech) {
      return {
        tractionCap: mech.capacity.traction,
        dcsCap: mech.capacity.dcs,
        unit: 'per_month',
        category: 'PDR_MECHANICAL',
        isDailyTargetOnly: false
      };
    }

    const pdrElec = PDR_ELECTRICAL_TEAMS.find(t => t.id === teamOrPerson || t.name === teamOrPerson);
    if (pdrElec) {
      return {
        tractionCap: pdrElec.capacity.traction,
        dcsCap: pdrElec.capacity.dcs,
        unit: 'per_month',
        category: 'PDR_ELECTRICAL',
        isDailyTargetOnly: false
      };
    }

    const crmElec = CRM_ELECTRICAL_TEAMS.find(t => t.id === teamOrPerson || t.name === teamOrPerson);
    if (crmElec) {
      return {
        tractionCap: crmElec.capacity.traction,
        dcsCap: crmElec.capacity.dcs,
        unit: 'per_month',
        category: 'CRM_ELECTRICAL',
        isDailyTargetOnly: false
      };
    }

    if (teamOrPerson === 'KSM-OP-1' || teamOrPerson === 'KSM-OP-2') {
      return {
        tractionCap: 2,
        dcsCap: 12,
        unit: 'per_day',
        category: 'KSM_ASSEMBLY',
        isDailyTargetOnly: true
      };
    }

    return null;
  }

  static calculateLoadPercent(tractionCount, dcsCount, teamOrPerson) {
    const spec = this.getCapacitySpec(teamOrPerson);
    if (!spec || spec.isDailyTargetOnly) {
      return null;
    }

    const tFrac = spec.tractionCap > 0 ? (Number(tractionCount) || 0) / spec.tractionCap : 0;
    const dFrac = spec.dcsCap > 0 ? (Number(dcsCount) || 0) / spec.dcsCap : 0;

    return Math.round((tFrac + dFrac) * 100 * 10) / 10;
  }

  static async calculateActualWorkload(db, teamOrPerson, month) {
    const monthPrefix = month || new Date().toISOString().slice(0, 7);
    const { results: rows } = await db.prepare(`
      SELECT p.type, COUNT(DISTINCT p.id) as count
      FROM stage_history sh
      JOIN panels p ON p.id = sh.panel_id
      WHERE sh.assigned_to = ?
        AND (sh.started_at LIKE ? OR sh.completed_at LIKE ?)
      GROUP BY p.type
    `).bind(teamOrPerson, `${monthPrefix}%`, `${monthPrefix}%`).all();

    let tractionCount = 0;
    let dcsCount = 0;
    for (const r of rows) {
      if (r.type === 'Traction') tractionCount = r.count;
      if (r.type === 'DCS') dcsCount = r.count;
    }

    return {
      tractionCount,
      dcsCount,
      actualLoad: this.calculateLoadPercent(tractionCount, dcsCount, teamOrPerson)
    };
  }
}

