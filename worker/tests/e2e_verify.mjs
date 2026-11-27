import assert from 'node:assert';

const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:8787';

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) {}
  return { status: res.status, headers: res.headers, text, json };
}

async function run() {
  console.log(`Running E2E verification against ${BASE}...`);

  // 1. Frontend SPA
  const home = await req('/');
  assert.strictEqual(home.status, 200, 'Frontend index.html must return 200');
  assert.ok(home.text.includes('<!doctype html>') || home.text.includes('<html'), 'Must serve HTML');

  // 2. Health endpoint
  const health = await req('/health');
  assert.strictEqual(health.status, 200, '/health must return 200');
  assert.strictEqual(health.json.status, 'ok');
  assert.strictEqual(health.json.database, 'ok');
  console.log('  [PASS] Frontend SPA & /health');

  // 3. Unauthenticated protection
  const unauth = await req('/api/panels');
  assert.strictEqual(unauth.status, 401, 'Unauthenticated /api/panels must return 401');

  // 4. Login all 5 roles + invalid PIN
  const badLogin = await req('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'ksm', pin: 'wrong' })
  });
  assert.strictEqual(badLogin.status, 401);

  const tokens = {};
  for (const [u, p] of [['ksm', process.env.TEST_PIN_KSM || 'dev-ksm-pin'], ['pdr', process.env.TEST_PIN_PDR || 'dev-pdr-pin'], ['crm', process.env.TEST_PIN_CRM || 'dev-crm-pin'], ['akr', process.env.TEST_PIN_AKR || 'dev-akr-pin'], ['ckg', process.env.TEST_PIN_CKG || 'dev-ckg-pin']]) {
    const r = await req('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, pin: p })
    });
    assert.strictEqual(r.status, 200, `Login failed for ${u}: ${r.text}`);
    assert.ok(r.json.token, `Missing token for ${u}`);
    tokens[u] = r.json.token;
  }
  console.log('  [PASS] Authentication for all 5 roles & 401 enforcement');

  // 5. Verify recovered data counts
  const counts = await req('/api/backup/counts', { headers: { Authorization: `Bearer ${tokens.akr}` } });
  assert.strictEqual(counts.status, 200);
  assert.ok(counts.json.panels >= 8, `Expected >= 8 recovered panels, got ${counts.json.panels}`);
  assert.ok(counts.json.monthlyPlans >= 19, `Expected >= 19 monthly plans, got ${counts.json.monthlyPlans}`);
  console.log(`  [PASS] Recovered D1 counts verified: panels=${counts.json.panels}, plans=${counts.json.monthlyPlans}`);

  // 6. Read endpoints (Overview, Plans, Daily Status, Sub-Assemblies, Master Data, Reports, CSV)
  for (const ep of ['/api/panels', '/api/overview', '/api/plans', '/api/daily-status?area=KSM', '/api/sub-assemblies', '/api/master-data', '/api/reports/production']) {
    const r = await req(ep, { headers: { Authorization: `Bearer ${tokens.ksm}` } });
    assert.strictEqual(r.status, 200, `GET ${ep} failed with ${r.status}: ${r.text}`);
  }
  const csv = await req('/api/reports/production/csv', { headers: { Authorization: `Bearer ${tokens.ksm}` } });
  assert.strictEqual(csv.status, 200);
  assert.ok(csv.headers.get('content-type').includes('text/csv'));
  console.log('  [PASS] All read & report endpoints');

  // 7. RBAC checks
  const pdrCreate = await req('/api/panels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.pdr}` },
    body: JSON.stringify({ id: 'TEMP-FAIL', type: 'Traction', project: 'Test', priority: 'Low', dueDate: '2026-12-30' })
  });
  assert.strictEqual(pdrCreate.status, 403, 'PDR must be forbidden from creating panel');

  const ksmDel = await req('/api/panels/TR-101', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${tokens.ksm}` }
  });
  assert.strictEqual(ksmDel.status, 403, 'KSM must be forbidden from deleting panel');
  console.log('  [PASS] RBAC authorization checks');

  // 8. Simulator isolation test
  const sim = await req('/api/simulator/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.pdr}` },
    body: JSON.stringify({ tractionTarget: 10, dcsTarget: 20, workingDays: 26 })
  });
  assert.strictEqual(sim.status, 200);
  assert.strictEqual(sim.json.results.achievabilityStatus, 'Achievable');
  console.log('  [PASS] What-If Simulator');

  // 9. Full CRUD + Workflow + Undo + Cleanup with synthetic panel
  const testId = 'E2E-SYNTH-999';
  const create = await req('/api/panels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.ksm}` },
    body: JSON.stringify({ id: testId, type: 'DCS', project: 'E2E Synthetic Test', priority: 'Medium', dueDate: '2026-12-31' })
  });
  assert.strictEqual(create.status, 201, `Create synthetic panel failed: ${create.text}`);

  const start = await req(`/api/panels/${testId}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.ksm}` },
    body: JSON.stringify({ assignedTo: 'KSM-OP-1' })
  });
  assert.strictEqual(start.status, 200, `Start stage failed: ${start.text}`);

  const complete = await req(`/api/panels/${testId}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.ksm}` },
    body: JSON.stringify({})
  });
  assert.strictEqual(complete.status, 200, `Complete stage failed: ${complete.text}`);

  const undo = await req(`/api/panels/${testId}/undo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.akr}` },
    body: JSON.stringify({ reason: 'E2E Undo Verification' })
  });
  assert.strictEqual(undo.status, 200, `Undo stage failed: ${undo.text}`);
  assert.strictEqual(undo.json.targetStage.stageNumber, 1);

  const del = await req(`/api/panels/${testId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${tokens.akr}` }
  });
  assert.strictEqual(del.status, 200, `Cleanup delete failed: ${del.text}`);
  console.log('  [PASS] Synthetic panel CRUD, Stage Start/Complete, Admin Undo, and Cleanup');

  console.log('ALL E2E CHECKS PASSED!');
}

run().catch((err) => {
  console.error('E2E FAILED:', err);
  process.exit(1);
});

