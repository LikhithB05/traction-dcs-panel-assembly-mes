import test from 'node:test';
import assert from 'node:assert';
import { startServer } from '../src/server.js';

test('Workflow Engine & Enhanced Features Test Suite', async (t) => {
  const { server } = await startServer(5003, ':memory:');

  // Obtain tokens for KSM, PDR, CRM, AKR (admin)
  const loginUser = async (username, pin) => {
    const res = await fetch('http://localhost:5003/api/auth/login', {
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
  const akrToken = await loginUser('akr', 'dev-akr-pin');

  await t.test('Feature 6 & 5.1-5.3: Complete Traction 8-Stage Lifecycle with HV CRM access, Stage 4 Independent Assignment, and KSM-OP-2 PD Activity', async () => {
    // 1. Panel Registration with flexible past start date
    const createRes = await fetch('http://localhost:5003/api/panels', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ksmToken}`
      },
      body: JSON.stringify({
        id: 'TR-200',
        type: 'Traction',
        project: 'Freight Loco Project',
        priority: 'High',
        startDate: '2026-10-01',
        dueDate: '2026-11-30'
      })
    });
    assert.strictEqual(createRes.status, 201);

    // Verify initial state
    let panelRes = await fetch('http://localhost:5003/api/panels/TR-200', {
      headers: { Authorization: `Bearer ${ksmToken}` }
    });
    let panel = await panelRes.json();
    assert.strictEqual(panel.current_stage, 1);
    assert.strictEqual(panel.current_area, 'KSM');
    assert.strictEqual(panel.status, 'Waiting');
    assert.strictEqual(panel.start_date, '2026-10-01');

    // Stage 1: Mech Stage 1 (KSM) - KSM-OP-1
    let startRes = await fetch('http://localhost:5003/api/panels/TR-200/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ksmToken}` },
      body: JSON.stringify({ assignedTo: 'KSM-OP-1' })
    });
    assert.strictEqual(startRes.status, 200);

    let compRes = await fetch('http://localhost:5003/api/panels/TR-200/complete', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ksmToken}` }
    });
    assert.strictEqual(compRes.status, 200);

    // Stage 2: Mech Stage 2 (PDR) - PDR-MECH-1
    panelRes = await fetch('http://localhost:5003/api/panels/TR-200', {
      headers: { Authorization: `Bearer ${pdrToken}` }
    });
    panel = await panelRes.json();
    assert.strictEqual(panel.current_stage, 2);
    assert.strictEqual(panel.current_area, 'PDR');

    startRes = await fetch('http://localhost:5003/api/panels/TR-200/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pdrToken}` },
      body: JSON.stringify({ assignedTo: 'PDR-MECH-1', confirmedOverload: true })
    });
    assert.strictEqual(startRes.status, 200);

    compRes = await fetch('http://localhost:5003/api/panels/TR-200/complete', {
      method: 'POST',
      headers: { Authorization: `Bearer ${pdrToken}` }
    });
    assert.strictEqual(compRes.status, 200);

    // Stage 3: High-Voltage (HV) Stage - FEATURE 5.1: Accessible to CRM as well as PDR!
    panelRes = await fetch('http://localhost:5003/api/panels/TR-200', {
      headers: { Authorization: `Bearer ${crmToken}` }
    });
    panel = await panelRes.json();
    assert.strictEqual(panel.current_stage, 3);
    assert.strictEqual(panel.stageName, 'HV Cabling');

    // Start Stage 3 using CRM token (proves CRM has HV stage authorization)
    startRes = await fetch('http://localhost:5003/api/panels/TR-200/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${crmToken}` },
      body: JSON.stringify({ assignedTo: 'CRM Team 1', confirmedOverload: true })
    });
    assert.strictEqual(startRes.status, 200);

    // Complete Stage 3 by CRM
    compRes = await fetch('http://localhost:5003/api/panels/TR-200/complete', {
      method: 'POST',
      headers: { Authorization: `Bearer ${crmToken}` }
    });
    assert.strictEqual(compRes.status, 200);

    // Stage 4: Mech Stage 3 (PDR) - FEATURE 5.2: PDR-MECH-1 did Stage 2, now assign PDR-MECH-4 (MUST SUCCEED!)
    panelRes = await fetch('http://localhost:5003/api/panels/TR-200', {
      headers: { Authorization: `Bearer ${pdrToken}` }
    });
    panel = await panelRes.json();
    assert.strictEqual(panel.current_stage, 4);

    startRes = await fetch('http://localhost:5003/api/panels/TR-200/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pdrToken}` },
      body: JSON.stringify({ assignedTo: 'PDR-MECH-4', confirmedOverload: true })
    });
    assert.strictEqual(startRes.status, 200, 'Mechanical Stage 3 should be assignable to PDR-MECH-4 even if PDR-MECH-1 did Stage 2');

    compRes = await fetch('http://localhost:5003/api/panels/TR-200/complete', {
      method: 'POST',
      headers: { Authorization: `Bearer ${pdrToken}` }
    });
    assert.strictEqual(compRes.status, 200);

    // Stage 5: Low-Voltage (LV) Wiring (PDR)
    startRes = await fetch('http://localhost:5003/api/panels/TR-200/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pdrToken}` },
      body: JSON.stringify({ assignedTo: 'PDR Team 6', confirmedOverload: true })
    });
    assert.strictEqual(startRes.status, 200);

    compRes = await fetch('http://localhost:5003/api/panels/TR-200/complete', {
      method: 'POST',
      headers: { Authorization: `Bearer ${pdrToken}` }
    });
    assert.strictEqual(compRes.status, 200);

    // Stage 6: Consolidated Stage - 'Two-Test QC & Testing' (QSM area)
    panelRes = await fetch('http://localhost:5003/api/panels/TR-200', {
      headers: { Authorization: `Bearer ${ksmToken}` }
    });
    panel = await panelRes.json();
    assert.strictEqual(panel.current_stage, 6);
    assert.strictEqual(panel.stageName, 'Two-Test QC & Testing');

    startRes = await fetch('http://localhost:5003/api/panels/TR-200/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ksmToken}` },
      body: JSON.stringify({ assignedTo: 'KSM QC' })
    });
    assert.strictEqual(startRes.status, 200);

    compRes = await fetch('http://localhost:5003/api/panels/TR-200/complete', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ksmToken}` }
    });
    assert.strictEqual(compRes.status, 200);

    // Stage 7: PD Activity (QSM area) - FEATURE 5.3: KSM-OP-2 is eligible!
    panelRes = await fetch('http://localhost:5003/api/panels/TR-200', {
      headers: { Authorization: `Bearer ${ksmToken}` }
    });
    panel = await panelRes.json();
    assert.strictEqual(panel.current_stage, 7);
    assert.strictEqual(panel.stageName, 'PD Activity');

    startRes = await fetch('http://localhost:5003/api/panels/TR-200/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ksmToken}` },
      body: JSON.stringify({ assignedTo: 'KSM-OP-2' })
    });
    assert.strictEqual(startRes.status, 200, 'KSM-OP-2 should be eligible for PD Activity');

    compRes = await fetch('http://localhost:5003/api/panels/TR-200/complete', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ksmToken}` }
    });
    assert.strictEqual(compRes.status, 200);

    // Stage 8: Consolidated Stage - 'PQ & Dispatch' (QSM area)
    panelRes = await fetch('http://localhost:5003/api/panels/TR-200', {
      headers: { Authorization: `Bearer ${ksmToken}` }
    });
    panel = await panelRes.json();
    assert.strictEqual(panel.current_stage, 8);
    assert.strictEqual(panel.stageName, 'PQ & Dispatch');

    startRes = await fetch('http://localhost:5003/api/panels/TR-200/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ksmToken}` },
      body: JSON.stringify({ assignedTo: 'KSM Despatch' })
    });
    assert.strictEqual(startRes.status, 200);

    compRes = await fetch('http://localhost:5003/api/panels/TR-200/complete', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ksmToken}` }
    });
    assert.strictEqual(compRes.status, 200);

    // Verify Final Status is 'Done' with 8 total stages
    panelRes = await fetch('http://localhost:5003/api/panels/TR-200', {
      headers: { Authorization: `Bearer ${ksmToken}` }
    });
    panel = await panelRes.json();
    assert.strictEqual(panel.status, 'Done');
    assert.strictEqual(panel.stageHistory.length, 8);
  });

  await t.test('Feature 6: Complete DCS 6-Stage Consolidated Lifecycle (DCS-200) to Done', async () => {
    // 1. Panel Registration: DCS-200
    const createRes = await fetch('http://localhost:5003/api/panels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ksmToken}` },
      body: JSON.stringify({
        id: 'DCS-200',
        type: 'DCS',
        project: 'Thermal Plant DCS',
        priority: 'High',
        startDate: '2026-10-05',
        dueDate: '2026-12-15'
      })
    });
    assert.strictEqual(createRes.status, 201);

    // Stage 1: Door / Side Cover (KSM) - KSM-OP-1
    await fetch('http://localhost:5003/api/panels/DCS-200/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ksmToken}` },
      body: JSON.stringify({ assignedTo: 'KSM-OP-1' })
    });
    await fetch('http://localhost:5003/api/panels/DCS-200/complete', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ksmToken}` }
    });

    // Stage 2: Mechanical (PDR) - PDR-MECH-3
    await fetch('http://localhost:5003/api/panels/DCS-200/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pdrToken}` },
      body: JSON.stringify({ assignedTo: 'PDR-MECH-3', confirmedOverload: true })
    });
    await fetch('http://localhost:5003/api/panels/DCS-200/complete', {
      method: 'POST',
      headers: { Authorization: `Bearer ${pdrToken}` }
    });

    // Stage 3: Wiring (CRM) - CRM Team 2
    await fetch('http://localhost:5003/api/panels/DCS-200/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${crmToken}` },
      body: JSON.stringify({ assignedTo: 'CRM Team 2', confirmedOverload: true })
    });
    await fetch('http://localhost:5003/api/panels/DCS-200/complete', {
      method: 'POST',
      headers: { Authorization: `Bearer ${crmToken}` }
    });

    // Stage 4: Consolidated Stage - 'Two-Test QC & Testing' (QSM)
    let pRes = await fetch('http://localhost:5003/api/panels/DCS-200', {
      headers: { Authorization: `Bearer ${ksmToken}` }
    });
    let panelObj = await pRes.json();
    assert.strictEqual(panelObj.current_stage, 4);
    assert.strictEqual(panelObj.stageName, 'Two-Test QC & Testing');

    await fetch('http://localhost:5003/api/panels/DCS-200/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ksmToken}` },
      body: JSON.stringify({ assignedTo: 'KSM QC' })
    });
    await fetch('http://localhost:5003/api/panels/DCS-200/complete', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ksmToken}` }
    });

    // Stage 5: PD Activity (QSM) - FEATURE 5.3: KSM-OP-1 is eligible!
    pRes = await fetch('http://localhost:5003/api/panels/DCS-200', {
      headers: { Authorization: `Bearer ${ksmToken}` }
    });
    panelObj = await pRes.json();
    assert.strictEqual(panelObj.current_stage, 5);
    assert.strictEqual(panelObj.stageName, 'PD Activity');

    await fetch('http://localhost:5003/api/panels/DCS-200/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ksmToken}` },
      body: JSON.stringify({ assignedTo: 'KSM-OP-1' })
    });
    await fetch('http://localhost:5003/api/panels/DCS-200/complete', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ksmToken}` }
    });

    // Stage 6: Consolidated Stage - 'PQ & Dispatch' (QSM)
    pRes = await fetch('http://localhost:5003/api/panels/DCS-200', {
      headers: { Authorization: `Bearer ${ksmToken}` }
    });
    panelObj = await pRes.json();
    assert.strictEqual(panelObj.current_stage, 6);
    assert.strictEqual(panelObj.stageName, 'PQ & Dispatch');

    await fetch('http://localhost:5003/api/panels/DCS-200/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ksmToken}` },
      body: JSON.stringify({ assignedTo: 'KSM Despatch' })
    });
    await fetch('http://localhost:5003/api/panels/DCS-200/complete', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ksmToken}` }
    });

    // Verify Final Status is 'Done' with all 6 stages
    const finalRes = await fetch('http://localhost:5003/api/panels/DCS-200', {
      headers: { Authorization: `Bearer ${ksmToken}` }
    });
    const finalPanel = await finalRes.json();
    assert.strictEqual(finalPanel.status, 'Done');
    assert.strictEqual(finalPanel.stageHistory.length, 6);
  });

  await t.test('Feature 3: Bulk Execution Panel Import from Excel', async () => {
    // 1. Unauthorized user cannot bulk import
    const unauthRes = await fetch('http://localhost:5003/api/panels/bulk-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pdrToken}` },
      body: JSON.stringify({
        panels: [{ id: 'TR-999', type: 'Traction', project: 'Test', dueDate: '2026-12-31' }]
      })
    });
    assert.strictEqual(unauthRes.status, 403);

    // 2. Missing required fields validation
    const missingRes = await fetch('http://localhost:5003/api/panels/bulk-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ksmToken}` },
      body: JSON.stringify({
        panels: [
          { id: '', type: 'Traction', project: 'Missing ID', dueDate: '2026-12-31' },
          { id: 'TR-801', type: 'InvalidType', project: 'Bad Type', dueDate: '2026-12-31' },
          { id: 'TR-802', type: 'Traction', project: 'Bad Dates', startDate: '2026-12-31', dueDate: '2026-12-01' }
        ]
      })
    });
    assert.strictEqual(missingRes.status, 400);
    const missingData = await missingRes.json();
    assert.strictEqual(missingData.failedCount, 3);

    // 3. Duplicate ID in payload validation
    const dupRes = await fetch('http://localhost:5003/api/panels/bulk-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ksmToken}` },
      body: JSON.stringify({
        panels: [
          { id: 'TR-803', type: 'Traction', project: 'Batch 1', dueDate: '2026-12-31' },
          { id: 'TR-803', type: 'Traction', project: 'Batch 1 duplicate', dueDate: '2026-12-31' }
        ]
      })
    });
    assert.strictEqual(dupRes.status, 400);

    // 4. Successful multi-panel import
    const validImportRes = await fetch('http://localhost:5003/api/panels/bulk-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ksmToken}` },
      body: JSON.stringify({
        panels: [
          {
            id: 'TR-501',
            type: 'Traction',
            project: 'Bulk Import Freight Loco A',
            priority: 'High',
            startDate: '2026-10-15',
            dueDate: '2026-11-25'
          },
          {
            id: 'DCS-501',
            type: 'DCS',
            project: 'Bulk Import DCS Panel B',
            priority: 'Medium',
            startDate: '2026-10-20',
            dueDate: '2026-12-05'
          }
        ]
      })
    });
    assert.strictEqual(validImportRes.status, 201);
    const importData = await validImportRes.json();
    assert.strictEqual(importData.createdCount, 2);
    assert.strictEqual(importData.failedCount, 0);

    // Verify imported panels exist and can be loaded
    const p1Res = await fetch('http://localhost:5003/api/panels/TR-501', {
      headers: { Authorization: `Bearer ${ksmToken}` }
    });
    const p1 = await p1Res.json();
    assert.strictEqual(p1.id, 'TR-501');
    assert.strictEqual(p1.project, 'Bulk Import Freight Loco A');
    assert.strictEqual(p1.start_date, '2026-10-15');
    assert.strictEqual(p1.due_date, '2026-11-25');
    assert.strictEqual(p1.current_stage, 1);

    // 5. Duplicate upload of already existing ID is rejected safely
    const dupDbRes = await fetch('http://localhost:5003/api/panels/bulk-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ksmToken}` },
      body: JSON.stringify({
        panels: [
          { id: 'TR-501', type: 'Traction', project: 'Repeat upload', dueDate: '2026-12-31' }
        ]
      })
    });
    assert.strictEqual(dupDbRes.status, 400);
    const dupDbData = await dupDbRes.json();
    assert.ok(dupDbData.errors[0].error.includes('already exists in database'));
  });

  await t.test('Feature 7: Admin-Only Panel Name and Date Editing with Authorization Enforcement', async () => {
    // 1. Non-admin (KSM or PDR) attempting to edit panel dates is rejected with 403
    const nonAdminEdit = await fetch('http://localhost:5003/api/panels/TR-501/admin-edit', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ksmToken}` },
      body: JSON.stringify({
        project: 'Unauthorized Name Change',
        startDate: '2026-10-01',
        dueDate: '2026-12-01'
      })
    });
    assert.strictEqual(nonAdminEdit.status, 403, 'Non-admin users must be rejected with 403');

    // 2. Admin (AKR) successfully edits project name, start date, and due date
    const adminEdit = await fetch('http://localhost:5003/api/panels/TR-501/admin-edit', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${akrToken}` },
      body: JSON.stringify({
        project: 'WAG-9 Super Heavy Haul Series',
        startDate: '2026-10-10',
        dueDate: '2026-12-20'
      })
    });
    assert.strictEqual(adminEdit.status, 200);
    const adminEditData = await adminEdit.json();
    assert.strictEqual(adminEditData.panel.project, 'WAG-9 Super Heavy Haul Series');
    assert.strictEqual(adminEditData.panel.start_date, '2026-10-10');
    assert.strictEqual(adminEditData.panel.due_date, '2026-12-20');

    // 3. Validation: Start Date > Due Date is rejected with 400
    const invalidDateEdit = await fetch('http://localhost:5003/api/panels/TR-501/admin-edit', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${akrToken}` },
      body: JSON.stringify({
        startDate: '2026-12-25',
        dueDate: '2026-12-10'
      })
    });
    assert.strictEqual(invalidDateEdit.status, 400);
  });

  await t.test('Feature 8: Downloadable Actual Work Reports by Date Range & CSV Formula Defense', async () => {
    // 1. Query production report JSON for full period
    const reportRes = await fetch('http://localhost:5003/api/reports/production?startDate=2026-10-01&endDate=2026-12-31', {
      headers: { Authorization: `Bearer ${ksmToken}` }
    });
    assert.strictEqual(reportRes.status, 200);
    const report = await reportRes.json();

    assert.ok(report.summary.totalPlannedPanels >= 2);
    assert.ok(report.summary.completedStagesCount >= 14); // 8 stages from TR-200 + 6 from DCS-200
    assert.strictEqual(report.summary.fullyCompletedPanelsCount, 2); // TR-200 and DCS-200 both Done
    assert.ok(Array.isArray(report.records));
    assert.ok(Array.isArray(report.employeeBreakdown));

    // Verify employee breakdown contains KSM-OP-1, PDR-MECH-1, PDR-MECH-4, KSM-OP-2
    const employees = report.employeeBreakdown.map(e => e.employee);
    assert.ok(employees.includes('KSM-OP-1'));
    assert.ok(employees.includes('PDR-MECH-1'));
    assert.ok(employees.includes('PDR-MECH-4'));
    assert.ok(employees.includes('KSM-OP-2'));

    // 2. Query CSV export
    const csvRes = await fetch('http://localhost:5003/api/reports/production/csv?startDate=2026-10-01&endDate=2026-12-31', {
      headers: { Authorization: `Bearer ${ksmToken}` }
    });
    assert.strictEqual(csvRes.status, 200);
    assert.strictEqual(csvRes.headers.get('content-type'), 'text/csv; charset=utf-8');
    const csvText = await csvRes.text();

    assert.ok(csvText.includes('BHEL Traction & DCS Panel Assembly Management Portal — Actual Work Report'));
    assert.ok(csvText.includes('"Panel ID"'));
    assert.ok(csvText.includes('"TR-200"'));
    assert.ok(csvText.includes('"DCS-200"'));
    assert.ok(csvText.includes('EMPLOYEE WORK OUTPUT SUMMARY'));
  });

  await t.test('Hold and Resume workflow', async () => {
    // Register TR-201
    await fetch('http://localhost:5003/api/panels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ksmToken}` },
      body: JSON.stringify({
        id: 'TR-201',
        type: 'Traction',
        project: 'Metro Loco',
        priority: 'Medium',
        dueDate: '2026-11-20'
      })
    });

    // Start Stage 1
    await fetch('http://localhost:5003/api/panels/TR-201/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ksmToken}` },
      body: JSON.stringify({ assignedTo: 'KSM-OP-1' })
    });

    // Put on Hold
    const holdRes = await fetch('http://localhost:5003/api/panels/TR-201/hold', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ksmToken}` },
      body: JSON.stringify({ reason: 'Waiting for drawing revision from engineering' })
    });
    assert.strictEqual(holdRes.status, 200);

    let panelRes = await fetch('http://localhost:5003/api/panels/TR-201', {
      headers: { Authorization: `Bearer ${ksmToken}` }
    });
    let panel = await panelRes.json();
    assert.strictEqual(panel.status, 'Held');
    assert.strictEqual(panel.hold_reason, 'Waiting for drawing revision from engineering');
    assert.strictEqual(panel.holdHistory.length, 1);

    // Resume
    const resumeRes = await fetch('http://localhost:5003/api/panels/TR-201/resume', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ksmToken}` }
    });
    assert.strictEqual(resumeRes.status, 200);

    panelRes = await fetch('http://localhost:5003/api/panels/TR-201', {
      headers: { Authorization: `Bearer ${ksmToken}` }
    });
    panel = await panelRes.json();
    assert.strictEqual(panel.status, 'In Progress');
    assert.strictEqual(panel.hold_reason, null);
    assert.ok(panel.holdHistory[0].resumed_at);
  });

  server.close();
});
