import {
  PDR_MECHANICAL_MANPOWER,
  PDR_ELECTRICAL_TEAMS,
  CRM_ELECTRICAL_TEAMS
} from '../data/masterData.js';

export class CapacityService {
  /**
   * Get capacity specification for any worker or team
   */
  static getCapacitySpec(teamOrPerson) {
    // Check PDR Mechanical
    const mech = PDR_MECHANICAL_MANPOWER.find(m => m.name === teamOrPerson);
    if (mech) {
      return {
        tractionCap: mech.capacity.traction, // 10
        dcsCap: mech.capacity.dcs,           // 30
        unit: 'per_month',
        category: 'PDR_MECHANICAL',
        isDailyTargetOnly: false
      };
    }

    // Check PDR Electrical
    const pdrElec = PDR_ELECTRICAL_TEAMS.find(t => t.id === teamOrPerson || t.name === teamOrPerson);
    if (pdrElec) {
      return {
        tractionCap: pdrElec.capacity.traction, // 3 (or 26 for Team 6)
        dcsCap: pdrElec.capacity.dcs,           // 5
        unit: 'per_month',
        category: 'PDR_ELECTRICAL',
        isDailyTargetOnly: false
      };
    }

    // Check CRM Electrical
    const crmElec = CRM_ELECTRICAL_TEAMS.find(t => t.id === teamOrPerson || t.name === teamOrPerson);
    if (crmElec) {
      return {
        tractionCap: crmElec.capacity.traction, // 3
        dcsCap: crmElec.capacity.dcs,           // 5
        unit: 'per_month',
        category: 'CRM_ELECTRICAL',
        isDailyTargetOnly: false
      };
    }

    // KSM assembly (KSM-OP-1/KSM-OP-2) - tracked via daily targets, not monthly load %
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

  /**
   * Calculate shared load % according to PDF formula:
   * Load % = ((Traction / TractionCap) + (DCS / DCSCap)) * 100
   */
  static calculateLoadPercent(tractionCount, dcsCount, teamOrPerson) {
    const spec = this.getCapacitySpec(teamOrPerson);
    if (!spec || spec.isDailyTargetOnly) {
      return null;
    }

    const tFrac = spec.tractionCap > 0 ? (Number(tractionCount) || 0) / spec.tractionCap : 0;
    const dFrac = spec.dcsCap > 0 ? (Number(dcsCount) || 0) / spec.dcsCap : 0;
    
    return Math.round((tFrac + dFrac) * 100 * 10) / 10; // Round to 1 decimal
  }

  /**
   * Calculate actual load based on currently active/started panels in the given month
   */
  static calculateActualWorkload(db, teamOrPerson, month) {
    // Count active or completed panels where assigned_to matches teamOrPerson in this month
    const monthPrefix = month || new Date().toISOString().slice(0, 7);
    
    const rows = db.prepare(`
      SELECT p.type, COUNT(DISTINCT p.id) as count
      FROM stage_history sh
      JOIN panels p ON p.id = sh.panel_id
      WHERE sh.assigned_to = ?
        AND (sh.started_at LIKE ? OR sh.completed_at LIKE ?)
      GROUP BY p.type
    `).all(teamOrPerson, `${monthPrefix}%`, `${monthPrefix}%`);

    let tractionCount = 0;
    let dcsCount = 0;

    for (const r of rows) {
      if (r.type === 'Traction') tractionCount = r.count;
      if (r.type === 'DCS') dcsCount = r.count;
    }

    const actualLoad = this.calculateLoadPercent(tractionCount, dcsCount, teamOrPerson);
    return {
      tractionCount,
      dcsCount,
      actualLoad
    };
  }
}
