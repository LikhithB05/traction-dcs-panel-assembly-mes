import { TRACTION_WORKFLOW, DCS_WORKFLOW, PDR_ELECTRICAL_TEAMS, CRM_ELECTRICAL_TEAMS } from '../data/masterData.js';

export class BottleneckService {
  static analyzeBottlenecks(db) {
    const panels = db.prepare(`SELECT * FROM panels WHERE status != 'Done'`).all();
    const stageHistory = db.prepare(`SELECT * FROM stage_history WHERE started_at IS NOT NULL`).all();

    // Group active panels by (type, current_stage)
    const queueDepthByStage = new Map();
    for (const p of panels) {
      const key = `${p.type}_Stage_${p.current_stage}`;
      const count = queueDepthByStage.get(key) || 0;
      queueDepthByStage.set(key, count + 1);
    }

    // Calculate dwell times in hours for in-progress or completed stages
    const dwellTimesByStage = new Map();
    const nowMs = Date.now();

    for (const entry of stageHistory) {
      const startTime = new Date(entry.started_at).getTime();
      let endTime = entry.completed_at ? new Date(entry.completed_at).getTime() : nowMs;
      const durationHours = Math.max(0, (endTime - startTime) / (1000 * 60 * 60));

      const key = `Stage_${entry.stage_number}`;
      if (!dwellTimesByStage.has(key)) {
        dwellTimesByStage.set(key, []);
      }
      dwellTimesByStage.get(key).push(durationHours);
    }

    // Compute averages across all stages
    const queueValues = Array.from(queueDepthByStage.values());
    const avgQueueDepth = queueValues.length > 0 ? queueValues.reduce((a, b) => a + b, 0) / queueValues.length : 0;

    const avgDwellByStage = new Map();
    let totalDwellSum = 0;
    let totalDwellCount = 0;

    dwellTimesByStage.forEach((times, stageKey) => {
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      avgDwellByStage.set(stageKey, avg);
      totalDwellSum += times.reduce((a, b) => a + b, 0);
      totalDwellCount += times.length;
    });

    const overallAvgDwell = totalDwellCount > 0 ? totalDwellSum / totalDwellCount : 0;

    const bottlenecks = [];

    // Evaluate Traction stages
    for (const stage of TRACTION_WORKFLOW) {
      const key = `Traction_Stage_${stage.stageNumber}`;
      const queueDepth = queueDepthByStage.get(key) || 0;
      const stageDwellAvg = avgDwellByStage.get(`Stage_${stage.stageNumber}`) || 0;

      const isQueueBottleneck = avgQueueDepth > 0 && queueDepth >= Math.max(2, 2 * avgQueueDepth);
      const isDwellBottleneck = overallAvgDwell > 0 && stageDwellAvg >= Math.max(4, 2 * overallAvgDwell);

      if (isQueueBottleneck || isDwellBottleneck) {
        const affectedPanels = panels.filter(p => p.type === 'Traction' && p.current_stage === stage.stageNumber).map(p => p.id);

        let recommendation = 'Monitor stage closely.';
        let qualifiedReallocation = null;

        if (stage.stageNumber === 5) { // LV Wiring
          recommendation = 'LV Wiring queue elevated. Authorize backup Teams (PDR Teams 3, 4, 5) to offload Primary Team 6.';
          qualifiedReallocation = ['PDR Team 3', 'PDR Team 4', 'PDR Team 5'];
        } else if (stage.stageNumber === 3) { // HV Cabling
          recommendation = 'HV Cabling backlogged. Reallocate available CRM Teams (1–9) or underutilized PDR teams (1–5).';
          qualifiedReallocation = CRM_ELECTRICAL_TEAMS.map(t => t.id);
        } else if (stage.stageNumber === 2 || stage.stageNumber === 4) { // Mech Stage 2 / 3
          recommendation = 'Mechanical backlog. Reallocate available mechanical personnel.';
          qualifiedReallocation = ['PDR-MECH-1', 'PDR-MECH-2', 'PDR-MECH-3', 'PDR-MECH-4'];
        }

        bottlenecks.push({
          type: 'Traction',
          stageNumber: stage.stageNumber,
          stageName: stage.name,
          area: stage.area,
          queueDepth,
          avgDwellHours: Math.round(stageDwellAvg * 10) / 10,
          evidence: `Queue depth (${queueDepth} panels) is ${queueDepth > avgQueueDepth ? 'above average (' + Math.round(avgQueueDepth * 10) / 10 + ')' : 'normal'}, Dwell time is ${Math.round(stageDwellAvg * 10) / 10}h (avg: ${Math.round(overallAvgDwell * 10) / 10}h).`,
          affectedPanels,
          recommendation,
          qualifiedReallocation,
          assumptionNotice: 'Calculation uses real stage history timestamps; cycle times are observed, not fabricated.'
        });
      }
    }

    // Evaluate DCS stages
    for (const stage of DCS_WORKFLOW) {
      const key = `DCS_Stage_${stage.stageNumber}`;
      const queueDepth = queueDepthByStage.get(key) || 0;
      const stageDwellAvg = avgDwellByStage.get(`Stage_${stage.stageNumber}`) || 0;

      const isQueueBottleneck = avgQueueDepth > 0 && queueDepth >= Math.max(2, 2 * avgQueueDepth);

      if (isQueueBottleneck) {
        const affectedPanels = panels.filter(p => p.type === 'DCS' && p.current_stage === stage.stageNumber).map(p => p.id);

        bottlenecks.push({
          type: 'DCS',
          stageNumber: stage.stageNumber,
          stageName: stage.name,
          area: stage.area,
          queueDepth,
          avgDwellHours: Math.round(stageDwellAvg * 10) / 10,
          evidence: `Queue depth (${queueDepth} panels) exceeds double the system average queue depth (${Math.round(avgQueueDepth * 10) / 10}).`,
          affectedPanels,
          recommendation: stage.stageNumber === 3 ? 'DCS Wiring: Rebalance wiring allocation across qualified CRM teams.' : 'PDR Mechanical: Reallocate available mechanical personnel.',
          qualifiedReallocation: stage.stageNumber === 3 ? CRM_ELECTRICAL_TEAMS.map(t => t.id) : ['PDR-MECH-1', 'PDR-MECH-2', 'PDR-MECH-3', 'PDR-MECH-4'],
          assumptionNotice: 'Capacity is shared: DCS allocation directly affects Traction capacity.'
        });
      }
    }

    return {
      activePanelsCount: panels.length,
      avgQueueDepth: Math.round(avgQueueDepth * 10) / 10,
      overallAvgDwellHours: Math.round(overallAvgDwell * 10) / 10,
      bottlenecks,
      analyzedAt: new Date().toISOString()
    };
  }
}
