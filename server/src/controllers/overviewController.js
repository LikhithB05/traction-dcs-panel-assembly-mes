import { getDatabase } from '../db/database.js';
import { WorkflowEngine } from '../services/workflowEngine.js';
import { BottleneckService } from '../services/bottleneckService.js';
import { TRACTION_WORKFLOW, DCS_WORKFLOW } from '../data/masterData.js';

export class OverviewController {
  static getOverview(req, res) {
    try {
      const db = getDatabase();
      const today = new Date().toISOString().slice(0, 10);

      const allPanels = db.prepare(`SELECT * FROM panels`).all();

      let inProgressCount = 0;
      let waitingCount = 0;
      let heldCount = 0;
      let doneCount = 0;
      let overdueCount = 0;
      let tractionCount = 0;
      let dcsCount = 0;

      const heldPanels = [];
      const overduePanels = [];

      // Area-specific tracking
      const areaStats = {
        KSM: { total: 0, waiting: 0, inProgress: 0, held: 0, activeStages: [] },
        PDR: { total: 0, waiting: 0, inProgress: 0, held: 0, activeStages: [] },
        CRM: { total: 0, waiting: 0, inProgress: 0, held: 0, activeStages: [] }
      };

      for (const p of allPanels) {
        if (p.type === 'Traction') tractionCount++;
        if (p.type === 'DCS') dcsCount++;

        if (p.status === 'In Progress') inProgressCount++;
        else if (p.status === 'Waiting') waitingCount++;
        else if (p.status === 'Held') heldCount++;
        else if (p.status === 'Done') doneCount++;

        const isOverdue = p.status !== 'Done' && p.due_date < today;
        if (isOverdue) {
          overdueCount++;
          const daysOverdue = Math.floor((new Date(today).getTime() - new Date(p.due_date).getTime()) / (1000 * 60 * 60 * 24));
          const stageDef = WorkflowEngine.getStageDefinition(p.type, p.current_stage);

          overduePanels.push({
            id: p.id,
            type: p.type,
            project: p.project,
            priority: p.priority,
            dueDate: p.due_date,
            daysOverdue,
            currentStage: p.current_stage,
            stageName: stageDef.name,
            currentArea: p.current_area,
            assignedTo: p.assigned_to,
            status: p.status
          });
        }

        if (p.status === 'Held') {
          // Get hold start
          const holdRecord = db.prepare(`
            SELECT held_at, reason FROM hold_history
            WHERE panel_id = ? AND resumed_at IS NULL
            ORDER BY held_at DESC LIMIT 1
          `).get(p.id);

          const heldAt = holdRecord ? holdRecord.held_at : p.updated_at;
          const diffHours = Math.round((Date.now() - new Date(heldAt).getTime()) / (1000 * 60 * 60) * 10) / 10;
          const stageDef = WorkflowEngine.getStageDefinition(p.type, p.current_stage);

          heldPanels.push({
            id: p.id,
            type: p.type,
            project: p.project,
            stageNumber: p.current_stage,
            stageName: stageDef.name,
            currentArea: p.current_area,
            assignedTo: p.assigned_to,
            heldSince: heldAt,
            heldHours: diffHours,
            reason: p.hold_reason || (holdRecord ? holdRecord.reason : 'Unspecified hold')
          });
        }

        // Area stats
        if (areaStats[p.current_area]) {
          areaStats[p.current_area].total++;
          if (p.status === 'Waiting') areaStats[p.current_area].waiting++;
          if (p.status === 'In Progress') areaStats[p.current_area].inProgress++;
          if (p.status === 'Held') areaStats[p.current_area].held++;

          const stageDef = WorkflowEngine.getStageDefinition(p.type, p.current_stage);
          if (!areaStats[p.current_area].activeStages.includes(stageDef.name)) {
            areaStats[p.current_area].activeStages.push(stageDef.name);
          }
        }
      }

      // Stage-wise counts for Traction (10 stages)
      const tractionStageCounts = TRACTION_WORKFLOW.map(stage => {
        const count = allPanels.filter(p => p.type === 'Traction' && p.current_stage === stage.stageNumber && p.status !== 'Done').length;
        return {
          stageNumber: stage.stageNumber,
          stageName: stage.name,
          area: stage.area,
          count
        };
      });

      // Stage-wise counts for DCS (8 stages)
      const dcsStageCounts = DCS_WORKFLOW.map(stage => {
        const count = allPanels.filter(p => p.type === 'DCS' && p.current_stage === stage.stageNumber && p.status !== 'Done').length;
        return {
          stageNumber: stage.stageNumber,
          stageName: stage.name,
          area: stage.area,
          count
        };
      });

      // Team workloads (currently active work)
      const teamWorkloads = db.prepare(`
        SELECT assigned_to, current_area, type, id, current_stage, status
        FROM panels
        WHERE assigned_to IS NOT NULL AND status IN ('In Progress', 'Held')
        ORDER BY assigned_to ASC
      `).all();

      // Bottleneck analysis
      const bottleneckData = BottleneckService.analyzeBottlenecks(db);

      return res.json({
        kpis: {
          totalPanels: allPanels.length,
          inProgressCount,
          waitingCount,
          heldCount,
          overdueCount,
          doneCount,
          tractionCount,
          dcsCount
        },
        areaStats,
        heldPanels,
        overduePanels,
        stageCounts: {
          traction: tractionStageCounts,
          dcs: dcsStageCounts
        },
        teamWorkloads,
        bottlenecks: bottleneckData
      });
    } catch (error) {
      console.error('Error compiling overview metrics:', error);
      return res.status(500).json({ error: 'Failed to retrieve overview metrics.' });
    }
  }
}
