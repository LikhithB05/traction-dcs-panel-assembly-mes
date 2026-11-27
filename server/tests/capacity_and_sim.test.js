import test from 'node:test';
import assert from 'node:assert';
import { startServer } from '../src/server.js';
import { CapacityService } from '../src/services/capacityService.js';

test('Capacity Model & What-If Simulation Suite', async (t) => {
  const { server } = await startServer(5005, ':memory:');

  const loginUser = async (username, pin) => {
    const res = await fetch('http://localhost:5005/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, pin })
    });
    const data = await res.json();
    return data.token;
  };

  const pdrToken = await loginUser('pdr', 'dev-pdr-pin');

  await t.test('Documented Shared Capacity Formula Verification', () => {
    // PDF Example 1: PDR Mech person with 5 traction + 15 DCS -> 100%
    const mechLoad = CapacityService.calculateLoadPercent(5, 15, 'PDR-MECH-1');
    assert.strictEqual(mechLoad, 100);

    // PDF Example 2: HV Team with 3 traction + 5 DCS -> 200%
    const hvLoad = CapacityService.calculateLoadPercent(3, 5, 'PDR Team 1');
    assert.strictEqual(hvLoad, 200);

    // CRM Team with 1 traction + 2 DCS -> 1/3 + 2/5 = 33.3% + 40% = 73.3%
    const crmLoad = CapacityService.calculateLoadPercent(1, 2, 'CRM Team 1');
    assert.strictEqual(crmLoad, 73.3);
  });

  await t.test('Monthly Planning Overload Confirmation Gate', async () => {
    // Try saving an overloaded plan without confirmation
    const unconfirmedRes = await fetch('http://localhost:5005/api/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pdrToken}` },
      body: JSON.stringify({
        month: '2026-10',
        area: 'PDR',
        teamOrPerson: 'PDR Team 1',
        tractionPlan: 3,
        dcsPlan: 5,
        confirmedOverload: false
      })
    });

    assert.strictEqual(unconfirmedRes.status, 409);
    const unconfirmedBody = await unconfirmedRes.json();
    assert.strictEqual(unconfirmedBody.requiresConfirmation, true);
    assert.strictEqual(unconfirmedBody.planLoadPercent, 200);

    // Save with confirmedOverload: true
    const confirmedRes = await fetch('http://localhost:5005/api/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pdrToken}` },
      body: JSON.stringify({
        month: '2026-10',
        area: 'PDR',
        teamOrPerson: 'PDR Team 1',
        tractionPlan: 3,
        dcsPlan: 5,
        confirmedOverload: true
      })
    });

    assert.strictEqual(confirmedRes.status, 200);
  });

  await t.test('What-If Simulator Runs in Isolation', async () => {
    const simRes = await fetch('http://localhost:5005/api/simulator/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pdrToken}` },
      body: JSON.stringify({
        tractionTarget: 30,
        dcsTarget: 60,
        workingDays: 26,
        overtimeHours: 2,
        additionalMechanicalWorkers: 2,
        additionalElectricalTeams: 2
      })
    });

    assert.strictEqual(simRes.status, 200);
    const simData = await simRes.json();
    assert.ok(simData.results);
    assert.ok(simData.results.loads);
    assert.ok(simData.results.assumptions.length > 0);

    // Save scenario
    const saveScenarioRes = await fetch('http://localhost:5005/api/simulator/scenarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pdrToken}` },
      body: JSON.stringify({
        name: 'Q4 High Demand Sprint',
        notes: '2 added mechanical persons and 2h overtime',
        scenarioData: simData
      })
    });

    assert.strictEqual(saveScenarioRes.status, 201);

    // Verify scenario list
    const getScenarioRes = await fetch('http://localhost:5005/api/simulator/scenarios', {
      headers: { Authorization: `Bearer ${pdrToken}` }
    });
    const scenarios = await getScenarioRes.json();
    assert.ok(scenarios.length >= 1);
    assert.strictEqual(scenarios[0].name, 'Q4 High Demand Sprint');
  });

  await t.test('What-If Simulator Input Validation and Reference Cases', async () => {
    // 1. Negative targets rejected
    const negRes = await fetch('http://localhost:5005/api/simulator/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pdrToken}` },
      body: JSON.stringify({ tractionTarget: -10, dcsTarget: 20 })
    });
    assert.strictEqual(negRes.status, 400);

    // 2. Fractional targets rejected where whole integers required
    const fracRes = await fetch('http://localhost:5005/api/simulator/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pdrToken}` },
      body: JSON.stringify({ tractionTarget: 10.5, dcsTarget: 20 })
    });
    assert.strictEqual(fracRes.status, 400);

    // 3. Out-of-range working days rejected
    const rangeRes = await fetch('http://localhost:5005/api/simulator/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pdrToken}` },
      body: JSON.stringify({ tractionTarget: 10, dcsTarget: 20, workingDays: 35 })
    });
    assert.strictEqual(rangeRes.status, 400);

    // 4. Zero demand reference case
    const zeroRes = await fetch('http://localhost:5005/api/simulator/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pdrToken}` },
      body: JSON.stringify({ tractionTarget: 0, dcsTarget: 0, workingDays: 26 })
    });
    assert.strictEqual(zeroRes.status, 200);
    const zeroData = await zeroRes.json();
    assert.strictEqual(zeroData.results.achievabilityStatus, 'Achievable');
    assert.strictEqual(zeroData.results.feasibleTractionOutput, 0);
    assert.strictEqual(zeroData.results.feasibleDcsOutput, 0);
    assert.strictEqual(zeroData.results.shortfallTraction, 0);
    assert.strictEqual(zeroData.results.shortfallDcs, 0);

    // 5. Demand within confirmed baseline capacity (10 Traction, 20 DCS)
    const confRes = await fetch('http://localhost:5005/api/simulator/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pdrToken}` },
      body: JSON.stringify({ tractionTarget: 10, dcsTarget: 20, workingDays: 26 })
    });
    assert.strictEqual(confRes.status, 200);
    const confData = await confRes.json();
    assert.strictEqual(confData.results.achievabilityStatus, 'Achievable');
    assert.strictEqual(confData.results.feasibleTractionOutput, 10);
    assert.strictEqual(confData.results.feasibleDcsOutput, 20);
    assert.strictEqual(confData.results.shortfallTraction, 0);
    assert.strictEqual(confData.results.shortfallDcs, 0);
    assert.strictEqual(confData.results.loads.mechanical.combinedLoadPercent, 41.7);
    assert.strictEqual(confData.results.loads.hvCabling.combinedLoadPercent, 52.4);

    // 6. Mechanical Overload Reference Case (45 Traction, 10 DCS)
    // 45/40 + 10/120 = 1.125 + 0.0833 = 120.8% load
    const mechOverRes = await fetch('http://localhost:5005/api/simulator/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pdrToken}` },
      body: JSON.stringify({ tractionTarget: 45, dcsTarget: 10, workingDays: 26 })
    });
    assert.strictEqual(mechOverRes.status, 200);
    const mechOverData = await mechOverRes.json();
    assert.strictEqual(mechOverData.results.achievabilityStatus, 'Not Achievable');
    assert.strictEqual(mechOverData.results.loads.mechanical.isOverloaded, true);
    assert.ok(mechOverData.results.limitingConstraint.includes('PDR Mechanical') || mechOverData.results.summaryNotes.includes('PDR Mechanical'));

    // 7. HV Cabling Overload Reference Case (40 Traction, 50 DCS)
    // 40/42 + 50/70 = 0.952 + 0.714 = 166.7% load
    const hvOverRes = await fetch('http://localhost:5005/api/simulator/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pdrToken}` },
      body: JSON.stringify({ tractionTarget: 40, dcsTarget: 50, workingDays: 26 })
    });
    assert.strictEqual(hvOverRes.status, 200);
    const hvOverData = await hvOverRes.json();
    assert.strictEqual(hvOverData.results.achievabilityStatus, 'Not Achievable');
    assert.strictEqual(hvOverData.results.loads.hvCabling.isOverloaded, true);

    // 8. LV Wiring Overload Reference Case (40 Traction, 10 DCS)
    // LV capacity: 26 + 9 = 35 panels. Target = 40 -> 114.3% load
    const lvOverRes = await fetch('http://localhost:5005/api/simulator/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pdrToken}` },
      body: JSON.stringify({ tractionTarget: 40, dcsTarget: 10, workingDays: 26 })
    });
    assert.strictEqual(lvOverRes.status, 200);
    const lvOverData = await lvOverRes.json();
    assert.strictEqual(lvOverData.results.achievabilityStatus, 'Not Achievable');
    assert.strictEqual(lvOverData.results.loads.lvWiring.isOverloaded, true);

    // 9. KSM Stage 1 Overload Reference Case (60 Traction, 10 DCS)
    // KSM Traction capacity: 2 * 26 = 52. Target = 60 -> 115.4% load
    const ksmOverRes = await fetch('http://localhost:5005/api/simulator/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pdrToken}` },
      body: JSON.stringify({ tractionTarget: 60, dcsTarget: 10, workingDays: 26 })
    });
    assert.strictEqual(ksmOverRes.status, 200);
    const ksmOverData = await ksmOverRes.json();
    assert.strictEqual(ksmOverData.results.achievabilityStatus, 'Not Achievable');
    assert.strictEqual(ksmOverData.results.loads.ksmStage1.isOverloaded, true);

    // 10. KSM DCS Doors Overload Reference Case (10 Traction, 350 DCS)
    // KSM DCS Door capacity: 12 * 26 = 312. Target = 350 -> 112.2% load
    const ksmDcsOverRes = await fetch('http://localhost:5005/api/simulator/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pdrToken}` },
      body: JSON.stringify({ tractionTarget: 10, dcsTarget: 350, workingDays: 26 })
    });
    assert.strictEqual(ksmDcsOverRes.status, 200);
    const ksmDcsOverData = await ksmDcsOverRes.json();
    assert.strictEqual(ksmDcsOverData.results.achievabilityStatus, 'Not Achievable');
    assert.strictEqual(ksmDcsOverData.results.loads.ksmDcsDoor.isOverloaded, true);

    // 11. Coherent Simultaneous Allocation Mix Verification (30 Traction, 60 DCS) - RC-8
    // Under simultaneous allocation, the mix (T_feas, D_feas) must satisfy ALL constraints simultaneously!
    const simMixRes = await fetch('http://localhost:5005/api/simulator/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pdrToken}` },
      body: JSON.stringify({ tractionTarget: 30, dcsTarget: 60, workingDays: 26 })
    });
    assert.strictEqual(simMixRes.status, 200);
    const simMixData = await simMixRes.json();
    const tFeas = simMixData.results.feasibleTractionOutput;
    const dFeas = simMixData.results.feasibleDcsOutput;
    // Exactly 18 Traction and 40 DCS panels:
    assert.strictEqual(tFeas, 18);
    assert.strictEqual(dFeas, 40);

    // Verify simultaneously satisfied:
    // Mech: 3*t + d <= 120 -> 3*(18) + 40 = 94 <= 120
    assert.ok(3 * tFeas + dFeas <= 120, 'Mechanical constraint satisfied simultaneously');
    // HV: 5*t + 3*d <= 210 -> 5*(18) + 3*(40) = 210 <= 210 (EXACTLY 210, NEVER 212)
    assert.strictEqual(5 * tFeas + 3 * dFeas, 210, 'HV Cabling capacity strictly meets boundary of 210 units');
    assert.ok(5 * tFeas + 3 * dFeas <= 210, 'HV Cabling constraint satisfied simultaneously');
    // LV: t <= 35
    assert.ok(tFeas <= 35, 'LV Wiring constraint satisfied simultaneously');
    // Verify separate shortfalls
    assert.strictEqual(simMixData.results.shortfallTraction, 12);
    assert.strictEqual(simMixData.results.shortfallDcs, 20);

    // Traction Priority scenario: 30 Traction, 20 DCS -> 5*(30) + 3*(20) = 210 <= 210
    const tPri = simMixData.results.allocationScenarios.tractionPriority;
    assert.strictEqual(tPri.feasibleTraction, 30);
    assert.strictEqual(tPri.feasibleDcs, 20);
    assert.strictEqual(5 * tPri.feasibleTraction + 3 * tPri.feasibleDcs, 210);

    // DCS Priority scenario: 6 Traction, 60 DCS -> 5*(6) + 3*(60) = 210 <= 210
    const dPri = simMixData.results.allocationScenarios.dcsPriority;
    assert.strictEqual(dPri.feasibleTraction, 6);
    assert.strictEqual(dPri.feasibleDcs, 60);
    assert.strictEqual(5 * dPri.feasibleTraction + 3 * dPri.feasibleDcs, 210);

    // 11B. Exact Boundary Cases Around HV Capacity
    // Boundary at exactly 100%: 0 Traction, 70 DCS -> 70 / 70 = 100% -> Achievable
    const boundHitRes = await fetch('http://localhost:5005/api/simulator/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pdrToken}` },
      body: JSON.stringify({ tractionTarget: 0, dcsTarget: 70, workingDays: 26 })
    });
    const boundHitData = await boundHitRes.json();
    assert.strictEqual(boundHitData.results.achievabilityStatus, 'Achievable');
    assert.strictEqual(boundHitData.results.loads.hvCabling.isOverloaded, false);

    // Beyond boundary: 0 Traction, 71 DCS -> 71 / 70 = 101.4% -> Not Achievable
    const boundOverRes = await fetch('http://localhost:5005/api/simulator/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pdrToken}` },
      body: JSON.stringify({ tractionTarget: 0, dcsTarget: 71, workingDays: 26 })
    });
    const boundOverData = await boundOverRes.json();
    assert.strictEqual(boundOverData.results.achievabilityStatus, 'Not Achievable');
    assert.strictEqual(boundOverData.results.loads.hvCabling.isOverloaded, true);

    // 11C. LV Primary Dedicated Baseline vs Overflow Assumption
    // Target 28 Traction exceeds Team 6 primary baseline (26), relying on Teams 3-5 overflow
    // Without acceptAssumptions -> Insufficient Data
    const lvNoAcceptRes = await fetch('http://localhost:5005/api/simulator/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pdrToken}` },
      body: JSON.stringify({ tractionTarget: 28, dcsTarget: 10, workingDays: 26, acceptAssumptions: false })
    });
    const lvNoAcceptData = await lvNoAcceptRes.json();
    assert.strictEqual(lvNoAcceptData.results.achievabilityStatus, 'Insufficient Data');
    assert.ok(lvNoAcceptData.results.structuredReasons.some(r => r.includes('LV baseline')));

    // With acceptAssumptions -> Achievable
    const lvAcceptRes = await fetch('http://localhost:5005/api/simulator/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pdrToken}` },
      body: JSON.stringify({ tractionTarget: 28, dcsTarget: 10, workingDays: 26, acceptAssumptions: true })
    });
    const lvAcceptData = await lvAcceptRes.json();
    assert.strictEqual(lvAcceptData.results.achievabilityStatus, 'Achievable');

    // 12. Material Advisory Alert Check
    // When power supply demand exceeds daily preparation rate, alert is emitted as non-blocking
    const matRes = await fetch('http://localhost:5005/api/simulator/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pdrToken}` },
      body: JSON.stringify({ tractionTarget: 450, dcsTarget: 0, workingDays: 26 })
    });
    const matData = await matRes.json();
    assert.ok(matData.results.subAssemblyAlerts.length > 0);
    assert.ok(matData.results.subAssemblyAlerts[0].includes('Advisory:'));

    // 13. Overtime Productivity Multiplier and Insufficient Data Status
    // Target 25 Traction, 40 DCS exceeds baseline (Mech load = 25/40 + 40/120 = 95.8%, HV load = 25/42 + 40/70 = 59.5% + 57.1% = 116.6% > 100%)
    // With 2h overtime, multiplier = 1.25, mathematically fitting HV: 25/(42*1.25) + 40/(70*1.25) = 116.6/1.25 = 93.3% <= 100%
    // BUT overtime is an unconfirmed productivity assumption!
    // Without acceptAssumptions: returns 'Insufficient Data'
    const unconfirmedRes = await fetch('http://localhost:5005/api/simulator/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pdrToken}` },
      body: JSON.stringify({
        tractionTarget: 25,
        dcsTarget: 40,
        workingDays: 26,
        overtimeHours: 2,
        acceptAssumptions: false
      })
    });
    assert.strictEqual(unconfirmedRes.status, 200);
    const unconfirmedData = await unconfirmedRes.json();
    assert.strictEqual(unconfirmedData.results.achievabilityStatus, 'Insufficient Data');
    assert.ok(unconfirmedData.results.structuredReasons.some(r => r.includes('Unconfirmed productivity assumption')));

    // With acceptAssumptions: true -> returns 'Achievable'
    const acceptedRes = await fetch('http://localhost:5005/api/simulator/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pdrToken}` },
      body: JSON.stringify({
        tractionTarget: 25,
        dcsTarget: 40,
        workingDays: 26,
        overtimeHours: 2,
        acceptAssumptions: true
      })
    });
    assert.strictEqual(acceptedRes.status, 200);
    const acceptedData = await acceptedRes.json();
    assert.strictEqual(acceptedData.results.achievabilityStatus, 'Achievable');

    // 14. Overtime Validation Bound (Overtime > 8 rejected)
    const excessOtRes = await fetch('http://localhost:5005/api/simulator/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pdrToken}` },
      body: JSON.stringify({ tractionTarget: 10, dcsTarget: 20, overtimeHours: 10 })
    });
    assert.strictEqual(excessOtRes.status, 400);
    const excessOtBody = await excessOtRes.json();
    assert.ok(excessOtBody.error.includes('between 0 and 8'));
  });

  await t.test('Monthly Plan Target Input Validation', async () => {
    // 1. Negative plan rejected
    const negPlanRes = await fetch('http://localhost:5005/api/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pdrToken}` },
      body: JSON.stringify({
        month: '2026-10',
        area: 'PDR',
        teamOrPerson: 'PDR Team 1',
        tractionPlan: -1,
        dcsPlan: 2
      })
    });
    assert.strictEqual(negPlanRes.status, 400);

    // 2. Fractional plan rejected
    const fracPlanRes = await fetch('http://localhost:5005/api/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pdrToken}` },
      body: JSON.stringify({
        month: '2026-10',
        area: 'PDR',
        teamOrPerson: 'PDR Team 1',
        tractionPlan: 1.5,
        dcsPlan: 2
      })
    });
    assert.strictEqual(fracPlanRes.status, 400);

    // 3. Invalid month format rejected
    const badMonthRes = await fetch('http://localhost:5005/api/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pdrToken}` },
      body: JSON.stringify({
        month: 'invalid-month',
        area: 'PDR',
        teamOrPerson: 'PDR Team 1',
        tractionPlan: 1,
        dcsPlan: 2
      })
    });
    assert.strictEqual(badMonthRes.status, 400);
  });

  await t.test('Automated Integer Constraint Verification Across Scenarios', async () => {
    const testCases = [
      { tractionTarget: 0, dcsTarget: 0, workingDays: 26 },
      { tractionTarget: 10, dcsTarget: 20, workingDays: 26 },
      { tractionTarget: 20, dcsTarget: 30, workingDays: 26 },
      { tractionTarget: 0, dcsTarget: 70, workingDays: 26 },
      { tractionTarget: 40, dcsTarget: 0, workingDays: 26, acceptAssumptions: true },
      { tractionTarget: 25, dcsTarget: 40, workingDays: 26, overtimeHours: 2, acceptAssumptions: true },
      { tractionTarget: 40, dcsTarget: 60, workingDays: 26 },
      { tractionTarget: 10, dcsTarget: 100, workingDays: 26 },
      { tractionTarget: 30, dcsTarget: 60, workingDays: 26 },
      { tractionTarget: 50, dcsTarget: 80, workingDays: 26, overtimeHours: 4, additionalMechanicalWorkers: 2, additionalElectricalTeams: 4, acceptAssumptions: true }
    ];

    for (const tc of testCases) {
      const res = await fetch('http://localhost:5005/api/simulator/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pdrToken}` },
        body: JSON.stringify(tc)
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      const r = data.results;

      const ot = tc.overtimeHours || 0;
      const shifts = tc.extraShifts || 0;
      const mult = 1 + (ot / 8) + shifts;
      const mechWorkers = 4 + (tc.additionalMechanicalWorkers || 0);
      const hvTeams = 14 + (tc.additionalElectricalTeams || 0);
      const mechUnitLimit = mechWorkers * 30 * mult;
      const hvUnitLimit = hvTeams * 15 * mult;
      const lvLimit = r.loads.lvWiring.monthlyCap;
      const ksmTracLimit = r.loads.ksmStage1.monthlyCap;
      const ksmDcsLimit = r.loads.ksmDcsDoor.monthlyCap;

      // 1. If Achievable, requested targets must strictly meet all limits
      if (r.achievabilityStatus === 'Achievable') {
        assert.strictEqual(r.feasibleTractionOutput, tc.tractionTarget);
        assert.strictEqual(r.feasibleDcsOutput, tc.dcsTarget);
        assert.ok(3 * tc.tractionTarget + tc.dcsTarget <= mechUnitLimit + 1e-6);
        assert.ok(5 * tc.tractionTarget + 3 * tc.dcsTarget <= hvUnitLimit + 1e-6);
        assert.ok(tc.tractionTarget <= lvLimit + 1e-6);
        assert.ok(tc.tractionTarget <= ksmTracLimit + 1e-6);
        assert.ok(tc.dcsTarget <= ksmDcsLimit + 1e-6);
      }

      // 2. For ALL scenarios, every recommended integer output MUST satisfy all limits simultaneously
      const scenarios = [
        r.allocationScenarios.balancedMix,
        r.allocationScenarios.tractionPriority,
        r.allocationScenarios.dcsPriority
      ];

      for (const s of scenarios) {
        const t = s.feasibleTraction;
        const d = s.feasibleDcs;
        assert.ok(t >= 0 && t <= tc.tractionTarget);
        assert.ok(d >= 0 && d <= tc.dcsTarget);
        assert.ok(3 * t + d <= mechUnitLimit + 1e-6, `Mech limit exceeded: 3*${t} + ${d} > ${mechUnitLimit}`);
        assert.ok(5 * t + 3 * d <= hvUnitLimit + 1e-6, `HV limit exceeded: 5*${t} + 3*${d} > ${hvUnitLimit}`);
        assert.ok(t <= lvLimit + 1e-6, `LV limit exceeded: ${t} > ${lvLimit}`);
        assert.ok(t <= ksmTracLimit + 1e-6, `KSM Trac limit exceeded: ${t} > ${ksmTracLimit}`);
        assert.ok(d <= ksmDcsLimit + 1e-6, `KSM DCS limit exceeded: ${d} > ${ksmDcsLimit}`);
        assert.strictEqual(s.shortfallTraction, tc.tractionTarget - t);
        assert.strictEqual(s.shortfallDcs, tc.dcsTarget - d);
      }
    }
  });

  server.close();
});
