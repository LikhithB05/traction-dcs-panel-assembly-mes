import { PDR_MECHANICAL_MANPOWER } from '../data/masterData.js';

export class SimulatorService {
  static runSimulation(inputParams) {
    const {
      tractionTarget = 10,
      dcsTarget = 20,
      workingDays = 26,
      overtimeHours = 0,
      additionalMechanicalWorkers = 0,
      additionalElectricalTeams = 0,
      extraShifts = 0,
      acceptAssumptions = false
    } = inputParams;

    const tTarget = Number(tractionTarget);
    const dTarget = Number(dcsTarget);
    const days = Number(workingDays);
    const ot = Number(overtimeHours);
    const addMech = Number(additionalMechanicalWorkers);
    const addElec = Number(additionalElectricalTeams);
    const shifts = Number(extraShifts);

    const hoursMultiplier = 1 + (ot / 8) + shifts;

    const baseMechCount = PDR_MECHANICAL_MANPOWER.length;
    const totalMechCount = baseMechCount + addMech;
    const totalMechTractionCap = totalMechCount * 10 * hoursMultiplier;
    const totalMechDcsCap = totalMechCount * 30 * hoursMultiplier;
    const mechTractionLoadFrac = totalMechTractionCap > 0 ? tTarget / totalMechTractionCap : (tTarget > 0 ? 1 : 0);
    const mechDcsLoadFrac = totalMechDcsCap > 0 ? dTarget / totalMechDcsCap : (dTarget > 0 ? 1 : 0);
    const combinedMechLoadPercent = Math.round((mechTractionLoadFrac + mechDcsLoadFrac) * 100 * 10) / 10;

    const baseHvTeamsCount = 5 + 9;
    const totalHvTeamsCount = baseHvTeamsCount + addElec;
    const totalHvTractionCap = totalHvTeamsCount * 3 * hoursMultiplier;
    const totalHvDcsCap = totalHvTeamsCount * 5 * hoursMultiplier;
    const hvTractionLoadFrac = totalHvTractionCap > 0 ? tTarget / totalHvTractionCap : (tTarget > 0 ? 1 : 0);
    const hvDcsLoadFrac = totalHvDcsCap > 0 ? dTarget / totalHvDcsCap : (dTarget > 0 ? 1 : 0);
    const combinedHvLoadPercent = Math.round((hvTractionLoadFrac + hvDcsLoadFrac) * 100 * 10) / 10;

    const lvPrimaryCap = 1 * days * hoursMultiplier;
    const lvOverflowCap = 3 * 3 * hoursMultiplier;
    const lvMonthlyCap = lvPrimaryCap + lvOverflowCap;
    const lvLoadPercent = lvMonthlyCap > 0 ? Math.round((tTarget / lvMonthlyCap) * 100 * 10) / 10 : (tTarget > 0 ? 100 : 0);

    const ksmTractionCap = 2 * days * hoursMultiplier;
    const ksmDcsDoorCap = 12 * days * hoursMultiplier;
    const ksmTractionLoadPercent = ksmTractionCap > 0 ? Math.round((tTarget / ksmTractionCap) * 100 * 10) / 10 : (tTarget > 0 ? 100 : 0);
    const ksmDcsLoadPercent = ksmDcsDoorCap > 0 ? Math.round((dTarget / ksmDcsDoorCap) * 100 * 10) / 10 : (dTarget > 0 ? 100 : 0);

    const subAssemblyAlerts = [];
    const totalPowerSupplyDemand = tTarget * 4;
    const assumedDailySupplyCap = 60 * days * hoursMultiplier;
    if (totalPowerSupplyDemand > assumedDailySupplyCap) {
      subAssemblyAlerts.push(
        `Advisory: Estimated power supply demand (${totalPowerSupplyDemand} units at unconfirmed 4/panel) exceeds standard preparation rate (${assumedDailySupplyCap} units). Material warning is non-blocking.`
      );
    }

    const mechOverloaded = combinedMechLoadPercent > 100;
    const hvOverloaded = combinedHvLoadPercent > 100;
    const lvOverloaded = lvLoadPercent > 100;
    const ksmStage1Overloaded = ksmTractionLoadPercent > 100;
    const ksmDcsDoorOverloaded = ksmDcsLoadPercent > 100;

    const isOverloaded = mechOverloaded || hvOverloaded || lvOverloaded || ksmStage1Overloaded || ksmDcsDoorOverloaded;

    const overloadedConstraints = [];
    if (mechOverloaded) overloadedConstraints.push(`PDR Mechanical (${combinedMechLoadPercent}% load)`);
    if (hvOverloaded) overloadedConstraints.push(`HV Cabling (${combinedHvLoadPercent}% load)`);
    if (lvOverloaded) overloadedConstraints.push(`LV Wiring (${lvLoadPercent}% load)`);
    if (ksmStage1Overloaded) overloadedConstraints.push(`KSM Stage 1 (${ksmTractionLoadPercent}% load)`);
    if (ksmDcsDoorOverloaded) overloadedConstraints.push(`KSM DCS Doors (${ksmDcsLoadPercent}% load)`);

    const isMixFeasible = (t, d) => {
      if (t < 0 || d < 0) return false;
      if (t > tTarget || d > dTarget) return false;
      const mLoad = totalMechTractionCap > 0 && totalMechDcsCap > 0 ? (t / totalMechTractionCap) + (d / totalMechDcsCap) : (t > 0 || d > 0 ? 2 : 0);
      if (mLoad > 1.0000001) return false;
      const hLoad = totalHvTractionCap > 0 && totalHvDcsCap > 0 ? (t / totalHvTractionCap) + (d / totalHvDcsCap) : (t > 0 || d > 0 ? 2 : 0);
      if (hLoad > 1.0000001) return false;
      if (t > lvMonthlyCap + 1e-7) return false;
      if (t > ksmTractionCap + 1e-7) return false;
      if (d > ksmDcsDoorCap + 1e-7) return false;
      return true;
    };

    const alphaMech = (tTarget > 0 || dTarget > 0) && (totalMechTractionCap > 0 && totalMechDcsCap > 0) ? 1 / Math.max(1e-9, (tTarget / totalMechTractionCap) + (dTarget / totalMechDcsCap)) : 1;
    const alphaHv = (tTarget > 0 || dTarget > 0) && (totalHvTractionCap > 0 && totalHvDcsCap > 0) ? 1 / Math.max(1e-9, (tTarget / totalHvTractionCap) + (dTarget / totalHvDcsCap)) : 1;
    const alphaLv = tTarget > 0 ? lvMonthlyCap / tTarget : 1;
    const alphaKsmTrac = tTarget > 0 ? ksmTractionCap / tTarget : 1;
    const alphaKsmDcs = dTarget > 0 ? ksmDcsDoorCap / dTarget : 1;

    const constraintsList = [
      { name: 'PDR Mechanical', alpha: alphaMech, load: combinedMechLoadPercent },
      { name: 'HV Cabling', alpha: alphaHv, load: combinedHvLoadPercent },
      { name: 'LV Wiring', alpha: alphaLv, load: lvLoadPercent },
      { name: 'KSM Stage 1', alpha: alphaKsmTrac, load: ksmTractionLoadPercent },
      { name: 'KSM DCS Doors', alpha: alphaKsmDcs, load: ksmDcsLoadPercent }
    ].sort((a, b) => a.alpha - b.alpha);

    const mostLimiting = constraintsList[0];
    const limitingConstraint = isOverloaded ? `${mostLimiting.name} (${mostLimiting.load}% load)` : 'None (Targets within all limits)';

    let feasibleTraction = tTarget;
    let feasibleDcs = dTarget;

    if (!isMixFeasible(tTarget, dTarget)) {
      const alphaLim = Math.min(1, mostLimiting.alpha);
      const baseT = Math.floor(alphaLim * tTarget);
      const baseD = Math.floor(alphaLim * dTarget);
      let bestT = 0;
      let bestD = 0;
      let maxScore = -1;

      for (let t = Math.max(0, baseT - 5); t <= Math.min(tTarget, baseT + 5); t++) {
        for (let d = Math.max(0, baseD - 5); d <= Math.min(dTarget, baseD + 5); d++) {
          if (isMixFeasible(t, d)) {
            const ratioPenalty = (tTarget > 0 && dTarget > 0) ? Math.abs((t / tTarget) - (d / dTarget)) : 0;
            const score = (t + d) - (ratioPenalty * 10);
            if (score > maxScore) {
              maxScore = score;
              bestT = t;
              bestD = d;
            }
          }
        }
      }
      feasibleTraction = bestT;
      feasibleDcs = bestD;
    }

    let tPriMax = 0;
    while (tPriMax + 1 <= tTarget && isMixFeasible(tPriMax + 1, 0)) tPriMax++;
    let dPriResid = 0;
    while (dPriResid + 1 <= dTarget && isMixFeasible(tPriMax, dPriResid + 1)) dPriResid++;

    let dPriMax = 0;
    while (dPriMax + 1 <= dTarget && isMixFeasible(0, dPriMax + 1)) dPriMax++;
    let tPriResid = 0;
    while (tPriResid + 1 <= tTarget && isMixFeasible(tPriResid + 1, dPriMax)) tPriResid++;

    if (!isMixFeasible(feasibleTraction, feasibleDcs)) { feasibleTraction = 0; feasibleDcs = 0; }
    if (!isMixFeasible(tPriMax, dPriResid)) { tPriMax = 0; dPriResid = 0; }
    if (!isMixFeasible(tPriResid, dPriMax)) { tPriResid = 0; dPriMax = 0; }

    const shortfallTraction = Math.max(0, tTarget - feasibleTraction);
    const shortfallDcs = Math.max(0, dTarget - feasibleDcs);

    let achievabilityStatus = 'Achievable';
    let summaryNotes = 'Resource capacity is adequate for the requested targets.';
    const structuredReasons = [];

    const baseMechFit = (totalMechCount === baseMechCount && hoursMultiplier === 1) ? !mechOverloaded : (tTarget / (baseMechCount * 10) + dTarget / (baseMechCount * 30)) <= 1.0001;
    const baseHvFit = (totalHvTeamsCount === baseHvTeamsCount && hoursMultiplier === 1) ? !hvOverloaded : (tTarget / (baseHvTeamsCount * 3) + dTarget / (baseHvTeamsCount * 5)) <= 1.0001;
    const fitsInConfirmedBaseline = baseMechFit && baseHvFit && (tTarget <= days) && (tTarget <= 2 * days) && (dTarget <= 12 * days);

    if (isOverloaded) {
      achievabilityStatus = 'Not Achievable';
      summaryNotes = `Capacity shortfall detected in: ${overloadedConstraints.join(', ')}. Overload exceeds 100% threshold.`;
      structuredReasons.push(`Confirmed mandatory constraint(s) exceeded: ${overloadedConstraints.join('; ')}.`);
    } else if (fitsInConfirmedBaseline && hoursMultiplier === 1 && addMech === 0 && addElec === 0) {
      achievabilityStatus = 'Achievable';
      summaryNotes = 'Resource capacity is adequate for the requested targets under confirmed baseline resources.';
      structuredReasons.push('Every mandatory constraint is satisfied within verified base factory capacity.');
    } else if (acceptAssumptions) {
      achievabilityStatus = 'Achievable';
      summaryNotes = `Targets achievable under explicitly accepted operational assumptions (multiplier: ${Math.round(hoursMultiplier * 100) / 100}x).`;
      const acceptedItems = [];
      if (ot > 0) acceptedItems.push(`${ot}h overtime`);
      if (shifts > 0) acceptedItems.push(`${shifts} extra shifts`);
      if (addMech > 0) acceptedItems.push(`+${addMech} mech workers`);
      if (addElec > 0) acceptedItems.push(`+${addElec} elec teams`);
      if (tTarget > days) acceptedItems.push('LV overflow support from Teams 3-5');
      structuredReasons.push(`Feasible with accepted operational assumptions: ${acceptedItems.join(', ')}.`);
    } else {
      achievabilityStatus = 'Insufficient Data';
      summaryNotes = 'Feasibility relies on unconfirmed operational assumptions (overtime, shifts, additional headcount, or shared LV overflow). Confirm assumptions to certify achievability.';
      if (hoursMultiplier > 1) structuredReasons.push('Unconfirmed productivity assumption: Overtime or additional shifts are assumed to yield linear proportional output.');
      if (addMech > 0 || addElec > 0) structuredReasons.push(`Unconfirmed resource assumption: Headcount addition (+${addMech} mechanical, +${addElec} electrical) requires qualification verification.`);
      if (tTarget > days && tTarget <= lvMonthlyCap) structuredReasons.push(`Unconfirmed operational assumption: Traction target (${tTarget}) exceeds dedicated Team 6 LV baseline (${days} panels/month) and relies on backup teams (Teams 3, 4, 5) without accounted deduction from HV cabling.`);
    }

    return {
      inputs: inputParams,
      results: {
        achievabilityStatus,
        summaryNotes,
        limitingConstraint,
        feasibleTractionOutput: feasibleTraction,
        feasibleDcsOutput: feasibleDcs,
        targetTraction: tTarget,
        targetDcs: dTarget,
        shortfallTraction,
        shortfallDcs,
        allocationScenarios: {
          balancedMix: { feasibleTraction, feasibleDcs, shortfallTraction, shortfallDcs, description: 'Proportionally preserves the requested Traction/DCS target ratio simultaneously' },
          tractionPriority: { feasibleTraction: tPriMax, feasibleDcs: dPriResid, shortfallTraction: Math.max(0, tTarget - tPriMax), shortfallDcs: Math.max(0, dTarget - dPriResid), description: 'Prioritizes Traction demand first, allocating remaining shared capacity to DCS' },
          dcsPriority: { feasibleTraction: tPriResid, feasibleDcs: dPriMax, shortfallTraction: Math.max(0, tTarget - tPriResid), shortfallDcs: Math.max(0, dTarget - dPriMax), description: 'Prioritizes DCS demand first, allocating remaining shared capacity to Traction' }
        },
        loads: {
          mechanical: { combinedLoadPercent: combinedMechLoadPercent, isOverloaded: mechOverloaded, headcount: totalMechCount, tractionCap: totalMechTractionCap, dcsCap: totalMechDcsCap },
          hvCabling: { combinedLoadPercent: combinedHvLoadPercent, isOverloaded: hvOverloaded, teamsCount: totalHvTeamsCount, tractionCap: totalHvTractionCap, dcsCap: totalHvDcsCap },
          lvWiring: { loadPercent: lvLoadPercent, isOverloaded: lvOverloaded, primaryCap: lvPrimaryCap, overflowCap: lvOverflowCap, monthlyCap: lvMonthlyCap },
          ksmStage1: { loadPercent: ksmTractionLoadPercent, isOverloaded: ksmStage1Overloaded, monthlyCap: ksmTractionCap },
          ksmDcsDoor: { loadPercent: ksmDcsLoadPercent, isOverloaded: ksmDcsDoorOverloaded, monthlyCap: ksmDcsDoorCap }
        },
        productivityMetrics: {
          baseShiftHours: 8,
          overtimeHours: ot,
          extraShifts: shifts,
          assumedProductivityMultiplier: Math.round(hoursMultiplier * 1000) / 1000,
          isMultiplierAssumed: hoursMultiplier > 1,
          baseCapacities: {
            mechanical: { traction: baseMechCount * 10, dcs: baseMechCount * 30 },
            hvCabling: { traction: baseHvTeamsCount * 3, dcs: baseHvTeamsCount * 5 },
            lvWiringPrimary: days,
            lvWiringWithOverflow: days + 9,
            ksmStage1: 2 * days,
            ksmDcsDoors: 12 * days
          }
        },
        structuredReasons,
        subAssemblyAlerts,
        assumptions: [
          `Working days = ${days} days/month (documented conversion assumption)`,
          'Shared capacity formula: Load % = Σ (Target / Capacity) * 100',
          'HV Team capacity = 3 Traction OR 5 DCS / month (assumed monthly period)',
          'Mechanical person capacity = 10 Traction OR 30 DCS / month (assumed per individual worker)',
          `Primary LV Wiring capacity = 1 Traction panel/day (PDR Team 6) = ${days} panels/month. Additional 9 panels/month assumes overflow support from PDR Teams 3, 4, 5 (which are also assigned to HV cabling; unconfirmed operational sharing assumption)`,
          `KSM Mechanical Stage 1: 2 panels/day (KSM-OP-1 + KSM-OP-2) = ${2 * days} panels/month`,
          `KSM DCS doors: 12 doors and 4 side covers/day. Current model assumes 1 door set per DCS panel (${12 * days} panels/month equivalent; unconfirmed conversion factor)`,
          'Overtime productivity multiplier is unconfirmed; linear scaling assumed until validated'
        ]
      }
    };
  }
}

