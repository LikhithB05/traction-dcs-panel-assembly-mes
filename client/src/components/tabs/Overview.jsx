import React, { useState, useEffect } from 'react';
import { api } from '../../utils/api.js';
import {
  Layers, Clock, AlertTriangle, CheckCircle, Flame,
  PauseCircle, ArrowRight, RefreshCw, BarChart2, ShieldAlert
} from 'lucide-react';

export default function Overview({ onSelectPanel }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchOverview = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get('/overview');
      setData(res);
    } catch (err) {
      setError(err.message || 'Failed to load overview metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  if (loading && !data) {
    return (
      <div className="bg-white rounded-xl p-12 text-center text-slate-400 font-medium">
        Loading operational overview and bottleneck analysis...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border-l-4 border-red-500 text-red-700 text-xs rounded-lg">
        {error}
      </div>
    );
  }

  const { kpis, areaStats, heldPanels, overduePanels, stageCounts, bottlenecks } = data;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 card-accent-overview p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800 tracking-tight flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-600"></span>
              <span>Overview: Factory Assembly Pipeline & Bottleneck Analysis</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Live factory status, overdue alerts, held work, area workloads and queue bottleneck detection.
            </p>
          </div>

          <button
            onClick={fetchOverview}
            className="self-start sm:self-auto p-2 border border-slate-300 hover:bg-slate-50 text-slate-600 rounded-lg transition"
            title="Refresh Metrics"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Primary KPI Row */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Panels</span>
            <span className="text-xl font-extrabold text-accent-overview">{kpis.totalPanels}</span>
          </div>
          <div className="bg-blue-50/60 border border-blue-200 rounded-lg p-3 text-center">
            <span className="text-[10px] uppercase font-bold text-blue-700 block">In Progress</span>
            <span className="text-xl font-extrabold text-blue-800">{kpis.inProgressCount}</span>
          </div>
          <div className="bg-slate-100 border border-slate-300 rounded-lg p-3 text-center">
            <span className="text-[10px] uppercase font-bold text-slate-600 block">Waiting</span>
            <span className="text-xl font-extrabold text-slate-700">{kpis.waitingCount}</span>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
            <span className="text-[10px] uppercase font-bold text-amber-700 block">Held</span>
            <span className="text-xl font-extrabold text-amber-700">{kpis.heldCount}</span>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
            <span className="text-[10px] uppercase font-bold text-red-700 block">Overdue</span>
            <span className="text-xl font-extrabold text-red-700">{kpis.overdueCount}</span>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
            <span className="text-[10px] uppercase font-bold text-emerald-700 block">Done</span>
            <span className="text-xl font-extrabold text-emerald-700">{kpis.doneCount}</span>
          </div>
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-center">
            <span className="text-[10px] uppercase font-bold text-indigo-700 block">Traction</span>
            <span className="text-xl font-extrabold text-indigo-800">{kpis.tractionCount}</span>
          </div>
          <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-3 text-center">
            <span className="text-[10px] uppercase font-bold text-cyan-700 block">DCS</span>
            <span className="text-xl font-extrabold text-cyan-800">{kpis.dcsCount}</span>
          </div>
        </div>
      </div>

      {/* Area Cards: KSM, PDR, CRM */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {Object.entries(areaStats).map(([areaName, stats]) => (
          <div key={areaName} className="bg-white rounded-xl shadow-xs border border-slate-200 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <span className="text-sm font-bold text-slate-800 flex items-center space-x-2">
                <span className="font-mono px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-xs font-extrabold text-slate-800">
                  {areaName}
                </span>
                <span>Area Queue</span>
              </span>
              <span className="text-xs font-extrabold text-orange-600 font-mono">
                {stats.total} Panels
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-slate-50 p-2 rounded">
                <span className="text-[10px] text-slate-400 block font-medium">Waiting</span>
                <span className="font-bold text-slate-700">{stats.waiting}</span>
              </div>
              <div className="bg-blue-50 p-2 rounded">
                <span className="text-[10px] text-blue-600 block font-medium">In Progress</span>
                <span className="font-bold text-blue-800">{stats.inProgress}</span>
              </div>
              <div className="bg-amber-50 p-2 rounded">
                <span className="text-[10px] text-amber-600 block font-medium">Held</span>
                <span className="font-bold text-amber-800">{stats.held}</span>
              </div>
            </div>

            <div className="pt-1">
              <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">Active Stages</span>
              <div className="flex flex-wrap gap-1">
                {stats.activeStages.length === 0 ? (
                  <span className="text-xs text-slate-400 italic">No stages currently active</span>
                ) : (
                  stats.activeStages.map(st => (
                    <span key={st} className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-medium border border-slate-200">
                      {st}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Section: Held and Overdue Alert Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Held Panels List */}
        <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
          <div className="px-5 py-3.5 bg-amber-50/70 border-b border-amber-200 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <PauseCircle className="w-4 h-4 text-amber-700" />
              <h3 className="font-bold text-amber-900 text-xs uppercase tracking-wider">
                Held Panels ({heldPanels.length})
              </h3>
            </div>
            <span className="text-[11px] text-amber-700 font-medium">Production Interruptions</span>
          </div>

          <div className="overflow-x-auto max-h-72">
            {heldPanels.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 font-medium">
                No panels currently on hold. Pipeline flowing normally.
              </div>
            ) : (
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold">
                  <tr>
                    <th className="py-2.5 px-3 text-left">Panel</th>
                    <th className="py-2.5 px-3 text-left">Stage & Area</th>
                    <th className="py-2.5 px-3 text-left">Duration</th>
                    <th className="py-2.5 px-3 text-left">Hold Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {heldPanels.map(hp => (
                    <tr key={hp.id} className="hover:bg-amber-50/30">
                      <td className="py-2.5 px-3 font-mono font-bold text-blue-700">
                        {hp.id} <span className="text-[10px] text-slate-500 font-normal">({hp.type})</span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">
                        <div>{hp.stageName}</div>
                        <span className="font-mono text-[10px] text-slate-400">{hp.currentArea}</span>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-semibold text-amber-700">
                        {hp.heldHours}h
                      </td>
                      <td className="py-2.5 px-3 text-slate-800 font-medium italic">
                        {hp.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Overdue Panels List */}
        <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
          <div className="px-5 py-3.5 bg-red-50/70 border-b border-red-200 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-red-700" />
              <h3 className="font-bold text-red-900 text-xs uppercase tracking-wider">
                Overdue Panels ({overduePanels.length})
              </h3>
            </div>
            <span className="text-[11px] text-red-700 font-medium">Exceeded Due Date</span>
          </div>

          <div className="overflow-x-auto max-h-72">
            {overduePanels.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 font-medium">
                No panels overdue. All work is on track with target dates.
              </div>
            ) : (
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold">
                  <tr>
                    <th className="py-2.5 px-3 text-left">Panel</th>
                    <th className="py-2.5 px-3 text-left">Due Date</th>
                    <th className="py-2.5 px-3 text-left">Overdue By</th>
                    <th className="py-2.5 px-3 text-left">Stage & Worker</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {overduePanels.map(op => (
                    <tr key={op.id} className="hover:bg-red-50/30">
                      <td className="py-2.5 px-3 font-mono font-bold text-blue-700">
                        {op.id} <span className="text-[10px] text-slate-500 font-normal">({op.project})</span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">
                        {op.dueDate}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-red-600">
                        +{op.daysOverdue} days
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">
                        <div>{op.stageName} ({op.currentArea})</div>
                        <span className="text-[11px] text-slate-500">{op.assignedTo || 'Unassigned'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Stage-wise Pipeline Counts: Traction & DCS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Traction 10 Stages */}
        <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5">
          <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-3 flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
            <span>Traction Workflow Stage Breakdown (10 Stages)</span>
          </h3>
          <div className="space-y-1.5 text-xs">
            {stageCounts.traction.map(s => (
              <div key={s.stageNumber} className="flex items-center justify-between p-2 rounded bg-slate-50 hover:bg-indigo-50/40 transition">
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-[10px] text-slate-400 w-4">#{s.stageNumber}</span>
                  <span className="font-medium text-slate-800">{s.stageName}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 text-slate-600 font-bold">{s.area}</span>
                </div>
                <span className={`font-mono font-bold px-2 py-0.5 rounded text-xs ${
                  s.count > 0 ? 'bg-indigo-100 text-indigo-800' : 'text-slate-400'
                }`}>
                  {s.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* DCS 8 Stages */}
        <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5">
          <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-3 flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-cyan-600"></span>
            <span>DCS Workflow Stage Breakdown (8 Stages)</span>
          </h3>
          <div className="space-y-1.5 text-xs">
            {stageCounts.dcs.map(s => (
              <div key={s.stageNumber} className="flex items-center justify-between p-2 rounded bg-slate-50 hover:bg-cyan-50/40 transition">
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-[10px] text-slate-400 w-4">#{s.stageNumber}</span>
                  <span className="font-medium text-slate-800">{s.stageName}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 text-slate-600 font-bold">{s.area}</span>
                </div>
                <span className={`font-mono font-bold px-2 py-0.5 rounded text-xs ${
                  s.count > 0 ? 'bg-cyan-100 text-cyan-800' : 'text-slate-400'
                }`}>
                  {s.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottleneck Analysis Section (Prominent Enhancement) */}
      <div className="bg-white rounded-xl shadow-xs border border-orange-200 p-5">
        <div className="flex items-center justify-between border-b border-orange-100 pb-3 mb-4">
          <div className="flex items-center space-x-2">
            <ShieldAlert className="w-5 h-5 text-orange-600" />
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                Operational Bottleneck Detection Engine
              </h3>
              <p className="text-[11px] text-slate-500">
                Enhancement: Algorithmic detection based on queue depth & dwell time relative to factory baseline.
              </p>
            </div>
          </div>
          <span className="text-[10px] font-bold px-2.5 py-1 rounded bg-orange-100 text-orange-800 uppercase tracking-wider">
            Enhanced MES Analytics
          </span>
        </div>

        {bottlenecks.bottlenecks.length === 0 ? (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>No critical bottlenecks detected. Queue depths and dwell times remain within acceptable factory thresholds.</span>
          </div>
        ) : (
          <div className="space-y-4">
            {bottlenecks.bottlenecks.map((b, idx) => (
              <div key={idx} className="bg-orange-50/50 border border-orange-300 rounded-lg p-4 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-orange-900 text-sm">{b.type} — Stage {b.stageNumber}: {b.stageName}</span>
                    <span className="font-mono px-2 py-0.5 rounded bg-orange-200 text-orange-800 font-extrabold text-[10px]">{b.area}</span>
                  </div>
                  <span className="font-mono font-bold text-orange-700 bg-white border border-orange-300 px-2 py-0.5 rounded text-[11px]">
                    Queue Depth: {b.queueDepth} panels
                  </span>
                </div>

                <div className="text-slate-700">
                  <span className="font-semibold text-slate-800">Evidence: </span>
                  {b.evidence}
                </div>

                <div className="p-2.5 bg-white border border-orange-200 rounded text-slate-800">
                  <span className="font-bold text-orange-800">Recommended Action: </span>
                  {b.recommendation}
                  {b.qualifiedReallocation && (
                    <div className="mt-1 text-[11px] text-slate-600">
                      <span className="font-semibold">Qualified Backup Teams: </span>
                      {b.qualifiedReallocation.join(', ')}
                    </div>
                  )}
                </div>

                <p className="text-[10px] text-slate-400 italic">
                  Note: {b.assumptionNotice}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
