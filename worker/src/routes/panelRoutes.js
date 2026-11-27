import { Hono } from 'hono';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { WorkflowEngine } from '../services/workflowEngine.js';
import { CapacityService } from '../services/capacityService.js';

export const panelRoutes = new Hono();
panelRoutes.use('*', authenticateToken);

panelRoutes.get('/', async (c) => {
  try {
    const db = c.env.DB;
    const { type, area, status, search } = c.req.query();

    let query = 'SELECT * FROM panels WHERE 1=1';
    const params = [];
    if (type) { query += ' AND type = ?'; params.push(type); }
    if (area) { query += ' AND current_area = ?'; params.push(area); }
    if (status) { query += ' AND status = ?'; params.push(status); }
    if (search) { query += ' AND (id LIKE ? OR project LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    query += ' ORDER BY created_at DESC';

    const { results: panels } = await db.prepare(query).bind(...params).all();
    // Fetch active/latest stage start dates in one batch query to minimize D1 subrequests
    const { results: stageStarts } = await db.prepare(`
      SELECT panel_id, stage_number, started_at, created_at
      FROM stage_history
      ORDER BY created_at DESC
    `).all();

    const stageMap = new Map();
    for (const s of stageStarts) {
      const k = `${s.panel_id}_${s.stage_number}`;
      if (!stageMap.has(k)) stageMap.set(k, s);
    }

    const today = new Date().toISOString().slice(0, 10);
    const enriched = panels.map(p => {
      const lastStage = stageMap.get(`${p.id}_${p.current_stage}`);
      const refDate = (lastStage && lastStage.started_at) || (lastStage && lastStage.created_at) || p.created_at;
      const diffMs = Date.now() - new Date(refDate).getTime();
      const daysInStage = Math.max(0, Math.floor(diffMs / 86400000));
      const isOverdue = p.status !== 'Done' && p.due_date < today;
      const daysOverdue = isOverdue ? Math.floor((new Date(today).getTime() - new Date(p.due_date).getTime()) / 86400000) : 0;
      const stageDef = WorkflowEngine.getStageDefinition(p.type, p.current_stage);

      return {
        ...p,
        startDate: p.start_date || (p.created_at ? p.created_at.slice(0, 10) : ''),
        stageName: stageDef.name,
        daysInStage,
        isOverdue,
        daysOverdue
      };
    });

    return c.json(enriched);
  } catch (err) {
    console.error('Error fetching panels:', err.message);
    return c.json({ error: 'Failed to retrieve panels.' }, 500);
  }
});

panelRoutes.get('/:id', async (c) => {
  try {
    const db = c.env.DB;
    const id = c.req.param('id');
    const panel = await db.prepare('SELECT * FROM panels WHERE id = ?').bind(id).first();
    if (!panel) return c.json({ error: `Panel with ID '${id}' not found.` }, 404);

    const [{ results: stageHistory }, { results: holdHistory }] = await Promise.all([
      db.prepare('SELECT * FROM stage_history WHERE panel_id = ? ORDER BY stage_number ASC, created_at ASC').bind(id).all(),
      db.prepare('SELECT * FROM hold_history WHERE panel_id = ? ORDER BY held_at ASC').bind(id).all()
    ]);

    const stageDef = WorkflowEngine.getStageDefinition(panel.type, panel.current_stage);
    return c.json({ ...panel, stageName: stageDef.name, stageHistory, holdHistory });
  } catch (err) {
    return c.json({ error: 'Failed to retrieve panel details.' }, 500);
  }
});

panelRoutes.post('/', async (c) => {
  try {
    const db = c.env.DB;
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));
    const { id, type, project, priority, startDate, dueDate } = body;

    if (!WorkflowEngine.canUserOperatePanel(user, { current_area: 'KSM' }, 'KSM')) {
      return c.json({ error: 'Only KSM or Master Administrators can register new panels.' }, 403);
    }
    if (!id || !type || !project || !priority || !dueDate) {
      return c.json({ error: 'All fields (ID, Type, Project, Priority, Due Date) are required.' }, 400);
    }

    const cleanId = id.trim().toUpperCase();
    const existing = await db.prepare('SELECT id FROM panels WHERE id = ?').bind(cleanId).first();
    if (existing) return c.json({ error: `A panel with ID '${cleanId}' already exists.` }, 409);

    const now = new Date().toISOString();
    const planStartDate = startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : now.slice(0, 10);
    if (startDate && dueDate && planStartDate > dueDate) {
      return c.json({ error: 'Planned Start Date cannot be later than Planned Due Date.' }, 400);
    }

    const firstStage = WorkflowEngine.getStageDefinition(type, 1);
    await db.batch([
      db.prepare(`
        INSERT INTO panels (id, type, project, priority, start_date, due_date, current_stage, current_area, status, assigned_to, hold_reason, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(cleanId, type, project.trim(), priority, planStartDate, dueDate, 1, firstStage.area, 'Waiting', null, null, now, now),
      db.prepare(`
        INSERT INTO stage_history (id, panel_id, stage_number, stage_name, area, assigned_to, started_at, completed_at, hold_reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind('sh_' + crypto.randomUUID(), cleanId, 1, firstStage.name, firstStage.area, null, null, null, null, now),
      db.prepare(`
        INSERT INTO audit_logs (id, timestamp, user_id, username, action, entity_type, entity_id, details)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind('log_' + crypto.randomUUID(), now, user.id, user.username, 'CREATE_PANEL', 'PANEL', cleanId, `Panel ${cleanId} registered for ${project}`)
    ]);

    return c.json({ message: 'Panel successfully registered.', panelId: cleanId }, 201);
  } catch (err) {
    return c.json({ error: err.message || 'Failed to create panel.' }, 500);
  }
});

panelRoutes.post('/bulk-import', async (c) => {
  try {
    const db = c.env.DB;
    const user = c.get('user');
    const { panels } = await c.req.json().catch(() => ({}));

    if (!user || (!user.isAdmin && user.role !== 'AKR' && user.role !== 'CKG' && user.role !== 'KSM')) {
      return c.json({ error: 'Permission denied. Only KSM or Administrators can import panel plans.' }, 403);
    }
    if (!Array.isArray(panels) || panels.length === 0) {
      return c.json({ error: 'Import payload must contain a non-empty array of panels.' }, 400);
    }

    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const errors = [];
    const validPanels = [];
    const seenIds = new Set();

    const { results: existingRows } = await db.prepare('SELECT id FROM panels').all();
    const existingSet = new Set(existingRows.map(r => r.id));

    for (let i = 0; i < panels.length; i++) {
      const row = panels[i];
      const rowNum = i + 1;
      const id = (row.id || row.panelId || '').toString().trim().toUpperCase();
      const type = (row.type || row.panelType || '').toString().trim();
      const project = (row.project || row.projectName || row.name || '').toString().trim();
      const priority = (row.priority || 'Medium').toString().trim();
      const startDate = (row.startDate || row.start_date || today).toString().trim();
      const dueDate = (row.dueDate || row.due_date || '').toString().trim();

      if (!id) { errors.push({ row: rowNum, error: 'Panel ID is required.' }); continue; }
      if (seenIds.has(id)) { errors.push({ row: rowNum, panelId: id, error: `Duplicate Panel ID '${id}' in import file.` }); continue; }
      seenIds.add(id);
      if (!['Traction', 'DCS'].includes(type)) { errors.push({ row: rowNum, panelId: id, error: `Invalid type '${type}'.` }); continue; }
      if (!project) { errors.push({ row: rowNum, panelId: id, error: 'Project / Panel name is required.' }); continue; }
      if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) { errors.push({ row: rowNum, panelId: id, error: `Due Date '${dueDate}' invalid (YYYY-MM-DD).` }); continue; }
      if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) { errors.push({ row: rowNum, panelId: id, error: `Start Date '${startDate}' invalid.` }); continue; }
      if (startDate && dueDate && startDate > dueDate) { errors.push({ row: rowNum, panelId: id, error: `Start Date (${startDate}) > Due Date (${dueDate}).` }); continue; }
      if (existingSet.has(id)) { errors.push({ row: rowNum, panelId: id, error: `Panel '${id}' already exists in database.` }); continue; }

      validPanels.push({
        id,
        type,
        project,
        priority: ['High', 'Medium', 'Low'].includes(priority) ? priority : 'Medium',
        startDate: startDate || today,
        dueDate
      });
    }

    if (errors.length > 0) {
      return c.json({
        error: `Import rejected: ${errors.length} row(s) failed validation.`,
        totalRows: panels.length,
        createdCount: 0,
        failedCount: errors.length,
        errors
      }, 400);
    }

    const stmts = [];
    for (const p of validPanels) {
      const firstStage = WorkflowEngine.getStageDefinition(p.type, 1);
      stmts.push(
        db.prepare(`
          INSERT INTO panels (id, type, project, priority, start_date, due_date, current_stage, current_area, status, assigned_to, hold_reason, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(p.id, p.type, p.project, p.priority, p.startDate, p.dueDate, 1, firstStage.area, 'Waiting', null, null, now, now),
        db.prepare(`
          INSERT INTO stage_history (id, panel_id, stage_number, stage_name, area, assigned_to, started_at, completed_at, hold_reason, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind('sh_' + crypto.randomUUID(), p.id, 1, firstStage.name, firstStage.area, null, null, null, null, now)
      );
    }
    stmts.push(
      db.prepare(`
        INSERT INTO audit_logs (id, timestamp, user_id, username, action, entity_type, entity_id, details)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind('log_' + crypto.randomUUID(), now, user.id, user.username, 'BULK_IMPORT_PANELS', 'PANEL', null, `Bulk imported ${validPanels.length} panels`)
    );
    await db.batch(stmts);

    return c.json({
      message: `Successfully imported ${validPanels.length} panel(s).`,
      totalRows: panels.length,
      createdCount: validPanels.length,
      failedCount: 0,
      errors: []
    }, 201);
  } catch (err) {
    return c.json({ error: err.message || 'Bulk import failed.' }, 500);
  }
});

panelRoutes.patch('/:id/admin-edit', requireAdmin, async (c) => {
  try {
    const db = c.env.DB;
    const user = c.get('user');
    const id = c.req.param('id');
    const { project, startDate, dueDate } = await c.req.json().catch(() => ({}));

    const panel = await db.prepare('SELECT * FROM panels WHERE id = ?').bind(id).first();
    if (!panel) return c.json({ error: `Panel '${id}' not found.` }, 404);

    const updatedProject = project !== undefined ? String(project).trim() : panel.project;
    if (!updatedProject) return c.json({ error: 'Panel project / name cannot be blank.' }, 400);

    const updatedStartDate = startDate !== undefined ? String(startDate).trim() : (panel.start_date || panel.created_at.slice(0, 10));
    const updatedDueDate = dueDate !== undefined ? String(dueDate).trim() : panel.due_date;

    if (updatedStartDate && !/^\d{4}-\d{2}-\d{2}$/.test(updatedStartDate)) {
      return c.json({ error: 'Planned Start Date must be in YYYY-MM-DD format.' }, 400);
    }
    if (!updatedDueDate || !/^\d{4}-\d{2}-\d{2}$/.test(updatedDueDate)) {
      return c.json({ error: 'Planned Due Date must be in YYYY-MM-DD format.' }, 400);
    }
    if (updatedStartDate && updatedDueDate && updatedStartDate > updatedDueDate) {
      return c.json({ error: `Planned Start Date (${updatedStartDate}) cannot be later than Planned Due Date (${updatedDueDate}).` }, 400);
    }

    const now = new Date().toISOString();
    await db.batch([
      db.prepare('UPDATE panels SET project = ?, start_date = ?, due_date = ?, updated_at = ? WHERE id = ?')
        .bind(updatedProject, updatedStartDate, updatedDueDate, now, id),
      db.prepare('INSERT INTO audit_logs (id, timestamp, user_id, username, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind('log_' + crypto.randomUUID(), now, user.id, user.username, 'ADMIN_EDIT_PANEL', 'PANEL', id, `Admin edited panel ${id}`)
    ]);

    return c.json({
      message: `Panel ${id} successfully updated by Administrator.`,
      panel: { ...panel, project: updatedProject, start_date: updatedStartDate, due_date: updatedDueDate, updated_at: now }
    });
  } catch (err) {
    return c.json({ error: err.message || 'Failed to update panel.' }, 500);
  }
});

panelRoutes.post('/:id/start', async (c) => {
  try {
    const db = c.env.DB;
    const user = c.get('user');
    const id = c.req.param('id');
    const { assignedTo, confirmedOverload, customManpower } = await c.req.json().catch(() => ({}));

    const panel = await db.prepare('SELECT * FROM panels WHERE id = ?').bind(id).first();
    if (!panel) return c.json({ error: `Panel '${id}' not found.` }, 404);
    if (panel.status !== 'Waiting') {
      return c.json({ error: `Cannot Start panel in '${panel.status}' status. Panel must be 'Waiting'.` }, 400);
    }
    if (!WorkflowEngine.canUserOperatePanel(user, panel)) {
      return c.json({ error: `Permission denied. Only area '${panel.current_area}' or Admins can start this stage.` }, 403);
    }

    if (customManpower && customManpower.name && customManpower.area && customManpower.type) {
      const cleanCustomName = customManpower.name.trim();
      const existingCustom = await db.prepare('SELECT id FROM custom_manpower WHERE area = ? AND type = ? AND name = ?')
        .bind(customManpower.area, customManpower.type, cleanCustomName).first();
      if (!existingCustom) {
        const nowCustom = new Date().toISOString();
        await db.prepare(`
          INSERT INTO custom_manpower (id, area, type, name, members, is_active, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
        `).bind(
          'cm_' + crypto.randomUUID(),
          customManpower.area,
          customManpower.type,
          cleanCustomName,
          customManpower.members ? customManpower.members.trim() : null,
          user.username,
          nowCustom,
          nowCustom
        ).run();
      }
    }

    await WorkflowEngine.validateWorkerEligibility(db, panel, panel.current_stage, assignedTo, user);

    const currentMonth = new Date().toISOString().slice(0, 7);
    const workload = await CapacityService.calculateActualWorkload(db, assignedTo, currentMonth);
    if (workload.actualLoad !== null && workload.actualLoad >= 100 && !confirmedOverload) {
      return c.json({
        requiresConfirmation: true,
        message: `Warning: Assigning this panel will push ${assignedTo} above 100% capacity (currently at ${workload.actualLoad}%). Do you want to proceed?`,
        currentLoad: workload.actualLoad
      }, 409);
    }

    const now = new Date().toISOString();
    const stageDef = WorkflowEngine.getStageDefinition(panel.type, panel.current_stage);
    const owningArea = await WorkflowEngine.getOwningAreaForStage(stageDef, assignedTo, db);

    const activeStage = await db.prepare(`
      SELECT id FROM stage_history
      WHERE panel_id = ? AND stage_number = ? AND completed_at IS NULL
      ORDER BY created_at DESC LIMIT 1
    `).bind(id, panel.current_stage).first();

    const stmts = [
      db.prepare('UPDATE panels SET status = ?, assigned_to = ?, current_area = ?, updated_at = ? WHERE id = ?')
        .bind('In Progress', assignedTo, owningArea, now, id),
      db.prepare('INSERT INTO audit_logs (id, timestamp, user_id, username, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind('log_' + crypto.randomUUID(), now, user.id, user.username, 'START_STAGE', 'PANEL', id, `Started stage ${stageDef.name} assigned to ${assignedTo}`)
    ];
    if (activeStage) {
      stmts.push(
        db.prepare('UPDATE stage_history SET assigned_to = ?, area = ?, started_at = ? WHERE id = ?')
          .bind(assignedTo, owningArea, now, activeStage.id)
      );
    }
    await db.batch(stmts);

    return c.json({ message: `Stage ${stageDef.name} started successfully.` });
  } catch (err) {
    return c.json({ error: err.message || 'Failed to start stage.' }, 400);
  }
});

panelRoutes.post('/:id/complete', async (c) => {
  try {
    const db = c.env.DB;
    const user = c.get('user');
    const id = c.req.param('id');

    const panel = await db.prepare('SELECT * FROM panels WHERE id = ?').bind(id).first();
    if (!panel) return c.json({ error: `Panel '${id}' not found.` }, 404);
    if (panel.status !== 'In Progress') {
      return c.json({ error: `Cannot Complete panel in '${panel.status}' status. Panel must be 'In Progress'.` }, 400);
    }
    if (!WorkflowEngine.canUserOperatePanel(user, panel)) {
      return c.json({ error: `Permission denied. Only area '${panel.current_area}' or Admins can complete this stage.` }, 403);
    }

    const now = new Date().toISOString();
    const currentStageDef = WorkflowEngine.getStageDefinition(panel.type, panel.current_stage);
    const isFinal = WorkflowEngine.isFinalStage(panel.type, panel.current_stage);
    const nextStage = !isFinal ? WorkflowEngine.getNextStage(panel.type, panel.current_stage) : null;

    const activeStage = await db.prepare(`
      SELECT id FROM stage_history
      WHERE panel_id = ? AND stage_number = ? AND completed_at IS NULL
      ORDER BY created_at DESC LIMIT 1
    `).bind(id, panel.current_stage).first();

    const stmts = [];
    if (activeStage) {
      stmts.push(db.prepare('UPDATE stage_history SET completed_at = ? WHERE id = ?').bind(now, activeStage.id));
    }

    if (isFinal) {
      stmts.push(
        db.prepare("UPDATE panels SET status = 'Done', updated_at = ? WHERE id = ?").bind(now, id),
        db.prepare('INSERT INTO audit_logs (id, timestamp, user_id, username, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .bind('log_' + crypto.randomUUID(), now, user.id, user.username, 'COMPLETE_PANEL', 'PANEL', id, 'Panel finished Despatch and marked Done')
      );
    } else {
      stmts.push(
        db.prepare("UPDATE panels SET current_stage = ?, current_area = ?, status = 'Waiting', assigned_to = NULL, updated_at = ? WHERE id = ?")
          .bind(nextStage.stageNumber, nextStage.area, now, id),
        db.prepare('INSERT INTO stage_history (id, panel_id, stage_number, stage_name, area, assigned_to, started_at, completed_at, hold_reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind('sh_' + crypto.randomUUID(), id, nextStage.stageNumber, nextStage.name, nextStage.area, null, null, null, null, now),
        db.prepare('INSERT INTO audit_logs (id, timestamp, user_id, username, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .bind('log_' + crypto.randomUUID(), now, user.id, user.username, 'ADVANCE_STAGE', 'PANEL', id, `Completed ${currentStageDef.name}, advanced to ${nextStage.name} (${nextStage.area})`)
      );
    }
    await db.batch(stmts);

    return c.json({
      message: isFinal
        ? `Panel ${id} successfully finished and marked Done.`
        : `Stage completed. Panel advanced to ${nextStage.name} (${nextStage.area}).`
    });
  } catch (err) {
    return c.json({ error: err.message || 'Failed to complete stage.' }, 500);
  }
});

panelRoutes.post('/:id/undo', requireAdmin, async (c) => {
  try {
    const db = c.env.DB;
    const user = c.get('user');
    const id = c.req.param('id');
    const { reason } = await c.req.json().catch(() => ({}));

    const panel = await db.prepare('SELECT * FROM panels WHERE id = ?').bind(id).first();
    if (!panel) return c.json({ error: `Panel '${id}' not found.` }, 404);

    const reversibility = await WorkflowEngine.getReversibleCompletion(db, panel);
    if (!reversibility.eligible) {
      return c.json({ error: reversibility.reason }, 400);
    }

    const now = new Date().toISOString();
    const cleanReason = (reason && typeof reason === 'string' && reason.trim()) ? reason.trim() : 'Operational correction (mistaken completion)';
    const { targetStageDef, stageHistoryRecord: reversedRecord, reversedStageNumber, reversedStageName, targetStageNumber } = reversibility;

    await db.batch([
      db.prepare('UPDATE stage_history SET undone_at = ?, undone_by = ?, undo_reason = ? WHERE id = ?')
        .bind(now, user.username, cleanReason, reversedRecord.id),
      db.prepare('DELETE FROM stage_history WHERE panel_id = ? AND stage_number > ? AND started_at IS NULL AND completed_at IS NULL')
        .bind(id, targetStageNumber),
      db.prepare('DELETE FROM stage_history WHERE panel_id = ? AND stage_number = ? AND started_at IS NULL AND completed_at IS NULL')
        .bind(id, targetStageNumber),
      db.prepare("UPDATE panels SET current_stage = ?, current_area = ?, status = 'Waiting', assigned_to = NULL, updated_at = ? WHERE id = ?")
        .bind(targetStageNumber, targetStageDef.area, now, id),
      db.prepare('INSERT INTO stage_history (id, panel_id, stage_number, stage_name, area, assigned_to, started_at, completed_at, hold_reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind('sh_' + crypto.randomUUID(), id, targetStageNumber, targetStageDef.name, targetStageDef.area, null, null, null, null, now),
      db.prepare('INSERT INTO audit_logs (id, timestamp, user_id, username, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind('log_' + crypto.randomUUID(), now, user.id, user.username, 'UNDO_STAGE_COMPLETION', 'PANEL', id, `Undid Stage ${reversedStageNumber} (${reversedStageName}). Reason: ${cleanReason}`)
    ]);

    return c.json({
      message: `Successfully reversed Stage #${reversedStageNumber} (${reversedStageName}). Panel returned to ${targetStageDef.name} (${targetStageDef.area}).`,
      targetStage: {
        stageNumber: targetStageNumber,
        stageName: targetStageDef.name,
        area: targetStageDef.area
      }
    });
  } catch (err) {
    return c.json({ error: err.message || 'Failed to undo stage completion.' }, 500);
  }
});

panelRoutes.post('/:id/hold', async (c) => {
  try {
    const db = c.env.DB;
    const user = c.get('user');
    const id = c.req.param('id');
    const { reason } = await c.req.json().catch(() => ({}));

    if (!reason || !reason.trim()) return c.json({ error: 'A hold reason is mandatory.' }, 400);
    const panel = await db.prepare('SELECT * FROM panels WHERE id = ?').bind(id).first();
    if (!panel) return c.json({ error: `Panel '${id}' not found.` }, 404);
    if (panel.status !== 'In Progress') return c.json({ error: "Only panels 'In Progress' can be put on Hold." }, 400);
    if (!WorkflowEngine.canUserOperatePanel(user, panel)) {
      return c.json({ error: `Permission denied to hold panel in ${panel.current_area}.` }, 403);
    }

    const now = new Date().toISOString();
    const cleanReason = reason.trim();
    await db.batch([
      db.prepare("UPDATE panels SET status = 'Held', hold_reason = ?, updated_at = ? WHERE id = ?").bind(cleanReason, now, id),
      db.prepare('INSERT INTO hold_history (id, panel_id, stage_number, held_at, resumed_at, reason) VALUES (?, ?, ?, ?, ?, ?)')
        .bind('hh_' + crypto.randomUUID(), id, panel.current_stage, now, null, cleanReason),
      db.prepare('INSERT INTO audit_logs (id, timestamp, user_id, username, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind('log_' + crypto.randomUUID(), now, user.id, user.username, 'HOLD_PANEL', 'PANEL', id, `Panel held: ${cleanReason}`)
    ]);

    return c.json({ message: `Panel put on Hold: ${cleanReason}` });
  } catch (err) {
    return c.json({ error: err.message || 'Failed to hold panel.' }, 500);
  }
});

panelRoutes.post('/:id/resume', async (c) => {
  try {
    const db = c.env.DB;
    const user = c.get('user');
    const id = c.req.param('id');

    const panel = await db.prepare('SELECT * FROM panels WHERE id = ?').bind(id).first();
    if (!panel) return c.json({ error: `Panel '${id}' not found.` }, 404);
    if (panel.status !== 'Held') return c.json({ error: 'Panel is not on Hold.' }, 400);
    if (!WorkflowEngine.canUserOperatePanel(user, panel)) {
      return c.json({ error: `Permission denied to resume panel in ${panel.current_area}.` }, 403);
    }

    const now = new Date().toISOString();
    const openHold = await db.prepare('SELECT id FROM hold_history WHERE panel_id = ? AND resumed_at IS NULL ORDER BY held_at DESC LIMIT 1').bind(id).first();

    const stmts = [
      db.prepare("UPDATE panels SET status = 'In Progress', hold_reason = NULL, updated_at = ? WHERE id = ?").bind(now, id),
      db.prepare('INSERT INTO audit_logs (id, timestamp, user_id, username, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind('log_' + crypto.randomUUID(), now, user.id, user.username, 'RESUME_PANEL', 'PANEL', id, `Resumed work on stage ${panel.current_stage}`)
    ];
    if (openHold) {
      stmts.push(db.prepare('UPDATE hold_history SET resumed_at = ? WHERE id = ?').bind(now, openHold.id));
    }
    await db.batch(stmts);

    return c.json({ message: 'Panel resumed work successfully.' });
  } catch (err) {
    return c.json({ error: err.message || 'Failed to resume panel.' }, 500);
  }
});

panelRoutes.delete('/:id', requireAdmin, async (c) => {
  try {
    const db = c.env.DB;
    const user = c.get('user');
    const id = c.req.param('id');

    const panel = await db.prepare('SELECT id FROM panels WHERE id = ?').bind(id).first();
    if (!panel) return c.json({ error: `Panel '${id}' not found.` }, 404);

    await db.batch([
      db.prepare('DELETE FROM hold_history WHERE panel_id = ?').bind(id),
      db.prepare('DELETE FROM stage_history WHERE panel_id = ?').bind(id),
      db.prepare('DELETE FROM panels WHERE id = ?').bind(id),
      db.prepare('INSERT INTO audit_logs (id, timestamp, user_id, username, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind('log_' + crypto.randomUUID(), new Date().toISOString(), user.id, user.username, 'DELETE_PANEL', 'PANEL', id, 'Deleted panel record')
    ]);

    return c.json({ message: `Panel ${id} deleted successfully.` });
  } catch (err) {
    return c.json({ error: err.message || 'Failed to delete panel.' }, 500);
  }
});

