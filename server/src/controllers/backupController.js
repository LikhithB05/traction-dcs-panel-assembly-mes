import crypto from 'node:crypto';
import { getDatabase } from '../db/database.js';
import { WorkflowEngine } from '../services/workflowEngine.js';

function escapeCsvCell(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export class BackupController {
  static getLiveRecordCounts(req, res) {
    try {
      const db = getDatabase();
      const panelCount = db.prepare('SELECT COUNT(*) as c FROM panels').get().c;
      const stageHistoryCount = db.prepare('SELECT COUNT(*) as c FROM stage_history').get().c;
      const planCount = db.prepare('SELECT COUNT(*) as c FROM monthly_plans').get().c;
      const dailyCount = db.prepare('SELECT COUNT(*) as c FROM daily_status').get().c;
      const subAssemblyCount = db.prepare('SELECT COUNT(*) as c FROM sub_assembly').get().c;
      const scenarioCount = db.prepare('SELECT COUNT(*) as c FROM what_if_scenarios').get().c;
      const auditLogCount = db.prepare('SELECT COUNT(*) as c FROM audit_logs').get().c;

      return res.json({
        panels: panelCount,
        stageHistories: stageHistoryCount,
        monthlyPlans: planCount,
        dailyTargets: dailyCount,
        subAssemblies: subAssemblyCount,
        scenarios: scenarioCount,
        auditLogs: auditLogCount
      });
    } catch (error) {
      console.error('Error getting live counts:', error);
      return res.status(500).json({ error: 'Failed to retrieve record counts.' });
    }
  }

  static exportFullBackupJSON(req, res) {
    try {
      const db = getDatabase();

      const panels = db.prepare('SELECT * FROM panels').all();
      const stageHistory = db.prepare('SELECT * FROM stage_history').all();
      const holdHistory = db.prepare('SELECT * FROM hold_history').all();
      const monthlyPlans = db.prepare('SELECT * FROM monthly_plans').all();
      const dailyStatus = db.prepare('SELECT * FROM daily_status').all();
      const subAssembly = db.prepare('SELECT * FROM sub_assembly').all();
      const whatIfScenarios = db.prepare('SELECT * FROM what_if_scenarios').all();
      const auditLogs = db.prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 500').all();

      const backupPackage = {
        metadata: {
          system: 'BHEL Traction & DCS Panel Assembly Management Portal',
          version: '1.0.0',
          exportedAt: new Date().toISOString(),
          exportedBy: req.user ? req.user.username : 'ADMIN',
          counts: {
            panels: panels.length,
            stageHistory: stageHistory.length,
            holdHistory: holdHistory.length,
            monthlyPlans: monthlyPlans.length,
            dailyStatus: dailyStatus.length,
            subAssembly: subAssembly.length,
            scenarios: whatIfScenarios.length,
            auditLogs: auditLogs.length
          }
        },
        data: {
          panels,
          stageHistory,
          holdHistory,
          monthlyPlans,
          dailyStatus,
          subAssembly,
          whatIfScenarios,
          auditLogs
        }
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="bhel_portal_backup_${new Date().toISOString().slice(0, 10)}.json"`);
      return res.json(backupPackage);
    } catch (error) {
      console.error('Error generating JSON backup:', error);
      return res.status(500).json({ error: 'Failed to create JSON backup.' });
    }
  }

  static exportPanelsCSV(req, res) {
    try {
      const db = getDatabase();
      const panels = db.prepare('SELECT * FROM panels ORDER BY created_at DESC').all();
      const today = new Date().toISOString().slice(0, 10);

      const headers = ['Panel ID', 'Type', 'Project', 'Priority', 'Due Date', 'Current Stage', 'Area', 'Team / Person', 'Status', 'Days in Stage', 'Days Overdue'];
      const rows = [];

      for (const p of panels) {
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

        rows.push([
          escapeCsvCell(p.id),
          escapeCsvCell(p.type),
          escapeCsvCell(p.project),
          escapeCsvCell(p.priority),
          escapeCsvCell(p.due_date),
          escapeCsvCell(stageDef.name),
          escapeCsvCell(p.current_area),
          escapeCsvCell(p.assigned_to || 'Unassigned'),
          escapeCsvCell(p.status),
          escapeCsvCell(daysInStage),
          escapeCsvCell(daysOverdue)
        ]);
      }

      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="bhel_panels_${today}.csv"`);
      return res.send(csvContent);
    } catch (error) {
      console.error('Error generating CSV export:', error);
      return res.status(500).json({ error: 'Failed to generate CSV export.' });
    }
  }

  static restoreFromJSON(req, res) {
    try {
      const db = getDatabase();
      const { backupData } = req.body;

      if (!backupData || typeof backupData !== 'object' || !backupData.metadata || !backupData.data) {
        return res.status(400).json({ error: 'Invalid backup JSON payload. Expected { metadata, data } structure.' });
      }

      if (backupData.metadata.version !== '1.0.0') {
        return res.status(400).json({ error: `Unsupported backup package version: '${backupData.metadata.version}'. Expected '1.0.0'.` });
      }

      const {
        panels = [],
        stageHistory = [],
        holdHistory = [],
        monthlyPlans = [],
        dailyStatus = [],
        subAssembly = [],
        whatIfScenarios = [],
        auditLogs = []
      } = backupData.data;

      // 1. Validate Array Data Types
      if (!Array.isArray(panels) || !Array.isArray(stageHistory) || !Array.isArray(holdHistory) ||
          !Array.isArray(monthlyPlans) || !Array.isArray(dailyStatus) || !Array.isArray(subAssembly) ||
          !Array.isArray(whatIfScenarios) || !Array.isArray(auditLogs)) {
        return res.status(400).json({ error: 'Malformed backup data: data tables must be arrays.' });
      }

      // 2. Validate Duplicate IDs within Backup Payload
      const checkDuplicates = (items, key, label) => {
        const seen = new Set();
        for (const it of items) {
          const val = it[key];
          if (!val) continue;
          if (seen.has(val)) {
            return `Duplicate ${label} ID '${val}' detected within backup package.`;
          }
          seen.add(val);
        }
        return null;
      };

      const dupPanel = checkDuplicates(panels, 'id', 'panel');
      if (dupPanel) return res.status(400).json({ error: dupPanel });
      const dupStage = checkDuplicates(stageHistory, 'id', 'stage_history');
      if (dupStage) return res.status(400).json({ error: dupStage });
      const dupHold = checkDuplicates(holdHistory, 'id', 'hold_history');
      if (dupHold) return res.status(400).json({ error: dupHold });
      const dupScenario = checkDuplicates(whatIfScenarios, 'id', 'scenario');
      if (dupScenario) return res.status(400).json({ error: dupScenario });

      // 3. Validate Panel Records
      const validPanelTypes = new Set(['Traction', 'DCS']);
      const validPriorities = new Set(['High', 'Medium', 'Low']);
      const validAreas = new Set(['KSM', 'PDR', 'CRM']);
      const validStatuses = new Set(['Waiting', 'In Progress', 'Held', 'Done']);

      for (const p of panels) {
        if (!p.id || typeof p.id !== 'string') return res.status(400).json({ error: 'Invalid panel: missing or non-string ID.' });
        if (!validPanelTypes.has(p.type)) return res.status(400).json({ error: `Invalid panel type '${p.type}' for panel '${p.id}'.` });
        if (!p.project || typeof p.project !== 'string') return res.status(400).json({ error: `Missing project for panel '${p.id}'.` });
        if (!validPriorities.has(p.priority)) return res.status(400).json({ error: `Invalid priority '${p.priority}' for panel '${p.id}'.` });
        if (!validAreas.has(p.current_area)) return res.status(400).json({ error: `Invalid area '${p.current_area}' for panel '${p.id}'.` });
        if (!validStatuses.has(p.status)) return res.status(400).json({ error: `Invalid status '${p.status}' for panel '${p.id}'.` });
        if (typeof p.current_stage !== 'number' || p.current_stage < 1) return res.status(400).json({ error: `Invalid stage number for panel '${p.id}'.` });
      }

      // 4. Validate Foreign Keys (stage_history & hold_history panel_id)
      const existingPanels = new Set(db.prepare(`SELECT id FROM panels`).all().map(r => r.id));
      const backupPanels = new Set(panels.map(p => p.id));

      for (const sh of stageHistory) {
        if (!sh.id || typeof sh.id !== 'string') return res.status(400).json({ error: 'Invalid stage history: missing ID.' });
        if (!sh.panel_id || (!backupPanels.has(sh.panel_id) && !existingPanels.has(sh.panel_id))) {
          return res.status(400).json({ error: `Orphaned stage_history record '${sh.id}': panel_id '${sh.panel_id}' does not exist.` });
        }
        if (typeof sh.stage_number !== 'number') return res.status(400).json({ error: `Invalid stage_number in stage_history '${sh.id}'.` });
      }

      for (const hh of holdHistory) {
        if (!hh.id || typeof hh.id !== 'string') return res.status(400).json({ error: 'Invalid hold history: missing ID.' });
        if (!hh.panel_id || (!backupPanels.has(hh.panel_id) && !existingPanels.has(hh.panel_id))) {
          return res.status(400).json({ error: `Orphaned hold_history record '${hh.id}': panel_id '${hh.panel_id}' does not exist.` });
        }
        if (!hh.reason || typeof hh.reason !== 'string') return res.status(400).json({ error: `Missing hold reason in hold_history '${hh.id}'.` });
      }

      // 5. Validate Saved Scenario JSON
      for (const sc of whatIfScenarios) {
        if (!sc.id || !sc.name) return res.status(400).json({ error: 'Invalid scenario record in backup: missing id or name.' });
        if (typeof sc.scenario_data === 'string') {
          try {
            JSON.parse(sc.scenario_data);
          } catch {
            return res.status(400).json({ error: `Corrupted scenario JSON in scenario '${sc.id}'.` });
          }
        } else if (typeof sc.scenario_data !== 'object' || sc.scenario_data === null) {
          return res.status(400).json({ error: `Invalid scenario_data structure in scenario '${sc.id}'.` });
        }
      }

      // 6. Validate Audit Logs
      for (const al of auditLogs) {
        if (!al.id || typeof al.id !== 'string') return res.status(400).json({ error: 'Invalid audit log record: missing ID.' });
        if (!al.timestamp || !al.action || !al.entity_type) {
          return res.status(400).json({ error: `Incomplete audit log record '${al.id}'.` });
        }
      }

      // Execute in an atomic transaction with rollback protection
      const runAtomicRestore = db.transaction(() => {
        // Upsert Panels
        const upsertPanelStmt = db.prepare(`
          INSERT INTO panels (id, type, project, priority, due_date, current_stage, current_area, status, assigned_to, hold_reason, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            type = excluded.type,
            project = excluded.project,
            priority = excluded.priority,
            due_date = excluded.due_date,
            current_stage = excluded.current_stage,
            current_area = excluded.current_area,
            status = excluded.status,
            assigned_to = excluded.assigned_to,
            hold_reason = excluded.hold_reason,
            updated_at = excluded.updated_at
        `);

        for (const p of panels) {
          upsertPanelStmt.run(
            p.id, p.type, p.project, p.priority, p.due_date,
            p.current_stage, p.current_area, p.status, p.assigned_to,
            p.hold_reason, p.created_at, p.updated_at || new Date().toISOString()
          );
        }

        // Upsert Stage History
        const upsertStageStmt = db.prepare(`
          INSERT INTO stage_history (id, panel_id, stage_number, stage_name, area, assigned_to, started_at, completed_at, hold_reason, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            assigned_to = excluded.assigned_to,
            started_at = excluded.started_at,
            completed_at = excluded.completed_at,
            hold_reason = excluded.hold_reason
        `);

        for (const sh of stageHistory) {
          upsertStageStmt.run(
            sh.id, sh.panel_id, sh.stage_number, sh.stage_name, sh.area,
            sh.assigned_to, sh.started_at, sh.completed_at, sh.hold_reason, sh.created_at
          );
        }

        // Upsert Monthly Plans
        const upsertPlanStmt = db.prepare(`
          INSERT INTO monthly_plans (id, month, area, team_or_person, traction_plan, dcs_plan, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            traction_plan = excluded.traction_plan,
            dcs_plan = excluded.dcs_plan,
            updated_at = excluded.updated_at
        `);

        for (const mp of monthlyPlans) {
          upsertPlanStmt.run(
            mp.id, mp.month, mp.area, mp.team_or_person,
            mp.traction_plan, mp.dcs_plan, mp.updated_at || new Date().toISOString()
          );
        }

        // Upsert Daily Status
        const upsertDailyStmt = db.prepare(`
          INSERT INTO daily_status (id, date, area, team_or_person, target, actual, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(date, team_or_person) DO UPDATE SET
            target = excluded.target,
            actual = excluded.actual,
            updated_at = excluded.updated_at
        `);

        for (const ds of dailyStatus) {
          upsertDailyStmt.run(
            ds.id, ds.date, ds.area, ds.team_or_person,
            ds.target, ds.actual, ds.updated_at || new Date().toISOString()
          );
        }

        // Upsert Sub Assembly
        const upsertSubStmt = db.prepare(`
          INSERT INTO sub_assembly (id, date, item, daily_capacity, target, actual, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(date, item) DO UPDATE SET
            target = excluded.target,
            actual = excluded.actual,
            updated_at = excluded.updated_at
        `);

        for (const sa of subAssembly) {
          upsertSubStmt.run(
            sa.id, sa.date, sa.item, sa.daily_capacity,
            sa.target, sa.actual, sa.updated_at || new Date().toISOString()
          );
        }

        // Upsert Hold History
        if (holdHistory.length > 0) {
          const upsertHoldStmt = db.prepare(`
            INSERT INTO hold_history (id, panel_id, stage_number, held_at, resumed_at, reason)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              resumed_at = excluded.resumed_at,
              reason = excluded.reason
          `);

          for (const hh of holdHistory) {
            upsertHoldStmt.run(
              hh.id, hh.panel_id, hh.stage_number, hh.held_at, hh.resumed_at, hh.reason
            );
          }
        }

        // Upsert What-If Scenarios
        if (whatIfScenarios.length > 0) {
          const upsertScenStmt = db.prepare(`
            INSERT INTO what_if_scenarios (id, name, notes, scenario_data, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              notes = excluded.notes,
              scenario_data = excluded.scenario_data
          `);

          for (const sc of whatIfScenarios) {
            upsertScenStmt.run(
              sc.id, sc.name, sc.notes,
              typeof sc.scenario_data === 'string' ? sc.scenario_data : JSON.stringify(sc.scenario_data || {}),
              sc.created_by, sc.created_at || new Date().toISOString()
            );
          }
        }

        // Upsert Audit Logs with Stable IDs
        if (auditLogs.length > 0) {
          const upsertAuditStmt = db.prepare(`
            INSERT INTO audit_logs (id, timestamp, user_id, username, action, entity_type, entity_id, details)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              timestamp = excluded.timestamp,
              user_id = excluded.user_id,
              username = excluded.username,
              action = excluded.action,
              entity_type = excluded.entity_type,
              entity_id = excluded.entity_id,
              details = excluded.details
          `);

          for (const al of auditLogs) {
            upsertAuditStmt.run(
              al.id, al.timestamp, al.user_id, al.username,
              al.action, al.entity_type, al.entity_id, al.details
            );
          }
        }

        // Record Audit Log for restore execution
        db.prepare(`
          INSERT INTO audit_logs (id, timestamp, user_id, username, action, entity_type, entity_id, details)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          'log_' + crypto.randomUUID(),
          new Date().toISOString(),
          req.user.id,
          req.user.username,
          'RESTORE_DATABASE',
          'SYSTEM',
          null,
          `Restored ${panels.length} panels, ${stageHistory.length} stage histories, ${holdHistory.length} hold records, ${monthlyPlans.length} plans, ${dailyStatus.length} daily entries, ${subAssembly.length} subassemblies, ${whatIfScenarios.length} scenarios, ${auditLogs.length} audit logs.`
        );
      });

      runAtomicRestore();

      return res.json({
        message: 'Restore completed successfully with ID-based merge.',
        mergedCounts: {
          panels: panels.length,
          stageHistories: stageHistory.length,
          holdHistories: holdHistory.length,
          monthlyPlans: monthlyPlans.length,
          dailyStatus: dailyStatus.length,
          subAssemblies: subAssembly.length,
          scenarios: whatIfScenarios.length,
          auditLogs: auditLogs.length
        }
      });
    } catch (error) {
      console.error('Error executing restore:', error);
      return res.status(500).json({ error: 'Restore operation failed.' });
    }
  }
}

