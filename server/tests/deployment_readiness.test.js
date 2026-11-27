import test from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startServer } from '../src/server.js';
import { initDatabase, closeDatabase } from '../src/db/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('End-to-End Deployment Readiness & Connectivity Suite', async (t) => {
  const testDbPath = path.resolve(__dirname, '../data/test_deploy_persistence.sqlite');
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  // 1. Start Server Instance 1
  const instance1 = await startServer(5020, testDbPath);
  const baseUrl = 'http://localhost:5020';

  let ksmToken = '';
  let akrToken = '';

  await t.test('1. Health check endpoint responds cleanly', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'ok');
    assert.ok(data.system.includes('BHEL'));
    assert.ok(data.timestamp);
  });

  await t.test('2. Single-application bundle serves index.html', async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.strictEqual(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('<!doctype html>') || text.includes('<!DOCTYPE html>'));
    assert.ok(text.includes('BHEL') || text.includes('assets/'));
  });

  await t.test('3. Role authentication & JWT issue for all 5 roles', async () => {
    const users = ['ksm', 'pdr', 'crm', 'akr', 'ckg'];
    for (const u of users) {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, pin: `dev-${u}-pin` })
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(data.token);
      assert.strictEqual(data.user.role, u.toUpperCase());
      if (u === 'ksm') ksmToken = data.token;
      if (u === 'akr') akrToken = data.token;
    }
  });

  await t.test('4. Create panel and verify persistence preparation', async () => {
    const res = await fetch(`${baseUrl}/api/panels`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ksmToken}`
      },
      body: JSON.stringify({
        id: 'PERSIST-01',
        type: 'Traction',
        project: 'Persistence Test Engine',
        priority: 'High',
        dueDate: '2026-12-31'
      })
    });
    assert.strictEqual(res.status, 201);
  });

  await t.test('5. Simulator API runs and delivers RC-8 allocation', async () => {
    const res = await fetch(`${baseUrl}/api/simulator/simulate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ksmToken}`
      },
      body: JSON.stringify({ tractionTarget: 30, dcsTarget: 60, workingDays: 26 })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.results.achievabilityStatus, 'Not Achievable');
    assert.strictEqual(data.results.feasibleTractionOutput, 18);
    assert.strictEqual(data.results.feasibleDcsOutput, 40);
  });

  // Close Server Instance 1
  instance1.server.close();
  closeDatabase();

  // 6. Start Server Instance 2 using the EXACT same database file
  await t.test('6. Server restart maintains database record persistence', async () => {
    const instance2 = await startServer(5021, testDbPath);
    const newBaseUrl = 'http://localhost:5021';

    const loginRes = await fetch(`${newBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'ksm', pin: 'dev-ksm-pin' })
    });
    const { token: newKsmToken } = await loginRes.json();

    const fetchPanelRes = await fetch(`${newBaseUrl}/api/panels/PERSIST-01`, {
      headers: { Authorization: `Bearer ${newKsmToken}` }
    });
    assert.strictEqual(fetchPanelRes.status, 200);
    const panel = await fetchPanelRes.json();
    assert.strictEqual(panel.id, 'PERSIST-01');
    assert.strictEqual(panel.project, 'Persistence Test Engine');
    assert.strictEqual(panel.status, 'Waiting');

    instance2.server.close();
    closeDatabase();

    // Clean up test database file
    if (fs.existsSync(testDbPath)) {
      try {
        fs.unlinkSync(testDbPath);
      } catch {}
    }
  });
});
