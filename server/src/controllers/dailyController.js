import { getDatabase } from '../db/database.js';
import { DailyStatusService } from '../services/dailyStatusService.js';
import { SUB_ASSEMBLY_ITEMS } from '../data/masterData.js';

export class DailyController {
  static getDailyStatus(req, res) {
    try {
      const db = getDatabase();
      const area = req.query.area || 'KSM';
      const date = req.query.date || new Date().toISOString().slice(0, 10);

      if (req.query.date && !/^\d{4}-\d{2}-\d{2}$/.test(req.query.date)) {
        return res.status(400).json({ error: 'Date query parameter must be in YYYY-MM-DD format.' });
      }

      const roster = DailyStatusService.getDailyStatusForAreaAndDate(db, area, date);
      return res.json({
        area,
        date,
        roster
      });
    } catch (error) {
      console.error('Error fetching daily status:', error);
      return res.status(500).json({ error: 'Failed to retrieve daily status.' });
    }
  }

  static updateDailyStatus(req, res) {
    try {
      const db = getDatabase();
      const { date, area, teamOrPerson, target, actual } = req.body;

      if (!date || !area || !teamOrPerson || target === undefined || actual === undefined) {
        return res.status(400).json({ error: 'Missing required parameters (date, area, teamOrPerson, target, actual).' });
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'Date must be in YYYY-MM-DD format.' });
      }

      const numTarget = Number(target);
      const numActual = Number(actual);

      if (!Number.isInteger(numTarget) || numTarget < 0) {
        return res.status(400).json({ error: 'Daily target must be a non-negative whole integer.' });
      }

      if (!Number.isInteger(numActual) || numActual < 0) {
        return res.status(400).json({ error: 'Daily actual must be a non-negative whole integer.' });
      }

      // Check permissions: Area lead can edit only their area, Admin can edit all
      if (!req.user.isAdmin && req.user.role !== 'AKR' && req.user.role !== 'CKG' && req.user.role !== area) {
        return res.status(403).json({ error: `Permission denied. User with role '${req.user.role}' cannot edit '${area}' daily status.` });
      }

      const entryId = `${date}_${teamOrPerson}`;
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO daily_status (id, date, area, team_or_person, target, actual, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(date, team_or_person) DO UPDATE SET
          target = excluded.target,
          actual = excluded.actual,
          updated_at = excluded.updated_at
      `).run(entryId, date, area, teamOrPerson, numTarget, numActual, now);

      const autoLoggedDone = DailyStatusService.getAutoLoggedDone(db, teamOrPerson, date);
      const variance = numActual - numTarget;
      const achievementPercent = numTarget > 0 ? Math.round((numActual / numTarget) * 100 * 10) / 10 : 0;

      return res.json({
        message: 'Daily status saved successfully.',
        entry: {
          id: entryId,
          date,
          area,
          teamOrPerson,
          target: numTarget,
          actual: numActual,
          autoLoggedDone,
          variance,
          achievementPercent,
          updatedAt: now
        }
      });
    } catch (error) {
      console.error('Error updating daily status:', error);
      return res.status(500).json({ error: error.message || 'Failed to update daily status.' });
    }
  }

  static getSubAssemblies(req, res) {
    try {
      const db = getDatabase();
      const date = req.query.date || new Date().toISOString().slice(0, 10);

      if (req.query.date && !/^\d{4}-\d{2}-\d{2}$/.test(req.query.date)) {
        return res.status(400).json({ error: 'Date query parameter must be in YYYY-MM-DD format.' });
      }

      const items = DailyStatusService.getSubAssemblyForDate(db, date);
      return res.json({
        date,
        items
      });
    } catch (error) {
      console.error('Error fetching sub-assemblies:', error);
      return res.status(500).json({ error: 'Failed to retrieve sub-assembly entries.' });
    }
  }

  static updateSubAssembly(req, res) {
    try {
      const db = getDatabase();
      const { date, item, target, actual } = req.body;

      if (!date || !item || target === undefined || actual === undefined) {
        return res.status(400).json({ error: 'Missing parameters (date, item, target, actual).' });
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'Date must be in YYYY-MM-DD format.' });
      }

      const numTarget = Number(target);
      const numActual = Number(actual);

      if (!Number.isInteger(numTarget) || numTarget < 0) {
        return res.status(400).json({ error: 'Sub-assembly target must be a non-negative whole integer.' });
      }

      if (!Number.isInteger(numActual) || numActual < 0) {
        return res.status(400).json({ error: 'Sub-assembly actual must be a non-negative whole integer.' });
      }

      // Permissions: KSM or Admin only
      if (!req.user.isAdmin && req.user.role !== 'AKR' && req.user.role !== 'CKG' && req.user.role !== 'KSM') {
        return res.status(403).json({ error: 'Permission denied. Only KSM or Admins can edit sub-assembly records.' });
      }

      const itemSpec = SUB_ASSEMBLY_ITEMS.find(s => s.item === item);
      const dailyCapacity = itemSpec ? itemSpec.dailyCapacity : 30;

      const entryId = `${date}_${item.replace(/\s+/g, '_')}`;
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO sub_assembly (id, date, item, daily_capacity, target, actual, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(date, item) DO UPDATE SET
          target = excluded.target,
          actual = excluded.actual,
          updated_at = excluded.updated_at
      `).run(entryId, date, item, dailyCapacity, numTarget, numActual, now);

      const variance = numActual - numTarget;
      const achievementPercent = numTarget > 0 ? Math.round((numActual / numTarget) * 100 * 10) / 10 : 0;

      return res.json({
        message: 'Sub-assembly record saved successfully.',
        entry: {
          id: entryId,
          date,
          item,
          dailyCapacity,
          target: numTarget,
          actual: numActual,
          variance,
          achievementPercent,
          updatedAt: now
        }
      });
    } catch (error) {
      console.error('Error updating sub-assembly:', error);
      return res.status(500).json({ error: error.message || 'Failed to update sub-assembly.' });
    }
  }
}
