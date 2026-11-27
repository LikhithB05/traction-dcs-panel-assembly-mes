import { getDatabase } from '../db/database.js';

function sanitizeCSVCell(val) {
  if (val === null || val === undefined) return '""';
  let str = String(val);
  // Formula injection defense: prepend single quote if cell starts with dangerous char
  if (/^[\=\+\-\@\t\r]/.test(str)) {
    str = "'" + str;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

export class ReportController {
  static getProductionReport(req, res) {
    try {
      const db = getDatabase();
      const today = new Date().toISOString().slice(0, 10);

      // Default to last 14 days if range not specified
      const endDate = req.query.endDate || today;
      let startDate = req.query.startDate;
      if (!startDate) {
        const d = new Date();
        d.setDate(d.getDate() - 14);
        startDate = d.toISOString().slice(0, 10);
      }

      const { department, employee, panelType } = req.query;

      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        return res.status(400).json({ error: 'Start Date and End Date must be in YYYY-MM-DD format.' });
      }

      if (startDate > endDate) {
        return res.status(400).json({ error: 'Start Date cannot be later than End Date.' });
      }

      // 1. Planned Panels overlapping the period
      let plannedPanelsQuery = `
        SELECT * FROM panels
        WHERE (start_date <= ? AND due_date >= ?)
      `;
      const plannedParams = [endDate, startDate];
      if (department) {
        plannedPanelsQuery += ` AND current_area = ?`;
        plannedParams.push(department);
      }
      if (panelType) {
        plannedPanelsQuery += ` AND type = ?`;
        plannedParams.push(panelType);
      }
      const plannedPanels = db.prepare(plannedPanelsQuery).all(...plannedParams);

      // 2. Stage completions in the window
      let completedStagesQuery = `
        SELECT sh.id, sh.panel_id, sh.stage_number, sh.stage_name, sh.area,
               sh.assigned_to, sh.started_at, sh.completed_at,
               p.project, p.type, p.start_date, p.due_date, p.status as panel_status
        FROM stage_history sh
        JOIN panels p ON p.id = sh.panel_id
        WHERE sh.completed_at IS NOT NULL
          AND substr(sh.completed_at, 1, 10) >= ?
          AND substr(sh.completed_at, 1, 10) <= ?
      `;
      const completedParams = [startDate, endDate];
      if (department) {
        completedStagesQuery += ` AND sh.area = ?`;
        completedParams.push(department);
      }
      if (employee) {
        completedStagesQuery += ` AND sh.assigned_to = ?`;
        completedParams.push(employee);
      }
      if (panelType) {
        completedStagesQuery += ` AND p.type = ?`;
        completedParams.push(panelType);
      }
      completedStagesQuery += ` ORDER BY sh.completed_at ASC`;
      const completedStages = db.prepare(completedStagesQuery).all(...completedParams);

      // 3. In-Progress Stages active during window
      let inProgressStagesQuery = `
        SELECT sh.id, sh.panel_id, sh.stage_number, sh.stage_name, sh.area,
               sh.assigned_to, sh.started_at, sh.completed_at,
               p.project, p.type, p.start_date, p.due_date, p.status as panel_status
        FROM stage_history sh
        JOIN panels p ON p.id = sh.panel_id
        WHERE sh.started_at IS NOT NULL
          AND (sh.completed_at IS NULL OR substr(sh.completed_at, 1, 10) > ?)
          AND substr(sh.started_at, 1, 10) <= ?
      `;
      const inProgressParams = [endDate, endDate];
      if (department) {
        inProgressStagesQuery += ` AND sh.area = ?`;
        inProgressParams.push(department);
      }
      if (employee) {
        inProgressStagesQuery += ` AND sh.assigned_to = ?`;
        inProgressParams.push(employee);
      }
      if (panelType) {
        inProgressStagesQuery += ` AND p.type = ?`;
        inProgressParams.push(panelType);
      }
      inProgressStagesQuery += ` ORDER BY sh.started_at ASC`;
      const inProgressStages = db.prepare(inProgressStagesQuery).all(...inProgressParams);

      // 4. Fully completed panels in window (final stage completed within date range)
      const fullyCompletedPanels = completedStages.filter(s => {
        const isFinal = (s.type === 'Traction' && s.stage_number === 8) || (s.type === 'DCS' && s.stage_number === 6);
        return isFinal && s.panel_status === 'Done';
      });

      // 5. Overdue panels in window
      const overduePanels = plannedPanels.filter(p => p.status !== 'Done' && p.due_date < today);

      // 6. Employee aggregated output
      const employeeMap = new Map();
      for (const s of completedStages) {
        if (!s.assigned_to) continue;
        const key = `${s.assigned_to}_${s.area}`;
        if (!employeeMap.has(key)) {
          employeeMap.set(key, {
            employee: s.assigned_to,
            department: s.area,
            completedStagesCount: 0,
            panelsWorked: new Set(),
            stages: []
          });
        }
        const record = employeeMap.get(key);
        record.completedStagesCount++;
        record.panelsWorked.add(s.panel_id);
        record.stages.push({
          panelId: s.panel_id,
          stageName: s.stage_name,
          completedAt: s.completed_at
        });
      }

      const employeeSummary = Array.from(employeeMap.values()).map(r => ({
        employee: r.employee,
        department: r.department,
        completedStagesCount: r.completedStagesCount,
        uniquePanelsCount: r.panelsWorked.size,
        panelsWorked: Array.from(r.panelsWorked)
      })).sort((a, b) => b.completedStagesCount - a.completedStagesCount);

      // 7. Department aggregated summary
      const departmentMap = {
        KSM: { planned: 0, completedStages: 0, inProgress: 0 },
        PDR: { planned: 0, completedStages: 0, inProgress: 0 },
        CRM: { planned: 0, completedStages: 0, inProgress: 0 }
      };

      for (const p of plannedPanels) {
        if (departmentMap[p.current_area]) departmentMap[p.current_area].planned++;
      }
      for (const s of completedStages) {
        if (departmentMap[s.area]) departmentMap[s.area].completedStages++;
      }
      for (const s of inProgressStages) {
        if (departmentMap[s.area]) departmentMap[s.area].inProgress++;
      }

      const records = [
        ...completedStages.map(s => ({
          panelId: s.panel_id,
          project: s.project,
          projectName: s.project,
          type: s.type,
          panelType: s.type,
          stageNumber: s.stage_number,
          stageName: s.stage_name,
          department: s.area,
          assignedTo: s.assigned_to || 'Unassigned',
          startedAt: s.started_at,
          completedAt: s.completed_at,
          plannedStartDate: s.start_date,
          plannedDueDate: s.due_date,
          panelStatus: s.panel_status,
          stageStatus: 'Completed',
          status: 'Completed',
          isCompleted: true,
          isOverdue: s.due_date < today && s.panel_status !== 'Done'
        })),
        ...inProgressStages.map(s => ({
          panelId: s.panel_id,
          project: s.project,
          projectName: s.project,
          type: s.type,
          panelType: s.type,
          stageNumber: s.stage_number,
          stageName: s.stage_name,
          department: s.area,
          assignedTo: s.assigned_to || 'Unassigned',
          startedAt: s.started_at,
          completedAt: null,
          plannedStartDate: s.start_date,
          plannedDueDate: s.due_date,
          panelStatus: s.panel_status,
          stageStatus: 'In Progress',
          status: 'In Progress',
          isCompleted: false,
          isOverdue: s.due_date < today && s.panel_status !== 'Done'
        }))
      ];

      const employeeBreakdown = employeeSummary.map(r => ({
        employee: r.employee,
        department: r.department,
        completedStages: r.completedStagesCount,
        completedStagesCount: r.completedStagesCount,
        panelsInvolved: r.panelsWorked,
        panelsWorked: r.panelsWorked,
        uniquePanelsCount: r.uniquePanelsCount
      }));

      const summary = {
        totalPlannedPanels: plannedPanels.length,
        totalCompletedStages: completedStages.length,
        completedStagesCount: completedStages.length,
        fullyCompletedPanelsCount: fullyCompletedPanels.length,
        inProgressStagesCount: inProgressStages.length,
        overduePanelsCount: overduePanels.length
      };

      return res.json({
        reportingPeriod: {
          startDate,
          endDate
        },
        filters: {
          department: department || 'All',
          employee: employee || 'All',
          panelType: panelType || 'All'
        },
        summary,
        kpis: summary,
        records,
        employeeBreakdown,
        employeeSummary,
        departmentSummary: departmentMap,
        completedStages: records.filter(r => r.isCompleted),
        inProgressStages: records.filter(r => !r.isCompleted)
      });
    } catch (error) {
      console.error('Error generating production report:', error);
      return res.status(500).json({ error: error.message || 'Failed to generate production report.' });
    }
  }

  static exportProductionReportCSV(req, res) {
    try {
      const db = getDatabase();
      const today = new Date().toISOString().slice(0, 10);

      const endDate = req.query.endDate || today;
      let startDate = req.query.startDate;
      if (!startDate) {
        const d = new Date();
        d.setDate(d.getDate() - 14);
        startDate = d.toISOString().slice(0, 10);
      }

      const { department, employee, panelType } = req.query;

      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        return res.status(400).json({ error: 'Start Date and End Date must be in YYYY-MM-DD format.' });
      }

      // Query stage completions in window
      let completedStagesQuery = `
        SELECT sh.id, sh.panel_id, sh.stage_number, sh.stage_name, sh.area,
               sh.assigned_to, sh.started_at, sh.completed_at,
               p.project, p.type, p.start_date, p.due_date, p.status as panel_status
        FROM stage_history sh
        JOIN panels p ON p.id = sh.panel_id
        WHERE sh.completed_at IS NOT NULL
          AND substr(sh.completed_at, 1, 10) >= ?
          AND substr(sh.completed_at, 1, 10) <= ?
      `;
      const completedParams = [startDate, endDate];
      if (department) {
        completedStagesQuery += ` AND sh.area = ?`;
        completedParams.push(department);
      }
      if (employee) {
        completedStagesQuery += ` AND sh.assigned_to = ?`;
        completedParams.push(employee);
      }
      if (panelType) {
        completedStagesQuery += ` AND p.type = ?`;
        completedParams.push(panelType);
      }
      completedStagesQuery += ` ORDER BY sh.completed_at ASC`;
      const completedStages = db.prepare(completedStagesQuery).all(...completedParams);

      // Query in-progress stages in window
      let inProgressStagesQuery = `
        SELECT sh.id, sh.panel_id, sh.stage_number, sh.stage_name, sh.area,
               sh.assigned_to, sh.started_at, sh.completed_at,
               p.project, p.type, p.start_date, p.due_date, p.status as panel_status
        FROM stage_history sh
        JOIN panels p ON p.id = sh.panel_id
        WHERE sh.started_at IS NOT NULL
          AND (sh.completed_at IS NULL OR substr(sh.completed_at, 1, 10) > ?)
          AND substr(sh.started_at, 1, 10) <= ?
      `;
      const inProgressParams = [endDate, endDate];
      if (department) {
        inProgressStagesQuery += ` AND sh.area = ?`;
        inProgressParams.push(department);
      }
      if (employee) {
        inProgressStagesQuery += ` AND sh.assigned_to = ?`;
        inProgressParams.push(employee);
      }
      if (panelType) {
        inProgressStagesQuery += ` AND p.type = ?`;
        inProgressParams.push(panelType);
      }
      inProgressStagesQuery += ` ORDER BY sh.started_at ASC`;
      const inProgressStages = db.prepare(inProgressStagesQuery).all(...inProgressParams);

      const csvLines = [];

      // Metadata Header Block
      csvLines.push('BHEL Traction & DCS Panel Assembly Management Portal — Actual Work Report');
      csvLines.push(`Reporting Period: ${startDate} to ${endDate}`);
      csvLines.push(`Generated On: ${new Date().toISOString()}`);
      csvLines.push(`Filters Applied: Department=${department || 'All'}, Employee=${employee || 'All'}, PanelType=${panelType || 'All'}`);
      csvLines.push('');

      // Section 1: Detailed Stage Activity Log
      csvLines.push('--- DETAILED STAGE WORK ACTIVITY ---');
      const headers = [
        'Panel ID', 'Panel Name / Project', 'Panel Type', 'Stage #', 'Stage Name',
        'Department / Area', 'Assigned Employee / Team', 'Stage Status', 'Started Timestamp',
        'Completed Timestamp', 'Planned Start Date', 'Planned Due Date', 'Panel Current Status'
      ];
      csvLines.push(headers.map(sanitizeCSVCell).join(','));

      for (const s of completedStages) {
        const row = [
          s.panel_id,
          s.project,
          s.type,
          s.stage_number,
          s.stage_name,
          s.area,
          s.assigned_to || 'Unassigned',
          'Completed',
          s.started_at ? s.started_at.slice(0, 19).replace('T', ' ') : '',
          s.completed_at ? s.completed_at.slice(0, 19).replace('T', ' ') : '',
          s.start_date || '',
          s.due_date || '',
          s.panel_status
        ];
        csvLines.push(row.map(sanitizeCSVCell).join(','));
      }

      for (const s of inProgressStages) {
        const row = [
          s.panel_id,
          s.project,
          s.type,
          s.stage_number,
          s.stage_name,
          s.area,
          s.assigned_to || 'Unassigned',
          'In Progress',
          s.started_at ? s.started_at.slice(0, 19).replace('T', ' ') : '',
          'In Progress',
          s.start_date || '',
          s.due_date || '',
          s.panel_status
        ];
        csvLines.push(row.map(sanitizeCSVCell).join(','));
      }

      csvLines.push('');

      // Section 2: Employee Summary
      csvLines.push('--- EMPLOYEE WORK OUTPUT SUMMARY ---');
      const empHeaders = ['Employee / Team Name', 'Department', 'Stages Completed In Period', 'Distinct Panels Worked On'];
      csvLines.push(empHeaders.map(sanitizeCSVCell).join(','));

      const employeeMap = new Map();
      for (const s of completedStages) {
        if (!s.assigned_to) continue;
        const key = `${s.assigned_to}_${s.area}`;
        if (!employeeMap.has(key)) {
          employeeMap.set(key, { employee: s.assigned_to, dept: s.area, count: 0, panels: new Set() });
        }
        const e = employeeMap.get(key);
        e.count++;
        e.panels.add(s.panel_id);
      }

      for (const e of Array.from(employeeMap.values()).sort((a, b) => b.count - a.count)) {
        const empRow = [e.employee, e.dept, e.count, e.panels.size];
        csvLines.push(empRow.map(sanitizeCSVCell).join(','));
      }

      const csvContent = csvLines.join('\r\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="bhel_actual_work_report_${startDate}_to_${endDate}.csv"`);
      return res.send(csvContent);
    } catch (error) {
      console.error('Error generating CSV report:', error);
      return res.status(500).json({ error: error.message || 'Failed to generate CSV export.' });
    }
  }
}
