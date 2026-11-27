import test from 'node:test';
import assert from 'node:assert';
import { startServer } from '../src/server.js';

test('Daily Status Mandatory Acceptance Scenario & Sub-Assemblies Suite', async (t) => {
  const { server } = await startServer(5004, ':memory:');

  const loginUser = async (username, pin) => {
    const res = await fetch('http://localhost:5004/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, pin })
    });
    const data = await res.json();
    return data.token;
  };

  const ksmToken = await loginUser('ksm', 'dev-ksm-pin');
  const testDate = '2026-10-12';

  await t.test('Mandatory Scenario: Target=10, Actual=8 -> Save -> Verify Var -2, Ach 80% -> Update Actual=9 -> Verify Var -1, Ach 90%', async () => {
    // 1. Enter Target = 10 and Actual = 8 for KSM-OP-1
    const saveRes1 = await fetch('http://localhost:5004/api/daily-status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ksmToken}`
      },
      body: JSON.stringify({
        date: testDate,
        area: 'KSM',
        teamOrPerson: 'KSM-OP-1',
        target: 10,
        actual: 8
      })
    });
    assert.strictEqual(saveRes1.status, 200);

    // 2. Fetch Daily Status (simulating navigate away, refresh, relogin)
    const freshToken = await loginUser('ksm', 'dev-ksm-pin');
    const fetchRes1 = await fetch(`http://localhost:5004/api/daily-status?area=KSM&date=${testDate}`, {
      headers: { Authorization: `Bearer ${freshToken}` }
    });
    assert.strictEqual(fetchRes1.status, 200);
    const data1 = await fetchRes1.json();
    const ksmOp1 = data1.roster.find(w => w.teamOrPerson === 'KSM-OP-1');
    assert.ok(ksmOp1);

    // 3. Verify Target = 10, Actual = 8, Variance = -2, Achievement = 80%
    assert.strictEqual(ksmOp1.target, 10);
    assert.strictEqual(ksmOp1.actual, 8);
    assert.strictEqual(ksmOp1.variance, -2);
    assert.strictEqual(ksmOp1.achievementPercent, 80);

    // 4. Change Actual to 9, save
    const saveRes2 = await fetch('http://localhost:5004/api/daily-status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ksmToken}`
      },
      body: JSON.stringify({
        date: testDate,
        area: 'KSM',
        teamOrPerson: 'KSM-OP-1',
        target: 10,
        actual: 9
      })
    });
    assert.strictEqual(saveRes2.status, 200);

    // 5. Re-fetch and verify Actual is now 9, variance -1, achievement 90%
    const fetchRes2 = await fetch(`http://localhost:5004/api/daily-status?area=KSM&date=${testDate}`, {
      headers: { Authorization: `Bearer ${ksmToken}` }
    });
    assert.strictEqual(fetchRes2.status, 200);
    const data2 = await fetchRes2.json();
    const ksmOp2 = data2.roster.find(w => w.teamOrPerson === 'KSM-OP-1');
    assert.strictEqual(ksmOp2.target, 10);
    assert.strictEqual(ksmOp2.actual, 9);
    assert.strictEqual(ksmOp2.variance, -1);
    assert.strictEqual(ksmOp2.achievementPercent, 90);
  });

  await t.test('KSM Sub-Assembly Persistence', async () => {
    const saveRes = await fetch('http://localhost:5004/api/sub-assemblies', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ksmToken}`
      },
      body: JSON.stringify({
        date: testDate,
        item: 'Power Supply',
        target: 50,
        actual: 45
      })
    });
    assert.strictEqual(saveRes.status, 200);

    const getRes = await fetch(`http://localhost:5004/api/sub-assemblies?date=${testDate}`, {
      headers: { Authorization: `Bearer ${ksmToken}` }
    });
    assert.strictEqual(getRes.status, 200);
    const data = await getRes.json();
    const ps = data.items.find(i => i.item === 'Power Supply');
    assert.ok(ps);
    assert.strictEqual(ps.dailyCapacity, 60);
    assert.strictEqual(ps.target, 50);
    assert.strictEqual(ps.actual, 45);
    assert.strictEqual(ps.variance, -5);
    assert.strictEqual(ps.achievementPercent, 90);
  });

  await t.test('Daily Status & Sub-Assembly Input Validation and Error Handling', async () => {
    // 1. Negative target/actual rejected in daily status
    const negRes = await fetch('http://localhost:5004/api/daily-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ksmToken}` },
      body: JSON.stringify({ date: testDate, area: 'KSM', teamOrPerson: 'KSM-OP-1', target: -5, actual: 8 })
    });
    assert.strictEqual(negRes.status, 400);

    // 2. Fractional target/actual rejected
    const fracRes = await fetch('http://localhost:5004/api/daily-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ksmToken}` },
      body: JSON.stringify({ date: testDate, area: 'KSM', teamOrPerson: 'KSM-OP-1', target: 10, actual: 8.5 })
    });
    assert.strictEqual(fracRes.status, 400);

    // 3. Invalid date format rejected
    const badDateRes = await fetch('http://localhost:5004/api/daily-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ksmToken}` },
      body: JSON.stringify({ date: '2026/10/12', area: 'KSM', teamOrPerson: 'KSM-OP-1', target: 10, actual: 8 })
    });
    assert.strictEqual(badDateRes.status, 400);

    // 4. Sub-assembly negative value rejected
    const subNegRes = await fetch('http://localhost:5004/api/sub-assemblies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ksmToken}` },
      body: JSON.stringify({ date: testDate, item: 'Power Supply', target: 50, actual: -1 })
    });
    assert.strictEqual(subNegRes.status, 400);

    // 5. Sub-assembly invalid date format rejected
    const subBadDateRes = await fetch('http://localhost:5004/api/sub-assemblies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ksmToken}` },
      body: JSON.stringify({ date: 'invalid-date', item: 'Power Supply', target: 50, actual: 40 })
    });
    assert.strictEqual(subBadDateRes.status, 400);
  });

  server.close();
});
