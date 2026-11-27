import crypto from 'node:crypto';
import { getDatabase } from '../db/database.js';
import { WorkflowEngine } from '../services/workflowEngine.js';
import { CapacityService } from '../services/capacityService.js';

export class PanelController {
  static getPanels(req, res) {
    try {
      const db = getDatabase();
      const { type, area, status, search } = req.query;

      let query = `SELECT * FROM panels WHERE 1=1`;
      const params = [];

      if (type) {
        query += ` AND type = ?`;
        params.push(type);
      }
      if (area) {
        query += ` AND current_area = ?`;
        params.push(area);
      }
      if (status) {
        query += ` AND status = ?`;
        params.push(status);
      }
      if (search) {
        query += ` AND (id LIKE ? OR project LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`);
      }

      query += ` ORDER BY created_at DESC`;

      const panels = db.prepare(query).all(...params);
      const today = new Date().toISOString().slice(0, 10);

      const enrichedPanels = panels.map(p => {
        // Calculate days in current stage
        const lastStage = db.prepare(`
          SELECT started_at, created_at FROM stage_history
          WHERE panel_id = ? AND stage_number = ?
          ORDER BY created_at DESC LIMIT 1
        `).get(p.id, p.current_stage);

        const refDate = (lastStage && lastStage.started_at) || (lastStage && lastStage.created_at) || p.created_at;
        const diffMs = Date.now() - new Date(refDate).getTime();
        const daysInStage = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

        const isOverdue = p.status !== 'Done' && p.due_date < today;
        const daysOverdue = isOverdue ? Math.floor((new Date(today).getTime() - new Date(p.due_date).getTime()) / (1000 * 60 * 60 * 24)) : 0;

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

      return res.json(enrichedPanels);
    } catch (error) {
      console.error('Error fetching panels:', error);
      return res.status(500).json({ error: 'Failed to retrieve panels.' });
    }
  }

  static getPanelById(req, res) {
    try {
      const db = getDatabase();
      const { id } = req.params;

      const panel = db.prepare(`SELECT * FROM panels WHERE id = ?`).get(id);
      if (!panel) {
        return res.status(404).json({ error: `Panel with ID '${id}' not found.` });
      }

      const stageHistory = db.prepare(`
        SELECT * FROM stage_history WHERE panel_id = ? ORDER BY stage_number ASC, created_at ASC
      `).all(id);

      const holdHistory = db.prepare(`
        SELECT * FROM hold_history WHERE panel_id = ? ORDER BY held_at ASC
      `).all(id);

      const stageDef = WorkflowEngine.getStageDefinition(panel.type, panel.current_stage);

      return res.json({
        ...panel,
        stageName: stageDef.name,
        stageHistory,
        holdHistory
      });
    } catch (error) {
      console.error('Error fetching panel detail:', error);
      return res.status(500).json({ error: 'Failed to retrieve panel details.' });
    }
  }

  static createPanel(req, res) {
    try {
      const db = getDatabase();
      const { id, type, project, priority, startDate, dueDate } = req.body;

      // Permission check: KSM or Admin only
      if (!WorkflowEngine.canUserOperatePanel(req.user, { current_area: 'KSM' }, 'KSM')) {
        return res.status(403).json({ error: 'Only KSM or Master Administrators can register new panels.' });
      }

      if (!id || !type || !project || !priority || !dueDate) {
        return res.status(400).json({ error: 'All fields (ID, Type, Project, Priority, Due Date) are required.' });
      }

      const cleanId = id.trim().toUpperCase();
      const existing = db.prepare(`SELECT id FROM panels WHERE id = ?`).get(cleanId);
      if (existing) {
        return res.status(409).json({ error: `A panel with ID '${cleanId}' already exists.` });
      }

      const now = new Date().toISOString();
      const planStartDate = startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : now.slice(0, 10);

      if (startDate && dueDate && planStartDate > dueDate) {
        return res.status(400).json({ error: 'Planned Start Date cannot be later than Planned Due Date.' });
      }

      const firstStage = WorkflowEngine.getStageDefinition(type, 1);

      const runCreate = db.transaction(() => {
        db.prepare(`
          INSERT INTO panels (id, type, project, priority, start_date, due_date, current_stage, current_area, status, assigned_to, hold_reason, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(cleanId, type, project.trim(), priority, planStartDate, dueDate, 1, firstStage.area, 'Waiting', null, null, now, now);

        db.prepare(`
          INSERT INTO stage_history (id, panel_id, stage_number, stage_name, area, assigned_to, started_at, completed_at, hold_reason, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run('sh_' + crypto.randomUUID(), cleanId, 1, firstStage.name, firstStage.area, null, null, null, null, now);

        // Audit log
        db.prepare(`
          INSERT INTO audit_logs (id, timestamp, user_id, username, action, entity_type, entity_id, details)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run('log_' + crypto.randomUUID(), now, req.user.id, req.user.username, 'CREATE_PANEL', 'PANEL', cleanId, `Panel ${cleanId} registered for ${project}`);
      });
      runCreate();

      return res.status(201).json({ message: 'Panel successfully registered.', panelId: cleanId });
    } catch (error) {
      console.error('Error creating panel:', error);
      return res.status(500).json({ error: error.message || 'Failed to create panel.' });
    }
  }

  static bulkImportPanels(req, res) {
    try {
      const db = getDatabase();
      const { panels } = req.body;

      if (!req.user || (!req.user.isAdmin && req.user.role !== 'AKR' && req.user.role !== 'CKG' && req.user.role !== 'KSM')) {
        return res.status(403).json({ error: 'Permission denied. Only KSM or Administrators can import panel plans.' });
      }

      if (!Array.isArray(panels) || panels.length === 0) {
        return res.status(400).json({ error: 'Import payload must contain a non-empty array of panels.' });
      }

      const now = new Date().toISOString();
      const today = now.slice(0, 10);
      const errors = [];
      const validPanels = [];
      const seenIds = new Set();

      for (let i = 0; i < panels.length; i++) {
        const row = panels[i];
        const rowNum = i + 1;
        const id = (row.id || row.panelId || '').toString().trim().toUpperCase();
        const type = (row.type || row.panelType || '').toString().trim();
        const project = (row.project || row.projectName || row.name || '').toString().trim();
        const priority = (row.priority || 'Medium').toString().trim();
        const startDate = (row.startDate || row.start_date || today).toString().trim();
        const dueDate = (row.dueDate || row.due_date || '').toString().trim();

        if (!id) {
          errors.push({ row: rowNum, error: 'Panel ID is required.' });
          continue;
        }
        if (seenIds.has(id)) {
          errors.push({ row: rowNum, panelId: id, error: `Duplicate Panel ID '${id}' in import file.` });
          continue;
        }
        seenIds.add(id);

        if (!['Traction', 'DCS'].includes(type)) {
          errors.push({ row: rowNum, panelId: id, error: `Invalid type '${type}'. Must be 'Traction' or 'DCS'.` });
          continue;
        }

        if (!project) {
          errors.push({ row: rowNum, panelId: id, error: 'Project / Panel name is required.' });
          continue;
        }

        const validPriority = ['High', 'Medium', 'Low'].includes(priority) ? priority : 'Medium';

        if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
          errors.push({ row: rowNum, panelId: id, error: `Due Date '${dueDate}' is invalid. Format must be YYYY-MM-DD.` });
          continue;
        }

        if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
          errors.push({ row: rowNum, panelId: id, error: `Start Date '${startDate}' is invalid. Format must be YYYY-MM-DD.` });
          continue;
        }

        if (startDate && dueDate && startDate > dueDate) {
          errors.push({ row: rowNum, panelId: id, error: `Start Date (${startDate}) cannot be later than Due Date (${dueDate}).` });
          continue;
        }

        // Check duplicate in DB
        const existing = db.prepare('SELECT id FROM panels WHERE id = ?').get(id);
        if (existing) {
          errors.push({ row: rowNum, panelId: id, error: `Panel '${id}' already exists in database.` });
          continue;
        }

        validPanels.push({
          id,
          type,
          project,
          priority: validPriority,
          startDate: startDate || today,
          dueDate
        });
      }

      if (errors.length > 0) {
        return res.status(400).json({
          error: `Import rejected: ${errors.length} row(s) failed validation. All rows must be valid for import.`,
          totalRows: panels.length,
          createdCount: 0,
          failedCount: errors.length,
          errors
        });
      }

      if (validPanels.length === 0) {
        return res.status(400).json({
          error: 'No valid panels to import.',
          totalRows: panels.length,
          createdCount: 0,
          failedCount: errors.length,
          errors
        });
      }

      const runImport = db.transaction(() => {
        const insertPanel = db.prepare(`
          INSERT INTO panels (id, type, project, priority, start_date, due_date, current_stage, current_area, status, assigned_to, hold_reason, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const insertStage = db.prepare(`
          INSERT INTO stage_history (id, panel_id, stage_number, stage_name, area, assigned_to, started_at, completed_at, hold_reason, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const p of validPanels) {
          const firstStage = WorkflowEngine.getStageDefinition(p.type, 1);
          insertPanel.run(p.id, p.type, p.project, p.priority, p.startDate, p.dueDate, 1, firstStage.area, 'Waiting', null, null, now, now);
          insertStage.run('sh_' + crypto.randomUUID(), p.id, 1, firstStage.name, firstStage.area, null, null, null, null, now);
        }

        db.prepare(`
          INSERT INTO audit_logs (id, timestamp, user_id, username, action, entity_type, entity_id, details)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          'log_' + crypto.randomUUID(),
          now,
          req.user.id,
          req.user.username,
          'BULK_IMPORT_PANELS',
          'PANEL',
          null,
          `Bulk imported ${validPanels.length} panels from planning file (${errors.length} skipped/failed)`
        );
      });
      runImport();

      return res.status(201).json({
        message: `Successfully imported ${validPanels.length} panel(s).`,
        totalRows: panels.length,
        createdCount: validPanels.length,
        failedCount: errors.length,
        errors
      });
    } catch (error) {
      console.error('Error during bulk panel import:', error);
      return res.status(500).json({ error: error.message || 'Failed to complete bulk import.' });
    }
  }

  static adminEditPanel(req, res) {
    try {
      const db = getDatabase();
      const { id } = req.params;
      const { project, startDate, dueDate } = req.body;

      // Master Admins only (AKR or CKG or isAdmin)
      if (!req.user || (!req.user.isAdmin && req.user.role !== 'AKR' && req.user.role !== 'CKG')) {
        return res.status(403).json({ error: 'Only Master Administrators (AKR or CKG) are authorized to edit panel names and dates.' });
      }

      const panel = db.prepare(`SELECT * FROM panels WHERE id = ?`).get(id);
      if (!panel) {
        return res.status(404).json({ error: `Panel '${id}' not found.` });
      }

      const updatedProject = project !== undefined && project.trim() ? project.trim() : panel.project;
      const updatedStartDate = startDate !== undefined && startDate ? startDate : (panel.start_date || panel.created_at.slice(0, 10));
      const updatedDueDate = dueDate !== undefined && dueDate ? dueDate : panel.due_date;

      if (!/^\d{4}-\d{2}-\d{2}$/.test(updatedStartDate) || !/^\d{4}-\d{2}-\d{2}$/.test(updatedDueDate)) {
        return res.status(400).json({ error: 'Dates must be in valid YYYY-MM-DD format.' });
      }

      if (updatedStartDate > updatedDueDate) {
        return res.status(400).json({ error: 'Planned Start Date cannot be later than Planned Due Date.' });
      }

      const now = new Date().toISOString();

      db.prepare(`
        UPDATE panels
        SET project = ?, start_date = ?, due_date = ?, updated_at = ?
        WHERE id = ?
      `).run(updatedProject, updatedStartDate, updatedDueDate, now, id);

      // Audit log
      db.prepare(`
        INSERT INTO audit_logs (id, timestamp, user_id, username, action, entity_type, entity_id, details)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'log_' + crypto.randomUUID(),
        now,
        req.user.id,
        req.user.username,
        'ADMIN_EDIT_PANEL',
        'PANEL',
        id,
        `Admin edited panel ${id}: Project="${panel.project}" -> "${updatedProject}", StartDate="${panel.start_date || ''}" -> "${updatedStartDate}", DueDate="${panel.due_date}" -> "${updatedDueDate}"`
      );

      return res.json({
        message: `Panel ${id} successfully updated by Administrator.`,
        panel: {
          ...panel,
          project: updatedProject,
          start_date: updatedStartDate,
          due_date: updatedDueDate,
          updated_at: now
        }
      });
    } catch (error) {
      console.error('Error admin-editing panel:', error);
      return res.status(500).json({ error: error.message || 'Failed to update panel.' });
    }
  }

  static startStage(req, res) {
    try {
      const db = getDatabase();
      const { id } = req.params;
      const { assignedTo, confirmedOverload, customManpower } = req.body;

      const panel = db.prepare(`SELECT * FROM panels WHERE id = ?`).get(id);
      if (!panel) {
        return res.status(404).json({ error: `Panel '${id}' not found.` });
      }

      if (panel.status !== 'Waiting') {
        return res.status(400).json({ error: `Cannot Start panel in '${panel.status}' status. Panel must be 'Waiting'.` });
      }

      // Check permissions
      if (!WorkflowEngine.canUserOperatePanel(req.user, panel)) {
        return res.status(403).json({ error: `Permission denied. Only area '${panel.current_area}' or Admins can start this stage.` });
      }

      // If customManpower was submitted via Others, persist it if not already present
      if (customManpower && customManpower.name && customManpower.area && customManpower.type) {
        const cleanCustomName = customManpower.name.trim();
        const existingCustom = db.prepare('SELECT id FROM custom_manpower WHERE area = ? AND type = ? AND name = ?').get(customManpower.area, customManpower.type, cleanCustomName);
        if (!existingCustom) {
          const nowCustom = new Date().toISOString();
          db.prepare(`
            INSERT INTO custom_manpower (id, area, type, name, members, is_active, created_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
          `).run(
            'cm_' + crypto.randomUUID(),
            customManpower.area,
            customManpower.type,
            cleanCustomName,
            customManpower.members ? customManpower.members.trim() : null,
            req.user.username,
            nowCustom,
            nowCustom
          );
        }
      }

      // Validate worker eligibility
      WorkflowEngine.validateWorkerEligibility(db, panel, panel.current_stage, assignedTo, req.user);

      // Check capacity overload warning
      const currentMonth = new Date().toISOString().slice(0, 7);
      const workload = CapacityService.calculateActualWorkload(db, assignedTo, currentMonth);
      if (workload.actualLoad !== null && workload.actualLoad >= 100 && !confirmedOverload) {
        return res.status(409).json({
          requiresConfirmation: true,
          message: `Warning: Assigning this panel will push ${assignedTo} above 100% capacity (currently at ${workload.actualLoad}%). Do you want to proceed?`,
          currentLoad: workload.actualLoad
        });
      }

      const now = new Date().toISOString();
      const stageDef = WorkflowEngine.getStageDefinition(panel.type, panel.current_stage);
      const owningArea = WorkflowEngine.getOwningAreaForStage(stageDef, assignedTo, db);

      const runStart = db.transaction(() => {
        db.prepare(`
          UPDATE panels
          SET status = 'In Progress', assigned_to = ?, current_area = ?, updated_at = ?
          WHERE id = ?
        `).run(assignedTo, owningArea, now, id);

        // Update active stage_history entry
        const activeStage = db.prepare(`
          SELECT id FROM stage_history
          WHERE panel_id = ? AND stage_number = ? AND completed_at IS NULL
          ORDER BY created_at DESC LIMIT 1
        `).get(id, panel.current_stage);

        if (activeStage) {
          db.prepare(`
            UPDATE stage_history
            SET assigned_to = ?, area = ?, started_at = ?
            WHERE id = ?
          `).run(assignedTo, owningArea, now, activeStage.id);
        }

        // Audit log
        db.prepare(`
          INSERT INTO audit_logs (id, timestamp, user_id, username, action, entity_type, entity_id, details)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run('log_' + crypto.randomUUID(), now, req.user.id, req.user.username, 'START_STAGE', 'PANEL', id, `Started stage ${stageDef.name} assigned to ${assignedTo}`);
      });
      runStart();

      return res.json({ message: `Stage ${stageDef.name} started successfully.` });
    } catch (error) {
      console.error('Error starting stage:', error);
      return res.status(400).json({ error: error.message || 'Failed to start stage.' });
    }
  }

  static completeStage(req, res) {
    try {
      const db = getDatabase();
      const { id } = req.params;

      const panel = db.prepare(`SELECT * FROM panels WHERE id = ?`).get(id);
      if (!panel) {
        return res.status(404).json({ error: `Panel '${id}' not found.` });
      }

      if (panel.status !== 'In Progress') {
        return res.status(400).json({ error: `Cannot Complete panel in '${panel.status}' status. Panel must be 'In Progress'.` });
      }

      if (!WorkflowEngine.canUserOperatePanel(req.user, panel)) {
        return res.status(403).json({ error: `Permission denied. Only area '${panel.current_area}' or Admins can complete this stage.` });
      }

      const now = new Date().toISOString();
      const currentStageDef = WorkflowEngine.getStageDefinition(panel.type, panel.current_stage);
      const isFinal = WorkflowEngine.isFinalStage(panel.type, panel.current_stage);
      const nextStage = !isFinal ? WorkflowEngine.getNextStage(panel.type, panel.current_stage) : null;

      const runComplete = db.transaction(() => {
        // Close current stage history entry
        const activeStage = db.prepare(`
          SELECT id FROM stage_history
          WHERE panel_id = ? AND stage_number = ? AND completed_at IS NULL
          ORDER BY created_at DESC LIMIT 1
        `).get(id, panel.current_stage);

        if (activeStage) {
          db.prepare(`
            UPDATE stage_history
            SET completed_at = ?
            WHERE id = ?
          `).run(now, activeStage.id);
        }

        if (isFinal) {
          // Complete panel entirely
          db.prepare(`
            UPDATE panels
            SET status = 'Done', updated_at = ?
            WHERE id = ?
          `).run(now, id);

          db.prepare(`
            INSERT INTO audit_logs (id, timestamp, user_id, username, action, entity_type, entity_id, details)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run('log_' + crypto.randomUUID(), now, req.user.id, req.user.username, 'COMPLETE_PANEL', 'PANEL', id, `Panel finished Despatch and marked Done`);
        } else {
          // Advance to next stage
          db.prepare(`
            UPDATE panels
            SET current_stage = ?, current_area = ?, status = 'Waiting', assigned_to = NULL, updated_at = ?
            WHERE id = ?
          `).run(nextStage.stageNumber, nextStage.area, now, id);

          // Insert new stage_history record
          db.prepare(`
            INSERT INTO stage_history (id, panel_id, stage_number, stage_name, area, assigned_to, started_at, completed_at, hold_reason, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run('sh_' + crypto.randomUUID(), id, nextStage.stageNumber, nextStage.name, nextStage.area, null, null, null, null, now);

          db.prepare(`
            INSERT INTO audit_logs (id, timestamp, user_id, username, action, entity_type, entity_id, details)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run('log_' + crypto.randomUUID(), now, req.user.id, req.user.username, 'ADVANCE_STAGE', 'PANEL', id, `Completed ${currentStageDef.name}, advanced to ${nextStage.name} (${nextStage.area})`);
        }
      });
      runComplete();

      if (isFinal) {
        return res.json({ message: `Panel ${id} successfully finished and marked Done.` });
      } else {
        return res.json({ message: `Stage completed. Panel advanced to ${nextStage.name} (${nextStage.area}).` });
      }
    } catch (error) {
      console.error('Error completing stage:', error);
      return res.status(500).json({ error: error.message || 'Failed to complete stage.' });
    }
  }

  static undoStageCompletion(req, res) {
    try {
      const db = getDatabase();
      const { id } = req.params;
      const { reason } = req.body || {};

      // 1. Authorization: Master Admins (AKR/CKG) only
      if (!req.user || (!req.user.isAdmin && req.user.role !== 'AKR' && req.user.role !== 'CKG')) {
        return res.status(403).json({ error: 'Permission denied. Only Master Administrators (AKR or CKG) can undo completed workflow stages.' });
      }

      // 2. Fetch panel
      const panel = db.prepare(`SELECT * FROM panels WHERE id = ?`).get(id);
      if (!panel) {
        return res.status(404).json({ error: `Panel '${id}' not found.` });
      }

      // 3. Check reversible completion eligibility and destination stage
      const reversibility = WorkflowEngine.getReversibleCompletion(db, panel);
      if (!reversibility.eligible) {
        return res.status(400).json({ error: reversibility.reason });
      }

      const now = new Date().toISOString();
      const cleanReason = (reason && typeof reason === 'string' && reason.trim()) ? reason.trim() : 'Operational correction (mistaken completion)';
      const targetStageDef = reversibility.targetStageDef;
      const reversedRecord = reversibility.stageHistoryRecord;
      const reversedStageNumber = reversibility.reversedStageNumber;
      const reversedStageName = reversibility.reversedStageName;
      const targetStageNumber = reversibility.targetStageNumber;

      const runUndo = db.transaction(() => {
        // A. Mark the original completed record as undone (preserving original completion record and timestamps)
        db.prepare(`
          UPDATE stage_history
          SET undone_at = ?, undone_by = ?, undo_reason = ?
          WHERE id = ?
        `).run(now, req.user.username, cleanReason, reversedRecord.id);

        // B. Clean up unstarted placeholder stage_history records (e.g. newly created stage that was never started)
        db.prepare(`
          DELETE FROM stage_history
          WHERE panel_id = ? AND stage_number > ? AND started_at IS NULL AND completed_at IS NULL
        `).run(id, targetStageNumber);

        db.prepare(`
          DELETE FROM stage_history
          WHERE panel_id = ? AND stage_number = ? AND started_at IS NULL AND completed_at IS NULL
        `).run(id, targetStageNumber);

        // C. Update panel state to returned stage in 'Waiting' status ready for rework
        db.prepare(`
          UPDATE panels
          SET current_stage = ?, current_area = ?, status = 'Waiting', assigned_to = NULL, updated_at = ?
          WHERE id = ?
        `).run(targetStageNumber, targetStageDef.area, now, id);

        // D. Insert a fresh active stage_history entry for the target stage so it can be worked on and completed again
        db.prepare(`
          INSERT INTO stage_history (id, panel_id, stage_number, stage_name, area, assigned_to, started_at, completed_at, hold_reason, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run('sh_' + crypto.randomUUID(), id, targetStageNumber, targetStageDef.name, targetStageDef.area, null, null, null, null, now);

        // E. Audit log
        db.prepare(`
          INSERT INTO audit_logs (id, timestamp, user_id, username, action, entity_type, entity_id, details)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          'log_' + crypto.randomUUID(),
          now,
          req.user.id,
          req.user.username,
          'UNDO_STAGE_COMPLETION',
          'PANEL',
          id,
          `Undid completion of Stage ${reversedStageNumber} (${reversedStageName}). Panel returned to Stage ${targetStageNumber} (${targetStageDef.name}) in ${targetStageDef.area}. Reason: ${cleanReason}`
        );
      });

      runUndo();

      const updatedPanel = db.prepare(`SELECT * FROM panels WHERE id = ?`).get(id);

      return res.json({
        message: `Successfully reversed Stage ${reversedStageNumber} (${reversedStageName}). Panel returned to Stage ${targetStageNumber} (${targetStageDef.name}) for rework.`,
        reversedStage: {
          stageNumber: reversedStageNumber,
          stageName: reversedStageName
        },
        targetStage: {
          stageNumber: targetStageNumber,
          stageName: targetStageDef.name
        },
        panel: updatedPanel
      });
    } catch (error) {
      console.error('Error undoing stage completion:', error);
      return res.status(500).json({ error: error.message || 'Failed to undo stage completion.' });
    }
  }

  static holdStage(req, res) {
    try {
      const db = getDatabase();
      const { id } = req.params;
      const { reason } = req.body;

      if (!reason || !reason.trim()) {
        return res.status(400).json({ error: 'A hold reason is mandatory.' });
      }

      const panel = db.prepare(`SELECT * FROM panels WHERE id = ?`).get(id);
      if (!panel) return res.status(404).json({ error: `Panel '${id}' not found.` });

      if (panel.status !== 'In Progress') {
        return res.status(400).json({ error: `Only panels 'In Progress' can be put on Hold.` });
      }

      if (!WorkflowEngine.canUserOperatePanel(req.user, panel)) {
        return res.status(403).json({ error: `Permission denied to hold panel in ${panel.current_area}.` });
      }

      const now = new Date().toISOString();
      const cleanReason = reason.trim();

      const runHold = db.transaction(() => {
        db.prepare(`
          UPDATE panels
          SET status = 'Held', hold_reason = ?, updated_at = ?
          WHERE id = ?
        `).run(cleanReason, now, id);

        db.prepare(`
          INSERT INTO hold_history (id, panel_id, stage_number, held_at, resumed_at, reason)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run('hh_' + crypto.randomUUID(), id, panel.current_stage, now, null, cleanReason);

        db.prepare(`
          INSERT INTO audit_logs (id, timestamp, user_id, username, action, entity_type, entity_id, details)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run('log_' + crypto.randomUUID(), now, req.user.id, req.user.username, 'HOLD_PANEL', 'PANEL', id, `Panel held: ${cleanReason}`);
      });
      runHold();

      return res.json({ message: `Panel put on Hold: ${cleanReason}` });
    } catch (error) {
      console.error('Error holding panel:', error);
      return res.status(500).json({ error: error.message || 'Failed to hold panel.' });
    }
  }

  static resumeStage(req, res) {
    try {
      const db = getDatabase();
      const { id } = req.params;

      const panel = db.prepare(`SELECT * FROM panels WHERE id = ?`).get(id);
      if (!panel) return res.status(404).json({ error: `Panel '${id}' not found.` });

      if (panel.status !== 'Held') {
        return res.status(400).json({ error: `Panel is not on Hold.` });
      }

      if (!WorkflowEngine.canUserOperatePanel(req.user, panel)) {
        return res.status(403).json({ error: `Permission denied to resume panel in ${panel.current_area}.` });
      }

      const now = new Date().toISOString();

      const runResume = db.transaction(() => {
        db.prepare(`
          UPDATE panels
          SET status = 'In Progress', hold_reason = NULL, updated_at = ?
          WHERE id = ?
        `).run(now, id);

        // Close the open hold_history record
        const openHold = db.prepare(`
          SELECT id FROM hold_history
          WHERE panel_id = ? AND resumed_at IS NULL
          ORDER BY held_at DESC LIMIT 1
        `).get(id);

        if (openHold) {
          db.prepare(`
            UPDATE hold_history SET resumed_at = ? WHERE id = ?
          `).run(now, openHold.id);
        }

        db.prepare(`
          INSERT INTO audit_logs (id, timestamp, user_id, username, action, entity_type, entity_id, details)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run('log_' + crypto.randomUUID(), now, req.user.id, req.user.username, 'RESUME_PANEL', 'PANEL', id, `Resumed work on stage ${panel.current_stage}`);
      });
      runResume();

      return res.json({ message: `Panel resumed work successfully.` });
    } catch (error) {
      console.error('Error resuming panel:', error);
      return res.status(500).json({ error: error.message || 'Failed to resume panel.' });
    }
  }

  static deletePanel(req, res) {
    try {
      const db = getDatabase();
      const { id } = req.params;

      // Master Admins only
      if (!req.user || (!req.user.isAdmin && req.user.role !== 'AKR' && req.user.role !== 'CKG')) {
        return res.status(403).json({ error: 'Only Master Administrators (AKR or CKG) can delete panels.' });
      }

      const panel = db.prepare(`SELECT id FROM panels WHERE id = ?`).get(id);
      if (!panel) return res.status(404).json({ error: `Panel '${id}' not found.` });

      const runDelete = db.transaction(() => {
        db.prepare(`DELETE FROM hold_history WHERE panel_id = ?`).run(id);
        db.prepare(`DELETE FROM stage_history WHERE panel_id = ?`).run(id);
        db.prepare(`DELETE FROM panels WHERE id = ?`).run(id);

        db.prepare(`
          INSERT INTO audit_logs (id, timestamp, user_id, username, action, entity_type, entity_id, details)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run('log_' + crypto.randomUUID(), new Date().toISOString(), req.user.id, req.user.username, 'DELETE_PANEL', 'PANEL', id, `Deleted panel record`);
      });
      runDelete();

      return res.json({ message: `Panel ${id} deleted successfully.` });
    } catch (error) {
      console.error('Error deleting panel:', error);
      return res.status(500).json({ error: error.message || 'Failed to delete panel.' });
    }
  }
}
