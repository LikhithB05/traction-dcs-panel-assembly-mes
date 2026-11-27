import test from 'node:test';
import assert from 'node:assert';
import { startServer } from '../src/server.js';

test('Backup & Restore Integrity Suite', async (t) => {
  const { server } = await startServer(5006, ':memory:');

  const loginUser = async (username, pin) => {
    const res = await fetch('http://localhost:5006/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, pin })
    });
    const data = await res.json();
    return data.token;
  };

  const akrAdminToken = await loginUser('akr', 'dev-akr-pin');

  await t.test('Live Record Counts', async () => {
    const res = await fetch('http://localhost:5006/api/backup/counts', {
      headers: { Authorization: `Bearer ${akrAdminToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.panels >= 2);
    assert.ok(data.monthlyPlans > 0);
  });

  let backupPayload = null;

  await t.test('JSON Full Backup Export', async () => {
    const res = await fetch('http://localhost:5006/api/backup/export-json', {
      headers: { Authorization: `Bearer ${akrAdminToken}` }
    });
    assert.strictEqual(res.status, 200);
    backupPayload = await res.json();
    assert.ok(backupPayload.metadata);
    assert.ok(backupPayload.data);
    assert.ok(backupPayload.data.panels.length >= 2);
  });

  await t.test('CSV Panels Export', async () => {
    const res = await fetch('http://localhost:5006/api/backup/export-csv', {
      headers: { Authorization: `Bearer ${akrAdminToken}` }
    });
    assert.strictEqual(res.status, 200);
    const csvText = await res.text();
    assert.ok(csvText.includes('Panel ID,Type,Project,Priority,Due Date'));
    assert.ok(csvText.includes('TR-101'));
  });

  await t.test('Safe ID-Based Restore with Record Overwrite and Audit Round-Trip', async () => {
    // Modify TR-101 project name in the payload
    const modifiedBackup = JSON.parse(JSON.stringify(backupPayload));
    const tr101 = modifiedBackup.data.panels.find(p => p.id === 'TR-101');
    assert.ok(tr101);
    tr101.project = 'Updated Project Via Backup Restore';

    // Add a new unrelated panel to test new ID insertion while preserving existing
    const newPanel = {
      id: 'TR-RESTORE-99',
      type: 'Traction',
      project: 'Unrelated Imported Panel',
      priority: 'Low',
      due_date: '2026-12-31',
      current_stage: 1,
      current_area: 'KSM',
      status: 'Waiting',
      assigned_to: null,
      hold_reason: null,
      created_at: '2026-10-13T00:00:00.000Z',
      updated_at: '2026-10-13T00:00:00.000Z'
    };
    modifiedBackup.data.panels.push(newPanel);

    // Add a custom audit log to test audit-log round trip
    const testAuditId = 'log_restore_test_' + Date.now();
    modifiedBackup.data.auditLogs.push({
      id: testAuditId,
      timestamp: '2026-10-13T01:00:00.000Z',
      user_id: 'usr_akr',
      username: 'akr',
      action: 'ARCHIVED_AUDIT_ENTRY',
      entity_type: 'SYSTEM',
      entity_id: null,
      details: 'Preserved audit record test'
    });

    const restoreRes = await fetch('http://localhost:5006/api/backup/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${akrAdminToken}` },
      body: JSON.stringify({ backupData: modifiedBackup })
    });

    assert.strictEqual(restoreRes.status, 200);
    const restoreBody = await restoreRes.json();
    assert.ok(restoreBody.mergedCounts);
    assert.strictEqual(restoreBody.mergedCounts.auditLogs, modifiedBackup.data.auditLogs.length);

    // 1. Verify TR-101 has updated project name
    const checkRes1 = await fetch('http://localhost:5006/api/panels/TR-101', {
      headers: { Authorization: `Bearer ${akrAdminToken}` }
    });
    const panel1 = await checkRes1.json();
    assert.strictEqual(panel1.project, 'Updated Project Via Backup Restore');

    // 2. Verify new panel was inserted
    const checkRes2 = await fetch('http://localhost:5006/api/panels/TR-RESTORE-99', {
      headers: { Authorization: `Bearer ${akrAdminToken}` }
    });
    assert.strictEqual(checkRes2.status, 200);

    // 3. Verify unrelated existing DCS panel is preserved
    const checkRes3 = await fetch('http://localhost:5006/api/panels/DCS-101', {
      headers: { Authorization: `Bearer ${akrAdminToken}` }
    });
    assert.strictEqual(checkRes3.status, 200);
  });

  await t.test('Malformed Restore Package Rejected with Complete Rollback', async () => {
    // 1. Unsupported version rejected
    const badVersionRes = await fetch('http://localhost:5006/api/backup/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${akrAdminToken}` },
      body: JSON.stringify({
        backupData: {
          metadata: { version: '2.0.0' },
          data: { panels: [] }
        }
      })
    });
    assert.strictEqual(badVersionRes.status, 400);

    // 2. Duplicate panel IDs in backup payload rejected
    const dupRes = await fetch('http://localhost:5006/api/backup/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${akrAdminToken}` },
      body: JSON.stringify({
        backupData: {
          metadata: { version: '1.0.0' },
          data: {
            panels: [
              { id: 'DUP-01', type: 'Traction', project: 'P1', priority: 'High', due_date: '2026-10-20', current_stage: 1, current_area: 'KSM', status: 'Waiting' },
              { id: 'DUP-01', type: 'Traction', project: 'P2', priority: 'Low', due_date: '2026-10-20', current_stage: 1, current_area: 'KSM', status: 'Waiting' }
            ]
          }
        }
      })
    });
    assert.strictEqual(dupRes.status, 400);

    // 3. Orphaned stage_history referencing non-existent panel rejected with 400
    const orphanRes = await fetch('http://localhost:5006/api/backup/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${akrAdminToken}` },
      body: JSON.stringify({
        backupData: {
          metadata: { version: '1.0.0' },
          data: {
            panels: [
              { id: 'TR-VALID-1', type: 'Traction', project: 'Valid', priority: 'High', due_date: '2026-10-20', current_stage: 1, current_area: 'KSM', status: 'Waiting' }
            ],
            stageHistory: [
              { id: 'sh_orphan_99', panel_id: 'NON_EXISTENT_PANEL_XYZ', stage_number: 1, stage_name: 'Stage 1', area: 'KSM' }
            ]
          }
        }
      })
    });
    assert.strictEqual(orphanRes.status, 400);

    // Verify TR-VALID-1 was NOT committed due to transaction rollback
    const checkValid = await fetch('http://localhost:5006/api/panels/TR-VALID-1', {
      headers: { Authorization: `Bearer ${akrAdminToken}` }
    });
    assert.strictEqual(checkValid.status, 404);
  });

  await t.test('CSV Standards-Compliant Escaping and Round-Trip Parsing', async () => {
    // 1. Create a panel with special characters: commas, double quotes, and carriage returns
    const weirdProject = 'Special Project, with "Quotes", commas & \n newline';
    await fetch('http://localhost:5006/api/panels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${akrAdminToken}` },
      body: JSON.stringify({
        id: 'TR-CSV-SPEC',
        type: 'Traction',
        project: weirdProject,
        priority: 'Medium',
        dueDate: '2026-11-15'
      })
    });

    const csvRes = await fetch('http://localhost:5006/api/backup/export-csv', {
      headers: { Authorization: `Bearer ${akrAdminToken}` }
    });
    assert.strictEqual(csvRes.status, 200);
    const csvContent = await csvRes.text();

    // Verify that the CSV includes our special panel with doubled quotation marks
    assert.ok(csvContent.includes('TR-CSV-SPEC'));
    assert.ok(csvContent.includes('""Quotes""'));

    // 2. Parse RFC 4180 CSV correctly
    function parseRFC4180(text) {
      const rows = [];
      let currentRow = [];
      let currentCell = '';
      let insideQuote = false;

      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        const next = text[i + 1];

        if (insideQuote) {
          if (c === '"' && next === '"') {
            currentCell += '"';
            i++;
          } else if (c === '"') {
            insideQuote = false;
          } else {
            currentCell += c;
          }
        } else {
          if (c === '"') {
            insideQuote = true;
          } else if (c === ',') {
            currentRow.push(currentCell);
            currentCell = '';
          } else if (c === '\r' && next === '\n') {
            currentRow.push(currentCell);
            rows.push(currentRow);
            currentRow = [];
            currentCell = '';
            i++;
          } else if (c === '\n') {
            currentRow.push(currentCell);
            rows.push(currentRow);
            currentRow = [];
            currentCell = '';
          } else {
            currentCell += c;
          }
        }
      }
      if (currentCell.length > 0 || currentRow.length > 0) {
        currentRow.push(currentCell);
        rows.push(currentRow);
      }
      return rows;
    }

    const parsedRows = parseRFC4180(csvContent);
    const headerRow = parsedRows[0];
    assert.strictEqual(headerRow[0], 'Panel ID');
    assert.strictEqual(headerRow[2], 'Project');

    // Find our special row
    const targetRow = parsedRows.find(r => r[0] === 'TR-CSV-SPEC');
    assert.ok(targetRow, 'Row for TR-CSV-SPEC must be parsed correctly');
    assert.strictEqual(targetRow[2], weirdProject, 'Cell with commas, quotes, and newlines must match exactly');
    assert.strictEqual(targetRow.length, 11, 'Must maintain exact 11 columns');
  });

  server.close();
});

