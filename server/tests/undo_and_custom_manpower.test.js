import test from 'node:test';
import assert from 'node:assert';
import { startServer } from '../src/server.js';

test('Undo Workflow & Customizable Manpower (Others) Test Suite', async (t) => {
  const { server } = await startServer(5030, ':memory:');

  const loginUser = async (username, pin) => {
    const res = await fetch('http://localhost:5030/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, pin })
    });
    const data = await res.json();
    return data.token;
  };

  const ksmToken = await loginUser('ksm', 'dev-ksm-pin');
  const pdrToken = await loginUser('pdr', 'dev-pdr-pin');
  const crmToken = await loginUser('crm', 'dev-crm-pin');
  const akrToken = await loginUser('akr', 'dev-akr-pin'); // Master Admin

  // Helper to create a panel
  const createTestPanel = async (id, type) => {
    const res = await fetch('http://localhost:5030/api/panels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ksmToken}` },
      body: JSON.stringify({
        id,
        type,
        project: `Test Project ${id}`,
        priority: 'High',
        startDate: '2026-10-01',
        dueDate: '2026-11-30'
      })
    });
    assert.strictEqual(res.status, 201, `Failed to create panel ${id}`);
  };

  // ==========================================
  // 1. CUSTOM MANPOWER ("OTHERS") TESTS
  // ==========================================
  await t.test('1. Custom Worker & Team Creation, Validation, and Permissions', async () => {
    // 1.1 Existing registered workers still appear in master data
    const mdRes = await fetch('http://localhost:5030/api/master-data', {
      headers: { Authorization: `Bearer ${ksmToken}` }
    });
    const md = await mdRes.json();
    const stage1Workers = md.workflows.traction.find(s => s.stageNumber === 1).eligibleWorkers;
    assert.ok(stage1Workers.includes('KSM-OP-1'), 'KSM-OP-1 must be present');
    assert.ok(stage1Workers.includes('KSM-OP-2'), 'KSM-OP-2 must be present');

    // 1.2 Validation: Blank or invalid names are rejected
    const badRes1 = await fetch('http://localhost:5030/api/custom-manpower', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ksmToken}` },
      body: JSON.stringify({ area: 'KSM', type: 'worker', name: '   ' })
    });
    assert.strictEqual(badRes1.status, 400, 'Blank name must be rejected');

    const badRes2 = await fetch('http://localhost:5030/api/custom-manpower', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pdrToken}` },
      body: JSON.stringify({ area: 'PDR', type: 'team', name: 'PDR Team 7', members: '' })
    });
    assert.strictEqual(badRes2.status, 400, 'Team without members must be rejected');

    // 1.3 Role enforcement: KSM cannot create worker in PDR
    const forbiddenRes = await fetch('http://localhost:5030/api/custom-manpower', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ksmToken}` },
      body: JSON.stringify({ area: 'PDR', type: 'worker', name: 'Unauthorized Worker' })
    });
    assert.strictEqual(forbiddenRes.status, 403, 'KSM cannot create custom worker in PDR');

    // 1.4 Valid custom worker creation by KSM for KSM
    const createWorkerRes = await fetch('http://localhost:5030/api/custom-manpower', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ksmToken}` },
      body: JSON.stringify({ area: 'KSM', type: 'worker', name: 'Ram' })
    });
    assert.strictEqual(createWorkerRes.status, 201);
    const workerData = await createWorkerRes.json();
    assert.strictEqual(workerData.data.name, 'Ram');
    assert.strictEqual(workerData.data.area, 'KSM');

    // 1.5 Duplicate handling: Submitting same worker again returns existing safely
    const dupRes = await fetch('http://localhost:5030/api/custom-manpower', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ksmToken}` },
      body: JSON.stringify({ area: 'KSM', type: 'worker', name: 'Ram' })
    });
    assert.strictEqual(dupRes.status, 200, 'Duplicate submission handled safely');

    // 1.6 Custom team creation with multiple members by PDR
    const createTeamRes = await fetch('http://localhost:5030/api/custom-manpower', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pdrToken}` },
      body: JSON.stringify({
        area: 'PDR',
        type: 'team',
        name: 'PDR Team 7',
        members: 'TEAM-OP-A, TEAM-OP-B, TEAM-OP-C'
      })
    });
    assert.strictEqual(createTeamRes.status, 201);
    const teamData = await createTeamRes.json();
    assert.strictEqual(teamData.data.name, 'PDR Team 7');
    assert.strictEqual(teamData.data.members, 'TEAM-OP-A, TEAM-OP-B, TEAM-OP-C');

    // 1.7 Master Admin (AKR) global creation for CRM
    const adminCreateRes = await fetch('http://localhost:5030/api/custom-manpower', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${akrToken}` },
      body: JSON.stringify({
        area: 'CRM',
        type: 'team',
        name: 'CRM Team 10',
        members: 'Mithilesh G + Arun K'
      })
    });
    assert.strictEqual(adminCreateRes.status, 201);

    // 1.8 Verify master-data attaches custom workers to stage eligibility
    const updatedMdRes = await fetch('http://localhost:5030/api/master-data', {
      headers: { Authorization: `Bearer ${ksmToken}` }
    });
    const updatedMd = await updatedMdRes.json();
    const updatedStage1 = updatedMd.workflows.traction.find(s => s.stageNumber === 1);
    assert.ok(updatedStage1.eligibleWorkers.includes('Ram'), "Custom worker 'Ram' must appear in Stage 1 eligible workers");
    const updatedStage3 = updatedMd.workflows.traction.find(s => s.stageNumber === 3);
    assert.ok(updatedStage3.eligibleWorkers.includes('PDR Team 7'), "Custom team 'PDR Team 7' must appear in Stage 3");
    assert.ok(updatedStage3.eligibleWorkers.includes('CRM Team 10'), "Custom team 'CRM Team 10' must appear in Stage 3");

    // 1.9 Deactivation: Deactivated custom worker is excluded from active list
    const patchRes = await fetch(`http://localhost:5030/api/custom-manpower/${workerData.data.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ksmToken}` },
      body: JSON.stringify({ is_active: 0 })
    });
    assert.strictEqual(patchRes.status, 200);

    const activeListRes = await fetch('http://localhost:5030/api/custom-manpower?area=KSM', {
      headers: { Authorization: `Bearer ${ksmToken}` }
    });
    const activeList = await activeListRes.json();
    assert.ok(!activeList.some(w => w.name === 'Ram'), "'Ram' must be omitted from active list when deactivated");

    // Reactivate 'Ram' for subsequent workflow tests
    await fetch(`http://localhost:5030/api/custom-manpower/${workerData.data.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ksmToken}` },
      body: JSON.stringify({ is_active: 1 })
    });
  });

  // ==========================================
  // 2. STAGE START WITH CUSTOM WORKERS / TEAMS
  // ==========================================
  await t.test('2. Stage Execution Using Custom Workers & Teams', async () => {
    await createTestPanel('TR-CUSTOM-01', 'Traction');

    // Stage 1: Assign custom worker 'Ram'
    const startRes = await fetch('http://localhost:5030/api/panels/TR-CUSTOM-01/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ksmToken}` },
      body: JSON.stringify({ assignedTo: 'Ram' })
    });
    assert.strictEqual(startRes.status, 200, "Must successfully start stage with custom worker 'Ram'");

    let panelRes = await fetch('http://localhost:5030/api/panels/TR-CUSTOM-01', {
      headers: { Authorization: `Bearer ${ksmToken}` }
    });
    let panel = await panelRes.json();
    assert.strictEqual(panel.status, 'In Progress');
    assert.strictEqual(panel.assigned_to, 'Ram');

    // Complete Stage 1
    const completeRes1 = await fetch('http://localhost:5030/api/panels/TR-CUSTOM-01/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ksmToken}` },
      body: JSON.stringify({})
    });
    assert.strictEqual(completeRes1.status, 200);

    // Verify stage 1 history recorded 'Ram'
    panelRes = await fetch('http://localhost:5030/api/panels/TR-CUSTOM-01', {
      headers: { Authorization: `Bearer ${ksmToken}` }
    });
    panel = await panelRes.json();
    const sh1 = panel.stageHistory.find(s => s.stage_number === 1);
    assert.strictEqual(sh1.assigned_to, 'Ram');
    assert.ok(sh1.completed_at, 'Stage 1 must have completed_at timestamp');
  });

  // ==========================================
  // 3. UNDO LAST STAGE COMPLETION TESTS
  // ==========================================
  await t.test('3. Undo Last Stage Completion: Core & Safety Rules', async () => {
    // 3.1 Non-admin unauthorized attempt is rejected (403 Forbidden)
    const unauthorizedUndo = await fetch('http://localhost:5030/api/panels/TR-CUSTOM-01/undo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ksmToken}` },
      body: JSON.stringify({ reason: 'KSM attempt' })
    });
    assert.strictEqual(unauthorizedUndo.status, 403, 'Non-admin users must be rejected with 403');

    // 3.2 Ineligible state: Cannot undo stage that is currently in progress
    await createTestPanel('TR-INPROG-01', 'Traction');
    await fetch('http://localhost:5030/api/panels/TR-INPROG-01/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ksmToken}` },
      body: JSON.stringify({ assignedTo: 'KSM-OP-1' })
    });
    const inProgUndo = await fetch('http://localhost:5030/api/panels/TR-INPROG-01/undo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${akrToken}` },
      body: JSON.stringify({ reason: 'Try undo in progress' })
    });
    assert.strictEqual(inProgUndo.status, 400, 'Cannot undo stage in progress');
    const inProgErr = await inProgUndo.json();
    assert.ok(inProgErr.error.includes('In Progress'), 'Must explain that stage is in progress');

    // 3.3 Boundary condition: Cannot undo panel at Stage 1 Waiting (no completions exist)
    await createTestPanel('TR-STG1-01', 'Traction');
    const stg1Undo = await fetch('http://localhost:5030/api/panels/TR-STG1-01/undo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${akrToken}` },
      body: JSON.stringify({ reason: 'Try undo Stage 1' })
    });
    assert.strictEqual(stg1Undo.status, 400, 'Cannot undo panel with no completions');
    const stg1Err = await stg1Undo.json();
    assert.ok(stg1Err.error.includes('initial workflow stage') || stg1Err.error.includes('No completed'), 'Boundary error message required');

    // 3.4 Valid Undo: Panel TR-CUSTOM-01 completed Stage 1 and is currently at Stage 2 Waiting
    // Undoing Stage 1 completion must return panel to Stage 1
    const validUndo = await fetch('http://localhost:5030/api/panels/TR-CUSTOM-01/undo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${akrToken}` },
      body: JSON.stringify({ reason: 'Mechanical alignment inspection needed' })
    });
    assert.strictEqual(validUndo.status, 200, 'Valid undo must succeed');
    const undoData = await validUndo.json();
    assert.strictEqual(undoData.targetStage.stageNumber, 1);
    assert.strictEqual(undoData.reversedStage.stageNumber, 1);

    // Verify panel state after undo
    let panelRes = await fetch('http://localhost:5030/api/panels/TR-CUSTOM-01', {
      headers: { Authorization: `Bearer ${ksmToken}` }
    });
    let panel = await panelRes.json();
    assert.strictEqual(panel.current_stage, 1, 'Panel must be at Stage 1');
    assert.strictEqual(panel.status, 'Waiting', 'Panel status must be Waiting');
    assert.strictEqual(panel.current_area, 'KSM', 'Panel area must be KSM');

    // 3.5 Original completion history is preserved, not deleted
    const undoneRecord = panel.stageHistory.find(s => s.undone_at !== null && s.stage_number === 1);
    assert.ok(undoneRecord, 'Original completed record must exist in stageHistory');
    assert.ok(undoneRecord.completed_at, 'Original completed_at timestamp must be preserved');
    assert.ok(undoneRecord.undone_at, 'undone_at timestamp must be recorded');
    assert.strictEqual(undoneRecord.undone_by, 'akr', 'undone_by must record user');
    assert.strictEqual(undoneRecord.undo_reason, 'Mechanical alignment inspection needed', 'undo_reason must be captured');

    // 3.6 Panel can complete Stage 1 AGAIN normally through normal workflow
    const restartRes = await fetch('http://localhost:5030/api/panels/TR-CUSTOM-01/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ksmToken}` },
      body: JSON.stringify({ assignedTo: 'KSM-OP-1' })
    });
    assert.strictEqual(restartRes.status, 200, 'Stage 1 can be started again');

    const recompleteRes = await fetch('http://localhost:5030/api/panels/TR-CUSTOM-01/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ksmToken}` },
      body: JSON.stringify({})
    });
    assert.strictEqual(recompleteRes.status, 200, 'Stage 1 can be completed again');

    panelRes = await fetch('http://localhost:5030/api/panels/TR-CUSTOM-01', {
      headers: { Authorization: `Bearer ${ksmToken}` }
    });
    panel = await panelRes.json();
    assert.strictEqual(panel.current_stage, 2, 'Panel advanced to Stage 2 after re-completion');
  });

  // =========================================================================
  // 4. REPEATED, ONE-STAGE-AT-A-TIME UNDO FROM STAGE 8 DOWN TO STAGE 1 (TRACTION)
  // =========================================================================
  await t.test('4. Traction Repeated Undo: Full Lifecycle 1 -> 8 -> 1', async () => {
    await createTestPanel('TR-LIFECYCLE', 'Traction');

    const advanceStage = async (stageNum, worker, token) => {
      const s = await fetch('http://localhost:5030/api/panels/TR-LIFECYCLE/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ assignedTo: worker })
      });
      assert.strictEqual(s.status, 200, `Failed starting stage ${stageNum}`);
      const c = await fetch('http://localhost:5030/api/panels/TR-LIFECYCLE/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({})
      });
      assert.strictEqual(c.status, 200, `Failed completing stage ${stageNum}`);
    };

    // Complete all 8 stages
    await advanceStage(1, 'KSM-OP-1', ksmToken);
    await advanceStage(2, 'PDR-MECH-1', pdrToken);
    await advanceStage(3, 'PDR Team 1', pdrToken);
    await advanceStage(4, 'PDR-MECH-3', pdrToken);
    await advanceStage(5, 'PDR Team 6', pdrToken);
    await advanceStage(6, 'Testing Team (KSM Tracked)', ksmToken);
    await advanceStage(7, 'KSM-OP-2', ksmToken);
    await advanceStage(8, 'KSM Despatch', ksmToken);

    // Verify panel is Done
    let res = await fetch('http://localhost:5030/api/panels/TR-LIFECYCLE', {
      headers: { Authorization: `Bearer ${ksmToken}` }
    });
    let panel = await res.json();
    assert.strictEqual(panel.status, 'Done', 'Panel must be in Done status');
    assert.strictEqual(panel.current_stage, 8);

    // Step-by-step repeated undo: 8 -> 7 -> 6 -> 5 -> 4 -> 3 -> 2 -> 1
    const expectedTargets = [8, 7, 6, 5, 4, 3, 2, 1];

    for (const expectedTarget of expectedTargets) {
      const undoRes = await fetch('http://localhost:5030/api/panels/TR-LIFECYCLE/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${akrToken}` },
        body: JSON.stringify({ reason: `Repeated undo step to stage ${expectedTarget}` })
      });
      assert.strictEqual(undoRes.status, 200, `Failed undoing to target stage ${expectedTarget}`);
      const uData = await undoRes.json();
      assert.strictEqual(uData.targetStage.stageNumber, expectedTarget);

      // Verify panel status
      res = await fetch('http://localhost:5030/api/panels/TR-LIFECYCLE', {
        headers: { Authorization: `Bearer ${ksmToken}` }
      });
      panel = await res.json();
      assert.strictEqual(panel.current_stage, expectedTarget);
      assert.strictEqual(panel.status, 'Waiting');
    }

    // Now at Stage 1 Waiting: Attempting another undo must be rejected
    const finalUndoAttempt = await fetch('http://localhost:5030/api/panels/TR-LIFECYCLE/undo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${akrToken}` },
      body: JSON.stringify({ reason: 'Attempt undo before stage 1' })
    });
    assert.strictEqual(finalUndoAttempt.status, 400, 'Cannot undo beyond Stage 1');
  });

  // =========================================================================
  // 5. DCS 6-STAGE WORKFLOW UNDO & REPORT INTEGRITY
  // =========================================================================
  await t.test('5. DCS Workflow Undo & Production Report Integrity', async () => {
    await createTestPanel('DCS-LIFECYCLE', 'DCS');

    const advanceDcs = async (stageNum, worker, token) => {
      const s = await fetch('http://localhost:5030/api/panels/DCS-LIFECYCLE/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ assignedTo: worker })
      });
      assert.strictEqual(s.status, 200, `DCS start stage ${stageNum}`);
      const c = await fetch('http://localhost:5030/api/panels/DCS-LIFECYCLE/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({})
      });
      assert.strictEqual(c.status, 200, `DCS complete stage ${stageNum}`);
    };

    // Complete all 6 DCS stages
    await advanceDcs(1, 'KSM-OP-1', ksmToken);
    await advanceDcs(2, 'PDR-MECH-1', pdrToken);
    await advanceDcs(3, 'CRM Team 1', crmToken);
    await advanceDcs(4, 'KSM QC', ksmToken);
    await advanceDcs(5, 'KSM-OP-2', ksmToken);
    await advanceDcs(6, 'KSM Despatch', ksmToken);

    // Verify DCS Done
    let res = await fetch('http://localhost:5030/api/panels/DCS-LIFECYCLE', {
      headers: { Authorization: `Bearer ${ksmToken}` }
    });
    let panel = await res.json();
    assert.strictEqual(panel.status, 'Done');
    assert.strictEqual(panel.current_stage, 6);

    // Undo from Done: returns to Stage 6 (PQ & Dispatch)
    let undoRes = await fetch('http://localhost:5030/api/panels/DCS-LIFECYCLE/undo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${akrToken}` },
      body: JSON.stringify({ reason: 'DCS Despatch re-check' })
    });
    assert.strictEqual(undoRes.status, 200);
    let uData = await undoRes.json();
    assert.strictEqual(uData.targetStage.stageNumber, 6);

    // Undo Stage 5 completion: returns to Stage 5 (PD Activity)
    undoRes = await fetch('http://localhost:5030/api/panels/DCS-LIFECYCLE/undo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${akrToken}` },
      body: JSON.stringify({ reason: 'PD Activity touch up' })
    });
    assert.strictEqual(undoRes.status, 200);
    uData = await undoRes.json();
    assert.strictEqual(uData.targetStage.stageNumber, 5);

    // Production reports continue to work and return valid data
    const reportRes = await fetch(`http://localhost:5030/api/reports/production?startDate=${new Date(Date.now() - 86400000).toISOString().slice(0, 10)}&endDate=${new Date(Date.now() + 86400000).toISOString().slice(0, 10)}`, {
      headers: { Authorization: `Bearer ${ksmToken}` }
    });
    assert.strictEqual(reportRes.status, 200);
    const report = await reportRes.json();
    assert.ok(report.records.length > 0, 'Production report records must exist');
    assert.ok(report.summary.totalCompletedStages > 0, 'Completed stages metric must be intact');
  });

  server.close();
});
