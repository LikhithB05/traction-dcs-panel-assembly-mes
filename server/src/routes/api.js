import { Router } from 'express';
import { login, getCurrentUser, logout } from '../auth/authController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { requireAdmin } from '../middleware/permissionMiddleware.js';
import { PanelController } from '../controllers/panelController.js';
import { PlanController } from '../controllers/planController.js';
import { DailyController } from '../controllers/dailyController.js';
import { OverviewController } from '../controllers/overviewController.js';
import { BackupController } from '../controllers/backupController.js';
import { SimulatorController } from '../controllers/simulatorController.js';
import { MasterDataController } from '../controllers/masterDataController.js';
import { ReportController } from '../controllers/reportController.js';
import { CustomManpowerController } from '../controllers/customManpowerController.js';

const router = Router();

// === AUTHENTICATION ROUTES ===
router.post('/auth/login', login);
router.get('/auth/me', authenticateToken, getCurrentUser);
router.post('/auth/logout', authenticateToken, logout);

// === MASTER DATA (Accessible to authenticated users) ===
router.get('/master-data', authenticateToken, MasterDataController.getMasterData);

// === CUSTOM MANPOWER & TEAMS ("Others") ===
router.get('/custom-manpower', authenticateToken, CustomManpowerController.getCustomManpower);
router.post('/custom-manpower', authenticateToken, CustomManpowerController.createCustomManpower);
router.patch('/custom-manpower/:id', authenticateToken, CustomManpowerController.updateCustomManpower);
router.delete('/custom-manpower/:id', authenticateToken, requireAdmin, CustomManpowerController.deleteCustomManpower);

// === EXECUTE: PANELS ROUTES ===
router.get('/panels', authenticateToken, PanelController.getPanels);
router.get('/panels/:id', authenticateToken, PanelController.getPanelById);
router.post('/panels', authenticateToken, PanelController.createPanel);
router.post('/panels/bulk-import', authenticateToken, PanelController.bulkImportPanels);
router.patch('/panels/:id/admin-edit', authenticateToken, requireAdmin, PanelController.adminEditPanel);
router.post('/panels/:id/start', authenticateToken, PanelController.startStage);
router.post('/panels/:id/complete', authenticateToken, PanelController.completeStage);
router.post('/panels/:id/undo', authenticateToken, requireAdmin, PanelController.undoStageCompletion);
router.post('/panels/:id/hold', authenticateToken, PanelController.holdStage);
router.post('/panels/:id/resume', authenticateToken, PanelController.resumeStage);
router.delete('/panels/:id', authenticateToken, requireAdmin, PanelController.deletePanel);

// === PRODUCTION REPORTS & ACTUAL WORK COMPARISON ===
router.get('/reports/production', authenticateToken, ReportController.getProductionReport);
router.get('/reports/production/csv', authenticateToken, ReportController.exportProductionReportCSV);

// === PLAN: TARGETS & CAPACITY ROUTES ===
router.get('/plans', authenticateToken, PlanController.getMonthlyPlan);
router.post('/plans', authenticateToken, PlanController.updateMonthlyPlan);

// === DAILY STATUS & SUB-ASSEMBLY ROUTES ===
router.get('/daily-status', authenticateToken, DailyController.getDailyStatus);
router.post('/daily-status', authenticateToken, DailyController.updateDailyStatus);
router.get('/sub-assemblies', authenticateToken, DailyController.getSubAssemblies);
router.post('/sub-assemblies', authenticateToken, DailyController.updateSubAssembly);

// === OVERVIEW & BOTTLENECK ANALYSIS ===
router.get('/overview', authenticateToken, OverviewController.getOverview);

// === WHAT-IF SIMULATOR ROUTES ===
router.post('/simulator/simulate', authenticateToken, SimulatorController.runSimulation);
router.get('/simulator/scenarios', authenticateToken, SimulatorController.getScenarios);
router.post('/simulator/scenarios', authenticateToken, SimulatorController.saveScenario);
router.delete('/simulator/scenarios/:id', authenticateToken, SimulatorController.deleteScenario);

// === BACKUP & MASTER DATA (Admin Only for Backup/Restore) ===
router.get('/backup/counts', authenticateToken, BackupController.getLiveRecordCounts);
router.get('/backup/export-json', authenticateToken, requireAdmin, BackupController.exportFullBackupJSON);
router.get('/backup/export-csv', authenticateToken, requireAdmin, BackupController.exportPanelsCSV);
router.post('/backup/restore', authenticateToken, requireAdmin, BackupController.restoreFromJSON);

export default router;
