import test from 'node:test';
import assert from 'node:assert';
import jwt from 'jsonwebtoken';
import { startServer } from '../src/server.js';
import { JWT_SECRET } from '../src/config/env.js';

test('Comprehensive Authentication & RBAC Test Suite', async (t) => {
  const { server, db } = await startServer(5010, ':memory:');

  // Test 1: Unauthenticated request to protected endpoint
  await t.test('1. Unauthenticated request to protected endpoint returns 401', async () => {
    const res = await fetch('http://localhost:510/api/panels').catch(() => null) ||
                await fetch('http://localhost:5010/api/panels');
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.ok(body.error.includes('Authentication required'));
  });

  // Test 2: Valid login for ALL 5 configured roles
  const roles = [
    { username: 'ksm', pin: 'dev-ksm-pin', expectedRole: 'KSM', expectedAdmin: false },
    { username: 'pdr', pin: 'dev-pdr-pin', expectedRole: 'PDR', expectedAdmin: false },
    { username: 'crm', pin: 'dev-crm-pin', expectedRole: 'CRM', expectedAdmin: false },
    { username: 'akr', pin: 'dev-akr-pin', expectedRole: 'AKR', expectedAdmin: true },
    { username: 'ckg', pin: 'dev-ckg-pin', expectedRole: 'CKG', expectedAdmin: true }
  ];

  const tokens = {};

  for (const r of roles) {
    await t.test(`2. Valid login succeeds for role '${r.expectedRole}'`, async () => {
      const res = await fetch('http://localhost:5010/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: r.username, pin: r.pin })
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(data.token, 'Token must be present in login response');
      assert.strictEqual(data.user.role, r.expectedRole);
      assert.strictEqual(data.user.isAdmin, r.expectedAdmin);

      // Verify token is signed with unified secret and contains expected claims
      const decoded = jwt.verify(data.token, JWT_SECRET);
      assert.strictEqual(decoded.role, r.expectedRole);
      assert.strictEqual(decoded.isAdmin, r.expectedAdmin);

      tokens[r.username] = data.token;
    });
  }

  // Test 3: Invalid PIN
  await t.test('3. Invalid PIN returns 401 with descriptive error', async () => {
    const res = await fetch('http://localhost:5010/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'ksm', pin: 'wrongpin123' })
    });
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.ok(body.error.includes('Invalid PIN') || body.error.includes('Invalid credentials'));
  });

  // Test 4: Unknown username
  await t.test('4. Unknown username returns 401 with descriptive error', async () => {
    const res = await fetch('http://localhost:5010/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'nonexistent_user', pin: 'anypin' })
    });
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.ok(body.error.includes('User account not found') || body.error.includes('Invalid credentials'));
  });

  // Test 5: Missing or empty credentials
  await t.test('5. Missing username or PIN returns 400 Bad Request', async () => {
    const res1 = await fetch('http://localhost:5010/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'ksm' })
    });
    assert.strictEqual(res1.status, 400);

    const res2 = await fetch('http://localhost:5010/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: 'dev-ksm-pin' })
    });
    assert.strictEqual(res2.status, 400);

    const res3 = await fetch('http://localhost:5010/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '   ', pin: 'dev-ksm-pin' })
    });
    assert.strictEqual(res3.status, 400);
  });

  // Test 6: Malformed / non-string body
  await t.test('6. Non-string body types return 400 Bad Request', async () => {
    const res = await fetch('http://localhost:5010/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 12345, pin: {} })
    });
    assert.strictEqual(res.status, 400);
  });

  // Test 7: Audit logging verification
  await t.test('7. Login activity is reliably recorded in audit_logs table', async () => {
    const auditRows = db.prepare(`
      SELECT * FROM audit_logs WHERE action = 'USER_LOGIN' ORDER BY timestamp DESC
    `).all();
    assert.ok(auditRows.length >= 5, 'Should have recorded at least 5 login audit entries');
    const latest = auditRows[0];
    assert.strictEqual(latest.action, 'USER_LOGIN');
    assert.ok(latest.username);
  });

  // Test 8: /api/auth/me verification
  await t.test('8. /api/auth/me returns profile for valid token', async () => {
    const res = await fetch('http://localhost:5010/api/auth/me', {
      headers: { Authorization: `Bearer ${tokens['ksm']}` }
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.user.role, 'KSM');
  });

  // Test 9: /api/auth/me with invalid or expired token
  await t.test('9. /api/auth/me with malformed or tampered token returns 401', async () => {
    const res = await fetch('http://localhost:5010/api/auth/me', {
      headers: { Authorization: 'Bearer invalid.tampered.token' }
    });
    assert.strictEqual(res.status, 401);
  });

  // Test 10: Role switching & logout
  await t.test('10. Logout and role switching operates cleanly', async () => {
    // Logout KSM
    const logoutRes = await fetch('http://localhost:5010/api/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens['ksm']}` }
    });
    assert.strictEqual(logoutRes.status, 200);

    // Verify audit log has USER_LOGOUT
    const logoutAudit = db.prepare(`
      SELECT * FROM audit_logs WHERE action = 'USER_LOGOUT' ORDER BY timestamp DESC LIMIT 1
    `).get();
    assert.ok(logoutAudit);
    assert.strictEqual(logoutAudit.action, 'USER_LOGOUT');
  });

  // Test 11: Permissions enforcement for non-admin vs admin
  await t.test('11. Non-admin role (KSM) cannot perform Admin actions (delete panel)', async () => {
    const res = await fetch('http://localhost:5010/api/panels/TR-101', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokens['ksm']}` }
    });
    assert.strictEqual(res.status, 403);
  });

  await t.test('12. Admin role (AKR) is authorized to perform Admin actions', async () => {
    // Seed temporary test panel to delete
    db.prepare(`
      INSERT OR REPLACE INTO panels (id, type, project, priority, due_date, current_stage, current_area, status, created_at, updated_at)
      VALUES ('DEL-999', 'Traction', 'Test Project', 'Low', '2026-12-31', 1, 'KSM', 'Waiting', '2026-10-12', '2026-10-12')
    `).run();

    const res = await fetch('http://localhost:5010/api/panels/DEL-999', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokens['akr']}` }
    });
    assert.strictEqual(res.status, 200);
  });

  await t.test('13. Comprehensive RBAC Matrix on All Write Endpoints', async () => {
    // A. Panel Creation: PDR and CRM cannot register panels (403), KSM succeeds (201)
    const pdrCreateRes = await fetch('http://localhost:5010/api/panels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens['pdr']}` },
      body: JSON.stringify({ id: 'PDR-UNAUTH', type: 'Traction', project: 'Test', priority: 'Low', dueDate: '2026-12-31' })
    });
    assert.strictEqual(pdrCreateRes.status, 403);

    const crmCreateRes = await fetch('http://localhost:5010/api/panels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens['crm']}` },
      body: JSON.stringify({ id: 'CRM-UNAUTH', type: 'Traction', project: 'Test', priority: 'Low', dueDate: '2026-12-31' })
    });
    assert.strictEqual(crmCreateRes.status, 403);

    // B. Monthly Planning: PDR cannot edit CRM plans (403), CRM cannot edit PDR plans (403)
    const pdrEditCrmPlan = await fetch('http://localhost:5010/api/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens['pdr']}` },
      body: JSON.stringify({ month: '2026-10', area: 'CRM', teamOrPerson: 'CRM Team 1', tractionPlan: 2, dcsPlan: 3 })
    });
    assert.strictEqual(pdrEditCrmPlan.status, 403);

    const crmEditPdrPlan = await fetch('http://localhost:5010/api/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens['crm']}` },
      body: JSON.stringify({ month: '2026-10', area: 'PDR', teamOrPerson: 'PDR-MECH-1', tractionPlan: 5, dcsPlan: 10 })
    });
    assert.strictEqual(crmEditPdrPlan.status, 403);

    // Admin can edit any plan (200)
    const adminEditPlan = await fetch('http://localhost:5010/api/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens['akr']}` },
      body: JSON.stringify({ month: '2026-10', area: 'CRM', teamOrPerson: 'CRM Team 1', tractionPlan: 1, dcsPlan: 1 })
    });
    assert.strictEqual(adminEditPlan.status, 200);

    // C. Daily Status: Cross-area edits denied (403)
    const ksmEditPdrDaily = await fetch('http://localhost:5010/api/daily-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens['ksm']}` },
      body: JSON.stringify({ date: '2026-10-12', area: 'PDR', teamOrPerson: 'PDR-MECH-1', target: 1, actual: 1 })
    });
    assert.strictEqual(ksmEditPdrDaily.status, 403);

    // D. Sub-Assembly: PDR and CRM cannot edit (403), KSM succeeds (200)
    const pdrSubRes = await fetch('http://localhost:5010/api/sub-assemblies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens['pdr']}` },
      body: JSON.stringify({ date: '2026-10-12', item: 'Resonant Cap', target: 5, actual: 5 })
    });
    assert.strictEqual(pdrSubRes.status, 403);

    const ksmSubRes = await fetch('http://localhost:5010/api/sub-assemblies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens['ksm']}` },
      body: JSON.stringify({ date: '2026-10-12', item: 'Resonant Cap', target: 5, actual: 5 })
    });
    assert.strictEqual(ksmSubRes.status, 200);

    // E. Backup Export/Restore: KSM/PDR/CRM denied (403)
    const pdrExportRes = await fetch('http://localhost:5010/api/backup/export-json', {
      headers: { Authorization: `Bearer ${tokens['pdr']}` }
    });
    assert.strictEqual(pdrExportRes.status, 403);

    const crmRestoreRes = await fetch('http://localhost:5010/api/backup/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens['crm']}` },
      body: JSON.stringify({ version: '1.0.0', data: {} })
    });
    assert.strictEqual(crmRestoreRes.status, 403);
  });

  server.close();
});
