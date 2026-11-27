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
import { getDatabase } from '../db/database.js';

export class MasterDataController {
  static getMasterData(req, res) {
    try {
      const db = getDatabase();
      let customEntries = [];
      try {
        customEntries = db.prepare('SELECT * FROM custom_manpower WHERE is_active = 1 ORDER BY name ASC').all();
      } catch (_) {
        // Table may not yet be initialized in some mock environments
      }

      // Dynamically attach active custom workers/teams to relevant stage eligibleWorkers
      const tractionWorkflow = TRACTION_WORKFLOW.map(s => {
        const allowedAreas = s.eligibleAreas || [s.area];
        const relevantCustom = customEntries.filter(c => allowedAreas.includes(c.area));
        const customNames = relevantCustom.map(c => c.name);
        return {
          ...s,
          eligibleWorkers: Array.from(new Set([...s.eligibleWorkers, ...customNames]))
        };
      });

      const dcsWorkflow = DCS_WORKFLOW.map(s => {
        const allowedAreas = s.eligibleAreas || [s.area];
        const relevantCustom = customEntries.filter(c => allowedAreas.includes(c.area));
        const customNames = relevantCustom.map(c => c.name);
        return {
          ...s,
          eligibleWorkers: Array.from(new Set([...s.eligibleWorkers, ...customNames]))
        };
      });

      return res.json({
        areas: FACTORY_AREAS,
        manpower: {
          ksm: KSM_MANPOWER,
          pdrMechanical: PDR_MECHANICAL_MANPOWER,
          pdrElectrical: PDR_ELECTRICAL_TEAMS,
          crmElectrical: CRM_ELECTRICAL_TEAMS,
          custom: customEntries
        },
        subAssemblySpecs: SUB_ASSEMBLY_ITEMS,
        workflows: {
          traction: tractionWorkflow,
          dcs: dcsWorkflow
        },
        assumptions: FACTORY_ASSUMPTIONS
      });
    } catch (error) {
      console.error('Error fetching master data:', error);
      return res.status(500).json({ error: 'Failed to retrieve master data.' });
    }
  }
}
