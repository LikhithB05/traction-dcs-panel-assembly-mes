import {
  PDR_MECHANICAL_MANPOWER,
  PDR_ELECTRICAL_TEAMS,
  CRM_ELECTRICAL_TEAMS,
  SUB_ASSEMBLY_ITEMS
} from '../data/masterData.js';

export class DailyStatusService {
  static getWorkersForArea(area) {
    if (area === 'KSM') {
      return [
        { name: 'KSM-OP-1', role: 'Mechanical & PD Door' },
        { name: 'KSM-OP-2', role: 'Mechanical & Doors' }
      ];
    }
    if (area === 'PDR') {
      return [
        ...PDR_MECHANICAL_MANPOWER.map(m => ({ name: m.name, role: 'PDR Mechanical' })),
        ...PDR_ELECTRICAL_TEAMS.map(t => ({ name: t.id, role: `PDR Electrical (${t.members})` }))
      ];
    }
    if (area === 'CRM') {
      return CRM_ELECTRICAL_TEAMS.map(t => ({ name: t.id, role: `CRM Electrical (${t.members})` }));
    }
    return [];
  }

  static async getAutoLoggedDone(db, teamOrPerson, date) {
    const row = await db.prepare(`
      SELECT COUNT(*) as count
      FROM stage_history
      WHERE assigned_to = ?
        AND completed_at IS NOT NULL
        AND completed_at LIKE ?
    `).bind(teamOrPerson, `${date}%`).first();

    return row ? row.count : 0;
  }

  static async getDailyStatusForAreaAndDate(db, area, date) {
    const workers = this.getWorkersForArea(area);
    const { results: existingEntries } = await db.prepare(`
      SELECT * FROM daily_status
      WHERE area = ? AND date = ?
    `).bind(area, date).all();

    // Fetch all auto-logged done counts for this date in one query to minimize D1 subrequests
    const { results: autoCounts } = await db.prepare(`
      SELECT assigned_to, COUNT(*) as count
      FROM stage_history
      WHERE completed_at IS NOT NULL
        AND completed_at LIKE ?
      GROUP BY assigned_to
    `).bind(`${date}%`).all();

    const autoMap = new Map();
    for (const r of autoCounts) {
      if (r.assigned_to) autoMap.set(r.assigned_to, r.count);
    }

    const entryMap = new Map();
    for (const entry of existingEntries) {
      entryMap.set(entry.team_or_person, entry);
    }

    return workers.map(worker => {
      const saved = entryMap.get(worker.name);
      const target = saved ? saved.target : 0;
      const actual = saved ? saved.actual : 0;
      const autoLoggedDone = autoMap.get(worker.name) || 0;
      const variance = actual - target;
      const achievementPercent = target > 0 ? Math.round((actual / target) * 100 * 10) / 10 : 0;

      return {
        date,
        area,
        teamOrPerson: worker.name,
        roleDescription: worker.role,
        target,
        actual,
        autoLoggedDone,
        variance,
        achievementPercent,
        updatedAt: saved ? saved.updated_at : null
      };
    });
  }

  static async getSubAssemblyForDate(db, date) {
    const { results: savedRows } = await db.prepare(`
      SELECT * FROM sub_assembly WHERE date = ?
    `).bind(date).all();

    const savedMap = new Map();
    for (const r of savedRows) {
      savedMap.set(r.item, r);
    }

    return SUB_ASSEMBLY_ITEMS.map(spec => {
      const saved = savedMap.get(spec.item);
      const target = saved ? saved.target : 0;
      const actual = saved ? saved.actual : 0;
      const variance = actual - target;
      const achievementPercent = target > 0 ? Math.round((actual / target) * 100 * 10) / 10 : 0;

      return {
        date,
        item: spec.item,
        dailyCapacity: spec.dailyCapacity,
        unit: spec.unit,
        target,
        actual,
        variance,
        achievementPercent,
        updatedAt: saved ? saved.updated_at : null
      };
    });
  }
}

