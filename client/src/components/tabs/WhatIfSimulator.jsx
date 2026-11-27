import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../utils/api.js';
import {
  Sliders, Play, RotateCcw, BookmarkPlus, Trash2,
  CheckCircle2, AlertTriangle, ShieldCheck, Info, Scale, ArrowRight, HelpCircle
} from 'lucide-react';

export default function WhatIfSimulator() {
  const [tractionTarget, setTractionTarget] = useState(25);
  const [dcsTarget, setDcsTarget] = useState(50);
  const [workingDays, setWorkingDays] = useState(26);
  const [overtimeHours, setOvertimeHours] = useState(0);
  const [addMechWorkers, setAddMechWorkers] = useState(0);
  const [addElecTeams, setAddElecTeams] = useState(0);
  const [extraShifts, setExtraShifts] = useState(0);
  const [acceptAssumptions, setAcceptAssumptions] = useState(false);
  const [scenarioName, setScenarioName] = useState('High Demand Scenario');
  const [scenarioNotes, setScenarioNotes] = useState('Testing factory output feasibility under surge orders');

  const [simulationResult, setSimulationResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const [savedScenarios, setSavedScenarios] = useState([]);
  const [comparisonScenario, setComparisonScenario] = useState(null);
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const requestIdRef = useRef(0);

  const fetchScenarios = async () => {
    try {
      const data = await api.get('/simulator/scenarios');
      setSavedScenarios(Array.isArray(data) ? data : []);
    } catch (e) {
      setErrorMsg('Notice: Could not load saved scenarios from server.');
    }
  };

  useEffect(() => {
    fetchScenarios();
    handleRunSimulation();
  }, []);

  const handleRunSimulation = async (params = null) => {
    const currentReqId = ++requestIdRef.current;
    try {
      setLoading(true);
      setErrorMsg('');

      const p = params || {
        tractionTarget: Number(tractionTarget),
        dcsTarget: Number(dcsTarget),
        workingDays: Number(workingDays),
        overtimeHours: Number(overtimeHours),
        additionalMechanicalWorkers: Number(addMechWorkers),
        additionalElectricalTeams: Number(addElecTeams),
        extraShifts: Number(extraShifts),
        acceptAssumptions: Boolean(acceptAssumptions)
      };

      const res = await api.post('/simulator/simulate', p);
      if (currentReqId === requestIdRef.current) {
        setSimulationResult(res);
        setIsStale(false);
      }
    } catch (err) {
      if (currentReqId === requestIdRef.current) {
        setSimulationResult(null);
        setErrorMsg(err.message || 'Simulation run failed.');
      }
    } finally {
      if (currentReqId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  const handleReset = () => {
    const defaults = {
      tractionTarget: 10,
      dcsTarget: 20,
      workingDays: 26,
      overtimeHours: 0,
      additionalMechanicalWorkers: 0,
      additionalElectricalTeams: 0,
      extraShifts: 0,
      acceptAssumptions: false
    };
    setTractionTarget(defaults.tractionTarget);
    setDcsTarget(defaults.dcsTarget);
    setWorkingDays(defaults.workingDays);
    setOvertimeHours(defaults.overtimeHours);
    setAddMechWorkers(defaults.additionalMechanicalWorkers);
    setAddElecTeams(defaults.additionalElectricalTeams);
    setExtraShifts(defaults.extraShifts);
    setAcceptAssumptions(defaults.acceptAssumptions);
    setScenarioName('Standard Factory Baseline');
    setScenarioNotes('Standard 1-shift 26-day operation with baseline personnel');
    setComparisonScenario(null);
    setIsStale(false);
    setErrorMsg('');
    handleRunSimulation(defaults);
  };

  const handleSaveScenario = async () => {
    if (loading || isStale || !simulationResult) {
      setErrorMsg('Cannot save: simulation result is outdated or currently calculating. Please rerun simulation first.');
      return;
    }

    if (!scenarioName.trim()) {
      setErrorMsg('Please enter a scenario name.');
      return;
    }

    try {
      await api.post('/simulator/scenarios', {
        name: scenarioName.trim(),
        notes: scenarioNotes.trim(),
        scenarioData: simulationResult
      });

      setFeedbackMsg(`Scenario "${scenarioName.trim()}" saved successfully.`);
      setTimeout(() => setFeedbackMsg(''), 4000);
      fetchScenarios();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to save scenario.');
    }
  };

  const handleDeleteScenario = async (id) => {
    try {
      await api.delete(`/simulator/scenarios/${id}`);
      fetchScenarios();
      if (comparisonScenario?.id === id) setComparisonScenario(null);
      setFeedbackMsg('Scenario deleted successfully.');
      setTimeout(() => setFeedbackMsg(''), 3000);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to delete scenario.');
    }
  };

  const handleSelectForComparison = (scen) => {
    if (!scen || !scen.scenarioData || !scen.scenarioData.results) {
      setErrorMsg('Cannot compare: Stored scenario has missing or invalid simulation data.');
      return;
    }
    setComparisonScenario(scen);
  };


  return (
    <div className="space-y-6">
      {/* Tab Banner */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 card-accent-simulator p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800 tracking-tight flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-600"></span>
              <span>Standalone What-If Capacity Simulator</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Simulate monthly target feasibility, resource adjustments, and bottleneck impacts in total isolation from live production data.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <span className="px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold">
              Isolated Sandbox Mode
            </span>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="p-3 bg-red-50 border-l-4 border-red-500 text-red-700 text-xs rounded-lg flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg('')} className="font-bold">✕</button>
        </div>
      )}

      {feedbackMsg && (
        <div className="p-3 bg-emerald-50 border-l-4 border-emerald-500 text-emerald-800 text-xs rounded-lg flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{feedbackMsg}</span>
          </div>
          <button onClick={() => setFeedbackMsg('')} className="font-bold">✕</button>
        </div>
      )}

      {/* Main Grid: Controls vs Results */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Input Parameters Panel */}
        <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-4 text-xs">
          <h3 className="font-bold text-slate-800 uppercase tracking-wider text-xs border-b border-slate-100 pb-2 flex items-center space-x-2">
            <Sliders className="w-4 h-4 text-indigo-600" />
            <span>Scenario Parameters</span>
          </h3>

          <div className="space-y-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Scenario Name</label>
              <input
                type="text"
                value={scenarioName}
                onChange={(e) => setScenarioName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-medium text-slate-800 focus:ring-2 focus:ring-indigo-600 outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Traction Target / mo</label>
                <input
                  type="number"
                  min="0"
                  value={tractionTarget}
                  onChange={(e) => { setTractionTarget(e.target.value); setIsStale(true); }}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-bold text-slate-800 focus:ring-2 focus:ring-indigo-600 outline-none"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">DCS Target / mo</label>
                <input
                  type="number"
                  min="0"
                  value={dcsTarget}
                  onChange={(e) => { setDcsTarget(e.target.value); setIsStale(true); }}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-bold text-slate-800 focus:ring-2 focus:ring-indigo-600 outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Working Days / mo</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={workingDays}
                  onChange={(e) => { setWorkingDays(e.target.value); setIsStale(true); }}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-medium text-slate-800 focus:ring-2 focus:ring-indigo-600 outline-none"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Overtime (Hours / day)</label>
                <input
                  type="number"
                  min="0"
                  max="8"
                  value={overtimeHours}
                  onChange={(e) => { setOvertimeHours(e.target.value); setIsStale(true); }}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-medium text-slate-800 focus:ring-2 focus:ring-indigo-600 outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">+ Mechanical Workers</label>
                <input
                  type="number"
                  min="0"
                  value={addMechWorkers}
                  onChange={(e) => { setAddMechWorkers(e.target.value); setIsStale(true); }}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-medium text-slate-800 focus:ring-2 focus:ring-indigo-600 outline-none"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">+ Electrical Teams</label>
                <input
                  type="number"
                  min="0"
                  value={addElecTeams}
                  onChange={(e) => { setAddElecTeams(e.target.value); setIsStale(true); }}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-medium text-slate-800 focus:ring-2 focus:ring-indigo-600 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Extra Daily Shifts (0 = normal 1 shift)</label>
              <select
                value={extraShifts}
                onChange={(e) => { setExtraShifts(e.target.value); setIsStale(true); }}
                className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-medium text-slate-800 focus:ring-2 focus:ring-indigo-600 outline-none"
              >
                <option value="0">Standard (1 Shift / day)</option>
                <option value="1">Double Shift (+100% capacity)</option>
                <option value="2">Triple Shift (+200% capacity)</option>
              </select>
            </div>

            <div className="flex items-center space-x-2 pt-1">
              <input
                type="checkbox"
                id="acceptAssumptionsCheck"
                checked={acceptAssumptions}
                onChange={(e) => { setAcceptAssumptions(e.target.checked); setIsStale(true); }}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
              />
              <label htmlFor="acceptAssumptionsCheck" className="text-[11px] font-medium text-slate-600 select-none cursor-pointer">
                Accept unconfirmed productivity multipliers
              </label>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Scenario Notes</label>
              <textarea
                rows={2}
                value={scenarioNotes}
                onChange={(e) => setScenarioNotes(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded p-2 text-slate-800 focus:ring-2 focus:ring-indigo-600 outline-none"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center space-x-2">
            <button
              onClick={() => handleRunSimulation()}
              disabled={loading}
              className="flex-1 bg-indigo-700 hover:bg-indigo-800 text-white font-bold py-2 px-3 rounded-lg shadow transition flex items-center justify-center space-x-1.5 disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{loading ? 'Running...' : 'Run Simulation'}</span>
            </button>
            <button
              onClick={handleReset}
              className="p-2 border border-slate-300 hover:bg-slate-50 text-slate-600 rounded-lg transition"
              title="Reset Defaults"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={handleSaveScenario}
              disabled={loading || isStale || !simulationResult || Boolean(errorMsg)}
              className="p-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
              title={isStale ? "Re-run simulation before saving" : "Save Scenario"}
            >
              <BookmarkPlus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Feasibility & Simulation Results Panel */}
        <div className="lg:col-span-2 space-y-6">
          {simulationResult && (
            <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-5">
              {/* Stale warning banner */}
              {isStale && (
                <div className="p-3 bg-amber-50 border-l-4 border-amber-500 text-amber-900 rounded-lg text-xs flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span><strong>Inputs have changed:</strong> Output below is outdated. Click "Run Simulation" to recalculate.</span>
                  </div>
                  <button
                    onClick={() => handleRunSimulation()}
                    disabled={loading}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-2.5 py-1 rounded text-xs transition"
                  >
                    Recalculate
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center space-x-2">
                  <h3 className="font-bold text-slate-900 text-sm">Simulation Output & Feasibility Assessment</h3>
                </div>
                <div className="flex items-center space-x-2">
                  {isStale && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                      Outdated
                    </span>
                  )}
                  <span className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wide flex items-center space-x-1 border ${
                    simulationResult.results.achievabilityStatus === 'Achievable'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : simulationResult.results.achievabilityStatus === 'Insufficient Data'
                        ? 'bg-amber-100 text-amber-800 border-amber-300'
                        : 'bg-red-100 text-red-800 border-red-300'
                  }`}>
                    {simulationResult.results.achievabilityStatus === 'Achievable' ? (
                      <ShieldCheck className="w-3.5 h-3.5" />
                    ) : simulationResult.results.achievabilityStatus === 'Insufficient Data' ? (
                      <HelpCircle className="w-3.5 h-3.5" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5" />
                    )}
                    <span>Status: {simulationResult.results.achievabilityStatus}</span>
                  </span>
                </div>
              </div>

              {/* KPI Results Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div className="bg-slate-50 p-2.5 rounded-lg text-center border border-slate-200">
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Traction Target</span>
                  <span className="text-base font-bold text-indigo-700">{simulationResult.results.targetTraction}</span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg text-center border border-slate-200">
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Feasible Traction</span>
                  <span className="text-base font-bold text-emerald-700">{simulationResult.results.feasibleTractionOutput}</span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg text-center border border-slate-200">
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Traction Shortfall</span>
                  <span className={`text-base font-bold ${simulationResult.results.shortfallTraction > 0 ? 'text-red-600' : 'text-slate-700'}`}>
                    {simulationResult.results.shortfallTraction}
                  </span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg text-center border border-slate-200">
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">DCS Target</span>
                  <span className="text-base font-bold text-cyan-700">{simulationResult.results.targetDcs}</span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg text-center border border-slate-200">
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Feasible DCS</span>
                  <span className="text-base font-bold text-emerald-700">{simulationResult.results.feasibleDcsOutput ?? '-'}</span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg text-center border border-slate-200">
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">DCS Shortfall</span>
                  <span className={`text-base font-bold ${simulationResult.results.shortfallDcs > 0 ? 'text-red-600' : 'text-slate-700'}`}>
                    {simulationResult.results.shortfallDcs ?? 0}
                  </span>
                </div>
              </div>

              {/* Limiting Constraint Banner */}
              {simulationResult.results.limitingConstraint && (
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs flex items-center justify-between">
                  <span className="font-bold text-slate-700">Authoritative Bottleneck Constraint:</span>
                  <span className="font-semibold text-slate-900 bg-slate-200/70 px-2 py-0.5 rounded">
                    {simulationResult.results.limitingConstraint}
                  </span>
                </div>
              )}

              {/* Workstation Load Breakdowns */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Resource Utilization Breakdown
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  {/* Mechanical */}
                  <div className={`p-3 rounded-lg border ${
                    simulationResult.results.loads.mechanical.isOverloaded
                      ? 'bg-red-50/50 border-red-300 text-red-900'
                      : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold">PDR Mechanical</span>
                      <span className="font-mono font-bold text-xs">
                        {simulationResult.results.loads.mechanical.combinedLoadPercent}%
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Headcount: {simulationResult.results.loads.mechanical.headcount} workers
                    </p>
                  </div>

                  {/* HV Cabling */}
                  <div className={`p-3 rounded-lg border ${
                    simulationResult.results.loads.hvCabling.isOverloaded
                      ? 'bg-red-50/50 border-red-300 text-red-900'
                      : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold">HV Cabling</span>
                      <span className="font-mono font-bold text-xs">
                        {simulationResult.results.loads.hvCabling.combinedLoadPercent}%
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Capacity: {simulationResult.results.loads.hvCabling.teamsCount} teams
                    </p>
                  </div>

                  {/* LV Wiring */}
                  <div className={`p-3 rounded-lg border ${
                    simulationResult.results.loads.lvWiring.isOverloaded
                      ? 'bg-red-50/50 border-red-300 text-red-900'
                      : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold">LV Wiring</span>
                      <span className="font-mono font-bold text-xs">
                        {simulationResult.results.loads.lvWiring.loadPercent}%
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Monthly Cap: {simulationResult.results.loads.lvWiring.monthlyCap} panels
                    </p>
                  </div>
                </div>
              </div>

              {/* Structured Reasons & Notes */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 space-y-1">
                <div>
                  <span className="font-bold text-slate-800">Operational Assessment: </span>
                  <span>{simulationResult.results.summaryNotes}</span>
                </div>
                {simulationResult.results.structuredReasons && simulationResult.results.structuredReasons.length > 0 && (
                  <ul className="list-disc pl-4 text-slate-600 text-[11px] space-y-0.5 pt-1 border-t border-slate-200">
                    {simulationResult.results.structuredReasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                )}
              </div>


              {/* Stated Factory Assumptions */}
              <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-lg text-[11px] text-indigo-900 space-y-1">
                <span className="font-bold block flex items-center space-x-1 text-indigo-800">
                  <Info className="w-3.5 h-3.5" />
                  <span>Configured Factory Assumptions:</span>
                </span>
                <ul className="list-disc pl-4 space-y-0.5 text-indigo-800/80">
                  {simulationResult.results.assumptions.map((asm, i) => (
                    <li key={i}>{asm}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Side-by-Side Scenario Comparison Card */}
          {comparisonScenario && (
            <div className="p-4 bg-indigo-50/40 border border-indigo-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between border-b border-indigo-100 pb-2">
                <div className="flex items-center space-x-2">
                  <Scale className="w-4 h-4 text-indigo-700" />
                  <h4 className="font-bold text-indigo-900 text-xs uppercase tracking-wider">
                    Side-by-Side Comparison: Current Active vs "{comparisonScenario.name}"
                  </h4>
                </div>
                <button
                  onClick={() => setComparisonScenario(null)}
                  className="text-xs text-indigo-700 font-bold hover:text-indigo-900 bg-white px-2 py-0.5 rounded border border-indigo-200"
                >
                  Close Comparison
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2">
                  <span className="font-bold text-slate-800 text-xs block border-b pb-1">Current Active Simulation</span>
                  <div className="space-y-1 text-slate-600">
                    <div className="flex justify-between"><span>Targets:</span><span className="font-bold text-slate-800">{simulationResult?.results.targetTraction} Trac / {simulationResult?.results.targetDcs} DCS</span></div>
                    <div className="flex justify-between"><span>Status:</span><span className={`font-bold ${simulationResult?.results.achievabilityStatus === 'Achievable' ? 'text-emerald-700' : 'text-red-700'}`}>{simulationResult?.results.achievabilityStatus}</span></div>
                    <div className="flex justify-between"><span>Feasible Traction:</span><span className="font-bold text-slate-800">{simulationResult?.results.feasibleTractionOutput}</span></div>
                    <div className="flex justify-between"><span>Feasible DCS:</span><span className="font-bold text-slate-800">{simulationResult?.results.feasibleDcsOutput ?? '-'}</span></div>
                    <div className="flex justify-between"><span>Mech Load %:</span><span className="font-mono font-bold text-slate-800">{simulationResult?.results.loads.mechanical.combinedLoadPercent}%</span></div>
                    <div className="flex justify-between"><span>HV Load %:</span><span className="font-mono font-bold text-slate-800">{simulationResult?.results.loads.hvCabling.combinedLoadPercent}%</span></div>
                    <div className="flex justify-between"><span>LV Load %:</span><span className="font-mono font-bold text-slate-800">{simulationResult?.results.loads.lvWiring.loadPercent}%</span></div>
                  </div>
                </div>
                <div className="bg-white p-3 rounded-lg border border-indigo-200 space-y-2">
                  <span className="font-bold text-indigo-900 text-xs block border-b pb-1">{comparisonScenario.name}</span>
                  <div className="space-y-1 text-slate-600">
                    <div className="flex justify-between"><span>Targets:</span><span className="font-bold text-slate-800">{comparisonScenario.scenarioData?.results.targetTraction} Trac / {comparisonScenario.scenarioData?.results.targetDcs} DCS</span></div>
                    <div className="flex justify-between">
                      <span>Status:</span>
                      <span className={`font-bold ${
                        comparisonScenario.scenarioData?.results.achievabilityStatus === 'Achievable'
                          ? 'text-emerald-700'
                          : comparisonScenario.scenarioData?.results.achievabilityStatus === 'Insufficient Data'
                            ? 'text-amber-700'
                            : 'text-red-700'
                      }`}>
                        {comparisonScenario.scenarioData?.results.achievabilityStatus}
                      </span>
                    </div>
                    <div className="flex justify-between"><span>Feasible Traction:</span><span className="font-bold text-slate-800">{comparisonScenario.scenarioData?.results.feasibleTractionOutput}</span></div>
                    <div className="flex justify-between"><span>Feasible DCS:</span><span className="font-bold text-slate-800">{comparisonScenario.scenarioData?.results.feasibleDcsOutput ?? '-'}</span></div>
                    <div className="flex justify-between"><span>Mech Load %:</span><span className="font-mono font-bold text-slate-800">{comparisonScenario.scenarioData?.results.loads.mechanical.combinedLoadPercent}%</span></div>
                    <div className="flex justify-between"><span>HV Load %:</span><span className="font-mono font-bold text-slate-800">{comparisonScenario.scenarioData?.results.loads.hvCabling.combinedLoadPercent}%</span></div>
                    <div className="flex justify-between"><span>LV Load %:</span><span className="font-mono font-bold text-slate-800">{comparisonScenario.scenarioData?.results.loads.lvWiring.loadPercent}%</span></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Saved Scenarios & Side-by-Side Comparison */}
          <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-3">
            <h3 className="font-bold text-slate-800 uppercase tracking-wider text-xs border-b border-slate-100 pb-2 flex items-center space-x-2">
              <Scale className="w-4 h-4 text-indigo-600" />
              <span>Saved Scenario Comparisons</span>
            </h3>

            {savedScenarios.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No scenarios saved yet. Use the bookmark button to save scenarios.</p>
            ) : (
              <div className="space-y-2">
                {savedScenarios.map(scen => (
                  <div key={scen.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:bg-slate-50 transition text-xs">
                    <div>
                      <span className="font-bold text-slate-800 text-sm block">{scen.name}</span>
                      <span className="text-[11px] text-slate-500">
                        Targets: {scen.scenarioData?.results?.targetTraction} Traction, {scen.scenarioData?.results?.targetDcs} DCS | Status: {scen.scenarioData?.results?.achievabilityStatus}
                      </span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleSelectForComparison(scen)}
                        className="px-2.5 py-1 rounded bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold hover:bg-indigo-100 transition"
                      >
                        Compare
                      </button>
                      <button
                        onClick={() => handleDeleteScenario(scen.id)}
                        className="text-slate-400 hover:text-red-600 p-1 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
