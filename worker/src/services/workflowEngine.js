import { TRACTION_WORKFLOW, DCS_WORKFLOW } from '../data/masterData.js';

export class WorkflowEngine {
  static getWorkflow(type) {
    if (type === 'Traction') return TRACTION_WORKFLOW;
    if (type === 'DCS') return DCS_WORKFLOW;
    throw new Error(`Unknown panel type: ${type}`);
  }

  static getStageDefinition(type, stageNumber) {
    const workflow = this.getWorkflow(type);
    let stage = workflow.find(s => s.stageNumber === stageNumber);
    if (!stage) {
      if (type === 'Traction') {
        if (stageNumber === 9 || stageNumber === 10) stage = workflow.find(s => s.stageNumber === 8);
        else if (stageNumber === 7) stage = workflow.find(s => s.stageNumber === 6);
        else if (stageNumber === 8) stage = workflow.find(s => s.stageNumber === 7);
      } else if (type === 'DCS') {
        if (stageNumber === 7 || stageNumber === 8) stage = workflow.find(s => s.stageNumber === 6);
        else if (stageNumber === 5) stage = workflow.find(s => s.stageNumber === 4);
        else if (stageNumber === 6) stage = workflow.find(s => s.stageNumber === 5);
      }
    }
    if (!stage) {
      throw new Error(`Invalid stage number ${stageNumber} for type ${type}`);
    }
    return stage;
  }

  static getNextStage(type, currentStageNumber) {
    const workflow = this.getWorkflow(type);
    return workflow.find(s => s.stageNumber === currentStageNumber + 1) || null;
  }

  static isFinalStage(type, stageNumber) {
    const workflow = this.getWorkflow(type);
    return stageNumber === workflow[workflow.length - 1].stageNumber;
  }

  static async getOwningAreaForStage(stageDef, assignedTo, db = null) {
    if (stageDef.areaOverride) return stageDef.areaOverride;
    if (stageDef.eligibleAreas && assignedTo) {
      if (assignedTo.startsWith('CRM')) return 'CRM';
      if (assignedTo.startsWith('PDR')) return 'PDR';
      if (assignedTo.startsWith('KSM')) return 'KSM';
      if (db) {
        try {
          const custom = await db.prepare('SELECT area FROM custom_manpower WHERE name = ? AND is_active = 1 LIMIT 1').bind(assignedTo).first();
          if (custom && custom.area) return custom.area;
        } catch (_) {}
      }
    }
    return stageDef.area;
  }

  static async validateWorkerEligibility(db, panel, stageNumber, assignedTo, user = null) {
    const stageDef = this.getStageDefinition(panel.type, stageNumber);

    if (!assignedTo) {
      throw new Error('A person or team must be assigned to start this stage.');
    }

    let isEligible = stageDef.eligibleWorkers.includes(assignedTo);

    if (!isEligible && db) {
      try {
        const allowedAreas = stageDef.eligibleAreas ? stageDef.eligibleAreas : [stageDef.area];
        const placeholders = allowedAreas.map(() => '?').join(',');
        const customRecord = await db.prepare(`
          SELECT * FROM custom_manpower
          WHERE name = ? AND area IN (${placeholders}) AND is_active = 1
        `).bind(assignedTo, ...allowedAreas).first();

        if (customRecord) {
          isEligible = true;
        }
      } catch (_) {}
    }

    if (!isEligible) {
      throw new Error(`Worker/Team '${assignedTo}' is not eligible for stage '${stageDef.name}'. Eligible: ${stageDef.eligibleWorkers.join(', ')}`);
    }

    if (user && !user.isAdmin && user.role !== 'AKR' && user.role !== 'CKG') {
      const owningArea = await this.getOwningAreaForStage(stageDef, assignedTo, db);
      const isSharedStage = stageDef.eligibleAreas && stageDef.eligibleAreas.includes(user.role);
      if (!isSharedStage && owningArea !== user.role) {
        throw new Error(`User with role '${user.role}' cannot assign work to '${owningArea}' team/worker '${assignedTo}'.`);
      }
    }

    return true;
  }

  static canUserOperatePanel(user, panel, targetArea) {
    if (!user) return false;
    if (user.isAdmin || user.role === 'AKR' || user.role === 'CKG') return true;
    if (targetArea) return user.role === targetArea;
    if (panel && panel.type && panel.current_stage) {
      try {
        const stageDef = this.getStageDefinition(panel.type, panel.current_stage);
        if (stageDef && stageDef.eligibleAreas && stageDef.eligibleAreas.includes(user.role)) {
          return true;
        }
      } catch (_) {}
    }
    return user.role === panel.current_area;
  }

  static async getReversibleCompletion(db, panel) {
    if (!panel) {
      return { eligible: false, reason: 'Panel does not exist.' };
    }

    if (panel.status === 'In Progress' || panel.status === 'Held') {
      return {
        eligible: false,
        reason: `Cannot undo completion because Stage ${panel.current_stage} is currently '${panel.status}'. Subsequent workflow activity has commenced.`
      };
    }

    if (panel.status === 'Waiting' && panel.current_stage === 1) {
      const completedStage1 = await db.prepare(`
        SELECT * FROM stage_history
        WHERE panel_id = ? AND stage_number = 1 AND completed_at IS NOT NULL AND undone_at IS NULL
        ORDER BY completed_at DESC LIMIT 1
      `).bind(panel.id).first();

      if (!completedStage1) {
        return {
          eligible: false,
          reason: 'Panel is at the initial workflow stage with no completed stage to undo.'
        };
      }
    }

    const lastCompleted = await db.prepare(`
      SELECT * FROM stage_history
      WHERE panel_id = ? AND completed_at IS NOT NULL AND undone_at IS NULL
      ORDER BY completed_at DESC, created_at DESC
      LIMIT 1
    `).bind(panel.id).first();

    if (!lastCompleted) {
      return {
        eligible: false,
        reason: 'No completed workflow stage exists to undo for this panel.'
      };
    }

    const targetStageNumber = panel.status === 'Done' ? panel.current_stage : lastCompleted.stage_number;
    const workflow = this.getWorkflow(panel.type);
    const targetStageDef = workflow.find(s => s.stageNumber === targetStageNumber);

    if (!targetStageDef) {
      return {
        eligible: false,
        reason: `Cannot resolve destination stage #${targetStageNumber} in ${panel.type} workflow.`
      };
    }

    return {
      eligible: true,
      stageHistoryRecord: lastCompleted,
      reversedStageNumber: lastCompleted.stage_number,
      reversedStageName: lastCompleted.stage_name,
      targetStageNumber,
      targetStageDef
    };
  }
}

