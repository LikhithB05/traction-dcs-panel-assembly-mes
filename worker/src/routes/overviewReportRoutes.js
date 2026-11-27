import { Hono } from 'hono';
import { authenticateToken } from '../middleware/auth.js';
import { WorkflowEngine } from '../services/workflowEngine.js';
import { BottleneckService } from '../services/bottleneckService.js';
import { TRACTION_WORKFLOW, DCS_WORKFLOW } from '../data/masterData.js';

export const overviewReportRoutes = new Hono();
overviewReportRoutes.use('*', authenticateToken);

function sanitizeCSVCell(val) {
  if (val === null || val === undefined) return '""';
  let str = String(val);
  if (/^[\=\+\-\@\t\r]/.test(str)) {
    str = "'" + str;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

// === OVERVIEW ===
overviewReportRoutes.get('/overview', async (c) => {
  try {
    const db = c.env.DB;
    const today = new Date().toISOString().slice(0, 10);

    const [{ results: allPanels }, { results: openHolds }, { results: teamWorkloads }, bottleneckData] = await Promise.all([
      db.prepare('SELECT * FROM panels').all(),
      db.prepare('SELECT panel_id, held_at, reason FROM hold_history WHERE resumed_at IS NULL ORDER BY held_at DESC').all(),
      db.prepare("SELECT assigned_to, current_area, type, id, current_stage, status FROM panels WHERE assigned_to IS NOT NULL AND status IN ('In Progress', 'Held') ORDER BY assigned_to ASC").all(),
      BottleneckService.analyzeBottlenecks(db)
    ]);

    const holdMap = new Map();
    for (const h of openHolds) {
      if (!holdMap.has(h.panel_id)) holdMap.set(h.panel_id, h);
    }

    let inProgressCount = 0, waitingCount = 0, heldCount = 0, doneCount = 0, overdueCount = 0, tractionCount = 0, dcsCount = 0;
    const heldPanels = [];
    const overduePanels = [];
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

      const stageDef = WorkflowEngine.getStageDefinition(p.type, p.current_stage);

      if (p.status !== 'Done' && p.due_date < today) {
        overdueCount++;
        const daysOverdue = Math.floor((new Date(today).getTime() - new Date(p.due_date).getTime()) / 86400000);
        overduePanels.push({
          id: p.id, type: p.type, project: p.project, priority: p.priority, dueDate: p.due_date,
          daysOverdue, currentStage: p.current_stage, stageName: stageDef.name,
          currentArea: p.current_area, assignedTo: p.assigned_to, status: p.status
        });
      }

      if (p.status === 'Held') {
        const holdRecord = holdMap.get(p.id);
        const heldAt = holdRecord ? holdRecord.held_at : p.updated_at;
        const diffHours = Math.round((Date.now() - new Date(heldAt).getTime()) / 3600000 * 10) / 10;
        heldPanels.push({
          id: p.id, type: p.type, project: p.project, stageNumber: p.current_stage, stageName: stageDef.name,
          currentArea: p.current_area, assignedTo: p.assigned_to, heldSince: heldAt, heldHours: diffHours,
          reason: p.hold_reason || (holdRecord ? holdRecord.reason : 'Unspecified hold')
        });
      }

      if (areaStats[p.current_area]) {
        areaStats[p.current_area].total++;
        if (p.status === 'Waiting') areaStats[p.current_area].waiting++;
        if (p.status === 'In Progress') areaStats[p.current_area].inProgress++;
        if (p.status === 'Held') areaStats[p.current_area].held++;
        if (!areaStats[p.current_area].activeStages.includes(stageDef.name)) {
          areaStats[p.current_area].activeStages.push(stageDef.name);
        }
      }
    }

    const tractionStageCounts = TRACTION_WORKFLOW.map(stage => ({
      stageNumber: stage.stageNumber,
      stageName: stage.name,
      area: stage.area,
      count: allPanels.filter(p => p.type === 'Traction' && p.current_stage === stage.stageNumber && p.status !== 'Done').length
    }));

    const dcsStageCounts = DCS_WORKFLOW.map(stage => ({
      stageNumber: stage.stageNumber,
      stageName: stage.name,
      area: stage.area,
      count: allPanels.filter(p => p.type === 'DCS' && p.current_stage === stage.stageNumber && p.status !== 'Done').length
    }));

    return c.json({
      kpis: { totalPanels: allPanels.length, inProgressCount, waitingCount, heldCount, overdueCount, doneCount, tractionCount, dcsCount },
      areaStats,
      heldPanels,
      overduePanels,
      stageCounts: { traction: tractionStageCounts, dcs: dcsStageCounts },
      teamWorkloads,
      bottlenecks: bottleneckData
    });
  } catch (err) {
    return c.json({ error: 'Failed to retrieve overview statistics.' }, 500);
  }
});

// === PRODUCTION REPORTS ===
overviewReportRoutes.get('/reports/production', async (c) => {
  try {
    const db = c.env.DB;
    const today = new Date().toISOString().slice(0, 10);
    const endDate = c.req.query('endDate') || today;
    let startDate = c.req.query('startDate');
    if (!startDate) {
      const d = new Date();
      d.setDate(d.getDate() - 14);
      startDate = d.toISOString().slice(0, 10);
    }
    const { department, employee, panelType } = c.req.query();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return c.json({ error: 'Start Date and End Date must be in YYYY-MM-DD format.' }, 400);
    }
    if (startDate > endDate) {
      return c.json({ error: 'Start Date cannot be later than End Date.' }, 400);
    }

    let plannedQ = 'SELECT * FROM panels WHERE (start_date <= ? AND due_date >= ?)';
    const plannedP = [endDate, startDate];
    if (department) { plannedQ += ' AND current_area = ?'; plannedP.push(department); }
    if (panelType) { plannedQ += ' AND type = ?'; plannedP.push(panelType); }

    let compQ = `
      SELECT sh.id, sh.panel_id, sh.stage_number, sh.stage_name, sh.area,
             sh.assigned_to, sh.started_at, sh.completed_at,
             p.project, p.type, p.start_date, p.due_date, p.status as panel_status
      FROM stage_history sh JOIN panels p ON p.id = sh.panel_id
      WHERE sh.completed_at IS NOT NULL AND substr(sh.completed_at, 1, 10) >= ? AND substr(sh.completed_at, 1, 10) <= ?
    `;
    const compP = [startDate, endDate];
    if (department) { compQ += ' AND sh.area = ?'; compP.push(department); }
    if (employee) { compQ += ' AND sh.assigned_to = ?'; compP.push(employee); }
    if (panelType) { compQ += ' AND p.type = ?'; compP.push(panelType); }
    compQ += ' ORDER BY sh.completed_at ASC';

    let ipQ = `
      SELECT sh.id, sh.panel_id, sh.stage_number, sh.stage_name, sh.area,
             sh.assigned_to, sh.started_at, sh.completed_at,
             p.project, p.type, p.start_date, p.due_date, p.status as panel_status
      FROM stage_history sh JOIN panels p ON p.id = sh.panel_id
      WHERE sh.started_at IS NOT NULL AND (sh.completed_at IS NULL OR substr(sh.completed_at, 1, 10) > ?) AND substr(sh.started_at, 1, 10) <= ?
    `;
    const ipP = [endDate, endDate];
    if (department) { ipQ += ' AND sh.area = ?'; ipP.push(department); }
    if (employee) { ipQ += ' AND sh.assigned_to = ?'; ipP.push(employee); }
    if (panelType) { ipQ += ' AND p.type = ?'; ipP.push(panelType); }
    ipQ += ' ORDER BY sh.started_at ASC';

    const [{ results: plannedPanels }, { results: completedStages }, { results: inProgressStages }] = await Promise.all([
      db.prepare(plannedQ).bind(...plannedP).all(),
      db.prepare(compQ).bind(...compP).all(),
      db.prepare(ipQ).bind(...ipP).all()
    ]);

    const fullyCompletedPanels = completedStages.filter(s => {
      const isFinal = (s.type === 'Traction' && s.stage_number === 8) || (s.type === 'DCS' && s.stage_number === 6);
      return isFinal && s.panel_status === 'Done';
    });
    const overduePanels = plannedPanels.filter(p => p.status !== 'Done' && p.due_date < today);

    const employeeMap = new Map();
    for (const s of completedStages) {
      if (!s.assigned_to) continue;
      const key = `${s.assigned_to}_${s.area}`;
      if (!employeeMap.has(key)) {
        employeeMap.set(key, { employee: s.assigned_to, department: s.area, completedStagesCount: 0, panelsWorked: new Set(), stages: [] });
      }
      const rec = employeeMap.get(key);
      rec.completedStagesCount++;
      rec.panelsWorked.add(s.panel_id);
      rec.stages.push({ panelId: s.panel_id, stageName: s.stage_name, completedAt: s.completed_at });
    }

    const employeeSummary = Array.from(employeeMap.values()).map(r => ({
      employee: r.employee, department: r.department, completedStagesCount: r.completedStagesCount,
      uniquePanelsCount: r.panelsWorked.size, panelsWorked: Array.from(r.panelsWorked)
    })).sort((a, b) => b.completedStagesCount - a.completedStagesCount);

    const departmentMap = {
      KSM: { planned: 0, completedStages: 0, inProgress: 0 },
      PDR: { planned: 0, completedStages: 0, inProgress: 0 },
      CRM: { planned: 0, completedStages: 0, inProgress: 0 }
    };
    for (const p of plannedPanels) if (departmentMap[p.current_area]) departmentMap[p.current_area].planned++;
    for (const s of completedStages) if (departmentMap[s.area]) departmentMap[s.area].completedStages++;
    for (const s of inProgressStages) if (departmentMap[s.area]) departmentMap[s.area].inProgress++;

    const records = [
      ...completedStages.map(s => ({
        panelId: s.panel_id, project: s.project, projectName: s.project, type: s.type, panelType: s.type,
        stageNumber: s.stage_number, stageName: s.stage_name, department: s.area, assignedTo: s.assigned_to || 'Unassigned',
        startedAt: s.started_at, completedAt: s.completed_at, plannedStartDate: s.start_date, plannedDueDate: s.due_date,
        panelStatus: s.panel_status, stageStatus: 'Completed', status: 'Completed', isCompleted: true,
        isOverdue: s.due_date < today && s.panel_status !== 'Done'
      })),
      ...inProgressStages.map(s => ({
        panelId: s.panel_id, project: s.project, projectName: s.project, type: s.type, panelType: s.type,
        stageNumber: s.stage_number, stageName: s.stage_name, department: s.area, assignedTo: s.assigned_to || 'Unassigned',
        startedAt: s.started_at, completedAt: null, plannedStartDate: s.start_date, plannedDueDate: s.due_date,
        panelStatus: s.panel_status, stageStatus: 'In Progress', status: 'In Progress', isCompleted: false,
        isOverdue: s.due_date < today && s.panel_status !== 'Done'
      }))
    ];

    const employeeBreakdown = employeeSummary.map(r => ({
      employee: r.employee, department: r.department, completedStages: r.completedStagesCount,
      completedStagesCount: r.completedStagesCount, panelsInvolved: r.panelsWorked,
      panelsWorked: r.panelsWorked, uniquePanelsCount: r.uniquePanelsCount
    }));

    const summary = {
      totalPlannedPanels: plannedPanels.length,
      totalCompletedStages: completedStages.length,
      completedStagesCount: completedStages.length,
      fullyCompletedPanelsCount: fullyCompletedPanels.length,
      inProgressStagesCount: inProgressStages.length,
      overduePanelsCount: overduePanels.length
    };

    return c.json({
      reportingPeriod: { startDate, endDate },
      filters: { department: department || 'All', employee: employee || 'All', panelType: panelType || 'All' },
      summary, kpis: summary, records, employeeBreakdown, employeeSummary, departmentSummary: departmentMap,
      completedStages: records.filter(r => r.isCompleted),
      inProgressStages: records.filter(r => !r.isCompleted)
    });
  } catch (err) {
    return c.json({ error: err.message || 'Failed to generate production report.' }, 500);
  }
});

overviewReportRoutes.get('/reports/production/csv', async (c) => {
  try {
    const db = c.env.DB;
    const today = new Date().toISOString().slice(0, 10);
    const endDate = c.req.query('endDate') || today;
    let startDate = c.req.query('startDate');
    if (!startDate) {
      const d = new Date();
      d.setDate(d.getDate() - 14);
      startDate = d.toISOString().slice(0, 10);
    }
    const { department, employee, panelType } = c.req.query();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return c.json({ error: 'Start Date and End Date must be in YYYY-MM-DD format.' }, 400);
    }

    let compQ = `
      SELECT sh.id, sh.panel_id, sh.stage_number, sh.stage_name, sh.area,
             sh.assigned_to, sh.started_at, sh.completed_at,
             p.project, p.type, p.start_date, p.due_date, p.status as panel_status
      FROM stage_history sh JOIN panels p ON p.id = sh.panel_id
      WHERE sh.completed_at IS NOT NULL AND substr(sh.completed_at, 1, 10) >= ? AND substr(sh.completed_at, 1, 10) <= ?
    `;
    const compP = [startDate, endDate];
    if (department) { compQ += ' AND sh.area = ?'; compP.push(department); }
    if (employee) { compQ += ' AND sh.assigned_to = ?'; compP.push(employee); }
    if (panelType) { compQ += ' AND p.type = ?'; compP.push(panelType); }
    compQ += ' ORDER BY sh.completed_at ASC';

    let ipQ = `
      SELECT sh.id, sh.panel_id, sh.stage_number, sh.stage_name, sh.area,
             sh.assigned_to, sh.started_at, sh.completed_at,
             p.project, p.type, p.start_date, p.due_date, p.status as panel_status
      FROM stage_history sh JOIN panels p ON p.id = sh.panel_id
      WHERE sh.started_at IS NOT NULL AND (sh.completed_at IS NULL OR substr(sh.completed_at, 1, 10) > ?) AND substr(sh.started_at, 1, 10) <= ?
    `;
    const ipP = [endDate, endDate];
    if (department) { ipQ += ' AND sh.area = ?'; ipP.push(department); }
    if (employee) { ipQ += ' AND sh.assigned_to = ?'; ipP.push(employee); }
    if (panelType) { ipQ += ' AND p.type = ?'; ipP.push(panelType); }
    ipQ += ' ORDER BY sh.started_at ASC';

    const [{ results: completedStages }, { results: inProgressStages }] = await Promise.all([
      db.prepare(compQ).bind(...compP).all(),
      db.prepare(ipQ).bind(...ipP).all()
    ]);

    const csvLines = [
      'BHEL Traction & DCS Panel Assembly Management Portal — Actual Work Report',
      `Reporting Period: ${startDate} to ${endDate}`,
      `Generated On: ${new Date().toISOString()}`,
      `Filters Applied: Department=${department || 'All'}, Employee=${employee || 'All'}, PanelType=${panelType || 'All'}`,
      '',
      '--- DETAILED STAGE WORK ACTIVITY ---',
      ['Panel ID', 'Panel Name / Project', 'Panel Type', 'Stage #', 'Stage Name', 'Department / Area', 'Assigned Employee / Team', 'Stage Status', 'Started Timestamp', 'Completed Timestamp', 'Planned Start Date', 'Planned Due Date', 'Panel Current Status'].map(sanitizeCSVCell).join(',')
    ];

    for (const s of completedStages) {
      csvLines.push([
        s.panel_id, s.project, s.type, s.stage_number, s.stage_name, s.area,
        s.assigned_to || 'Unassigned', 'Completed',
        s.started_at ? s.started_at.slice(0, 19).replace('T', ' ') : '',
        s.completed_at ? s.completed_at.slice(0, 19).replace('T', ' ') : '',
        s.start_date || '', s.due_date || '', s.panel_status
      ].map(sanitizeCSVCell).join(','));
    }

    for (const s of inProgressStages) {
      csvLines.push([
        s.panel_id, s.project, s.type, s.stage_number, s.stage_name, s.area,
        s.assigned_to || 'Unassigned', 'In Progress',
        s.started_at ? s.started_at.slice(0, 19).replace('T', ' ') : '',
        'In Progress', s.start_date || '', s.due_date || '', s.panel_status
      ].map(sanitizeCSVCell).join(','));
    }

    csvLines.push('', '--- EMPLOYEE WORK OUTPUT SUMMARY ---', ['Employee / Team Name', 'Department', 'Stages Completed In Period', 'Distinct Panels Worked On'].map(sanitizeCSVCell).join(','));
    const employeeMap = new Map();
    for (const s of completedStages) {
      if (!s.assigned_to) continue;
      const key = `${s.assigned_to}_${s.area}`;
      if (!employeeMap.has(key)) employeeMap.set(key, { employee: s.assigned_to, dept: s.area, count: 0, panels: new Set() });
      const e = employeeMap.get(key);
      e.count++;
      e.panels.add(s.panel_id);
    }
    for (const e of Array.from(employeeMap.values()).sort((a, b) => b.count - a.count)) {
      csvLines.push([e.employee, e.dept, e.count, e.panels.size].map(sanitizeCSVCell).join(','));
    }

    return new Response(csvLines.join('\r\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="bhel_actual_work_report_${startDate}_to_${endDate}.csv"`
      }
    });
  } catch (err) {
    return c.json({ error: err.message || 'Failed to generate CSV export.' }, 500);
  }
});

