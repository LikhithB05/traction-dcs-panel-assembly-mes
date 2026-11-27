import crypto from 'node:crypto';
import { getDatabase } from '../db/database.js';
import { SimulatorService } from '../services/simulatorService.js';

export const MAX_OVERTIME_HOURS = 8;
export const MAX_EXTRA_SHIFTS = 2;
export const MAX_ADDITIONAL_HEADCOUNT = 50;

export class SimulatorController {
  static runSimulation(req, res) {
    try {
      const db = getDatabase();
      const body = req.body || {};

      const {
        tractionTarget,
        dcsTarget,
        workingDays = 26,
        overtimeHours = 0,
        additionalMechanicalWorkers = 0,
        additionalElectricalTeams = 0,
        extraShifts = 0,
        acceptAssumptions = false
      } = body;

      if (tractionTarget === undefined || dcsTarget === undefined) {
        return res.status(400).json({ error: 'Monthly targets for Traction and DCS are required.' });
      }

      const tTarget = Number(tractionTarget);
      const dTarget = Number(dcsTarget);
      const days = Number(workingDays);
      const ot = Number(overtimeHours);
      const addMech = Number(additionalMechanicalWorkers);
      const addElec = Number(additionalElectricalTeams);
      const shifts = Number(extraShifts);

      if (!Number.isFinite(tTarget) || tTarget < 0 || !Number.isInteger(tTarget) || tTarget > 10000) {
        return res.status(400).json({ error: 'Traction target must be a non-negative integer up to 10,000.' });
      }
      if (!Number.isFinite(dTarget) || dTarget < 0 || !Number.isInteger(dTarget) || dTarget > 10000) {
        return res.status(400).json({ error: 'DCS target must be a non-negative integer up to 10,000.' });
      }
      if (!Number.isFinite(days) || days < 1 || days > 31 || !Number.isInteger(days)) {
        return res.status(400).json({ error: 'Working days must be an integer between 1 and 31.' });
      }
      if (!Number.isFinite(ot) || ot < 0 || ot > MAX_OVERTIME_HOURS) {
        return res.status(400).json({ error: `Overtime hours must be a number between 0 and ${MAX_OVERTIME_HOURS}.` });
      }
      if (!Number.isFinite(addMech) || addMech < 0 || !Number.isInteger(addMech) || addMech > MAX_ADDITIONAL_HEADCOUNT) {
        return res.status(400).json({ error: `Additional mechanical workers must be an integer between 0 and ${MAX_ADDITIONAL_HEADCOUNT}.` });
      }
      if (!Number.isFinite(addElec) || addElec < 0 || !Number.isInteger(addElec) || addElec > MAX_ADDITIONAL_HEADCOUNT) {
        return res.status(400).json({ error: `Additional electrical teams must be an integer between 0 and ${MAX_ADDITIONAL_HEADCOUNT}.` });
      }
      if (!Number.isFinite(shifts) || shifts < 0 || !Number.isInteger(shifts) || shifts > MAX_EXTRA_SHIFTS) {
        return res.status(400).json({ error: `Extra shifts must be an integer between 0 and ${MAX_EXTRA_SHIFTS}.` });
      }

      const validatedParams = {
        tractionTarget: tTarget,
        dcsTarget: dTarget,
        workingDays: days,
        overtimeHours: ot,
        additionalMechanicalWorkers: addMech,
        additionalElectricalTeams: addElec,
        extraShifts: shifts,
        acceptAssumptions: Boolean(acceptAssumptions)
      };

      const simulationResult = SimulatorService.runSimulation(db, validatedParams);
      return res.json(simulationResult);
    } catch (error) {
      console.error('Simulation error:', error);
      return res.status(500).json({ error: 'Failed to run scenario simulation.' });
    }
  }

  static getScenarios(req, res) {
    try {
      const db = getDatabase();
      const rows = db.prepare(`SELECT * FROM what_if_scenarios ORDER BY created_at DESC`).all();

      const parsed = rows.map(r => ({
        id: r.id,
        name: r.name,
        notes: r.notes,
        createdBy: r.created_by,
        createdAt: r.created_at,
        scenarioData: JSON.parse(r.scenario_data)
      }));

      return res.json(parsed);
    } catch (error) {
      console.error('Error fetching scenarios:', error);
      return res.status(500).json({ error: 'Failed to retrieve saved scenarios.' });
    }
  }

  static saveScenario(req, res) {
    try {
      const db = getDatabase();
      const { name, notes, scenarioData } = req.body;

      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'Scenario name is required.' });
      }
      if (!scenarioData || typeof scenarioData !== 'object') {
        return res.status(400).json({ error: 'Valid simulation result data is required.' });
      }

      const id = 'scen_' + crypto.randomUUID();
      const now = new Date().toISOString();
      const createdBy = req.user ? req.user.username : 'OPERATOR';

      db.prepare(`
        INSERT INTO what_if_scenarios (id, name, notes, created_by, created_at, scenario_data)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, name.trim(), (notes || '').trim(), createdBy, now, JSON.stringify(scenarioData));

      return res.status(201).json({
        message: 'Scenario saved successfully.',
        id,
        name: name.trim()
      });
    } catch (error) {
      console.error('Error saving scenario:', error);
      return res.status(500).json({ error: 'Failed to save scenario.' });
    }
  }

  static deleteScenario(req, res) {
    try {
      const db = getDatabase();
      const { id } = req.params;

      const scen = db.prepare(`SELECT * FROM what_if_scenarios WHERE id = ?`).get(id);
      if (!scen) {
        return res.status(404).json({ error: `Scenario '${id}' not found.` });
      }

      // Authorization: Admin or creator only
      const user = req.user;
      const isAdmin = user && (user.isAdmin || user.role === 'AKR' || user.role === 'CKG');
      const isCreator = user && user.username === scen.created_by;
      if (!isAdmin && !isCreator) {
        return res.status(403).json({ error: 'Permission denied. Only Admins or the scenario author can delete this scenario.' });
      }

      db.prepare(`DELETE FROM what_if_scenarios WHERE id = ?`).run(id);
      return res.json({ message: 'Scenario deleted successfully.' });
    } catch (error) {
      console.error('Error deleting scenario:', error);
      return res.status(500).json({ error: 'Failed to delete scenario.' });
    }
  }
}

