import crypto from 'node:crypto';
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
      // Backward-compatible fallback mapping for historical stage records
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
    const nextStage = workflow.find(s => s.stageNumber === currentStageNumber + 1);
    return nextStage || null;
  }

  static isFinalStage(type, stageNumber) {
    const workflow = this.getWorkflow(type);
    return stageNumber === workflow[workflow.length - 1].stageNumber;
  }

  /**
   * Determine owning area for a stage given assignment
   */
  static getOwningAreaForStage(stageDef, assignedTo, db = null) {
    if (stageDef.areaOverride) return stageDef.areaOverride;
    if (stageDef.eligibleAreas && assignedTo) {
      if (assignedTo.startsWith('CRM')) return 'CRM';
      if (assignedTo.startsWith('PDR')) return 'PDR';
      if (assignedTo.startsWith('KSM')) return 'KSM';
      if (db) {
        try {
          const custom = db.prepare('SELECT area FROM custom_manpower WHERE name = ? AND is_active = 1 LIMIT 1').get(assignedTo);
          if (custom && custom.area) return custom.area;
        } catch (_) {}
      }
    }
    return stageDef.area;
  }

  /**
   * Validate worker eligibility for a given stage (including custom workers/teams)
   */
  static validateWorkerEligibility(db, panel, stageNumber, assignedTo, user = null) {
    const stageDef = this.getStageDefinition(panel.type, stageNumber);

    if (!assignedTo) {
      throw new Error('A person or team must be assigned to start this stage.');
    }

    let isEligible = stageDef.eligibleWorkers.includes(assignedTo);
    let customRecord = null;

    if (!isEligible && db) {
      try {
        const allowedAreas = stageDef.eligibleAreas ? stageDef.eligibleAreas : [stageDef.area];
        const placeholders = allowedAreas.map(() => '?').join(',');
        customRecord = db.prepare(`
          SELECT * FROM custom_manpower
          WHERE name = ? AND area IN (${placeholders}) AND is_active = 1
        `).get(assignedTo, ...allowedAreas);

        if (customRecord) {
          isEligible = true;
        }
      } catch (err) {
        // Fall back to static check
      }
    }

    if (!isEligible) {
      throw new Error(`Worker/Team '${assignedTo}' is not eligible for stage '${stageDef.name}'. Eligible: ${stageDef.eligibleWorkers.join(', ')}`);
    }

    // Role check: non-admin users can only assign teams/workers belonging to their authorized area
    if (user && !user.isAdmin && user.role !== 'AKR' && user.role !== 'CKG') {
      const owningArea = this.getOwningAreaForStage(stageDef, assignedTo, db);
      const isSharedStage = stageDef.eligibleAreas && stageDef.eligibleAreas.includes(user.role);
      if (!isSharedStage && owningArea !== user.role) {
        throw new Error(`User with role '${user.role}' cannot assign work to '${owningArea}' team/worker '${assignedTo}'.`);
      }
    }

    return true;
  }

  /**
   * Check if a user role can perform action on panel
   */
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
      } catch (e) {
        // Fall back to current_area check
      }
    }
    return user.role === panel.current_area;
  }

  /**
   * Determine the most recent reversible stage completion for a panel.
   * Returns: { eligible: boolean, reason?: string, stageHistoryRecord?: object, targetStageNumber?: number, targetStageDef?: object }
   */
  static getReversibleCompletion(db, panel) {
    if (!panel) {
      return { eligible: false, reason: 'Panel does not exist.' };
    }

    // Unsafe state check: stage currently in progress or on hold
    if (panel.status === 'In Progress' || panel.status === 'Held') {
      return {
        eligible: false,
        reason: `Cannot undo completion because Stage ${panel.current_stage} is currently '${panel.status}'. Subsequent workflow activity has commenced.`
      };
    }

    // Boundary check: initial stage in Waiting has no prior completion
    if (panel.status === 'Waiting' && panel.current_stage === 1) {
      const completedStage1 = db.prepare(`
        SELECT * FROM stage_history
        WHERE panel_id = ? AND stage_number = 1 AND completed_at IS NOT NULL AND undone_at IS NULL
        ORDER BY completed_at DESC LIMIT 1
      `).get(panel.id);

      if (!completedStage1) {
        return {
          eligible: false,
          reason: 'Panel is at the initial workflow stage with no completed stage to undo.'
        };
      }
    }

    // Find the latest completed stage record that has not been undone
    const lastCompleted = db.prepare(`
      SELECT * FROM stage_history
      WHERE panel_id = ? AND completed_at IS NOT NULL AND undone_at IS NULL
      ORDER BY completed_at DESC, created_at DESC
      LIMIT 1
    `).get(panel.id);

    if (!lastCompleted) {
      return {
        eligible: false,
        reason: 'No completed workflow stage exists to undo for this panel.'
      };
    }

    // Determine target stage:
    // If panel is 'Done', undoing returns it to that final stage for rework.
    // If panel is 'Waiting' at stage S, undoing returns it to the completed stage that advanced it.
    let targetStageNumber;
    if (panel.status === 'Done') {
      targetStageNumber = panel.current_stage;
    } else {
      targetStageNumber = lastCompleted.stage_number;
    }

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

