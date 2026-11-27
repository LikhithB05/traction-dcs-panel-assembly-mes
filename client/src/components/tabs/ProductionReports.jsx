import React, { useState, useEffect } from 'react';
import {
  FileText, Download, Calendar, Filter, RefreshCw, AlertCircle,
  CheckCircle2, Clock, Users, Layers, Award, TrendingUp, AlertTriangle
} from 'lucide-react';
import { api } from '../../utils/api.js';

export default function ProductionReports({ masterData }) {
  // Date range defaults: Last 14 days to today
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().slice(0, 10);
  });

  const [department, setDepartment] = useState('');
  const [employee, setEmployee] = useState('');
  const [panelType, setPanelType] = useState('');

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeView, setActiveView] = useState('summary'); // 'summary', 'stages', 'employees'

  // Quick preset ranges
  const setPresetRange = (preset) => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    if (preset === '14days') {
      const past = new Date(now);
      past.setDate(past.getDate() - 14);
      setStartDate(past.toISOString().slice(0, 10));
      setEndDate(todayStr);
    } else if (preset === 'thisMonth') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(firstDay.toISOString().slice(0, 10));
      setEndDate(todayStr);
    } else if (preset === 'lastMonth') {
      const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      setStartDate(firstDayLastMonth.toISOString().slice(0, 10));
      setEndDate(lastDayLastMonth.toISOString().slice(0, 10));
    }
  };

  const fetchReport = async () => {
    if (!startDate || !endDate) {
      setError('Please select both Start Date and End Date.');
      return;
    }
    if (startDate > endDate) {
      setError(`Start Date (${startDate}) cannot be after End Date (${endDate}).`);
      return;
    }

    try {
      setLoading(true);
      setError('');

      const params = new URLSearchParams({
        startDate,
        endDate
      });
      if (department) params.append('department', department);
      if (employee) params.append('employee', employee);
      if (panelType) params.append('panelType', panelType);

      const data = await api.get(`/reports/production?${params.toString()}`);
      setReport(data);
    } catch (err) {
      console.error('Failed to generate report:', err);
      setError(err.message || 'Failed to generate report.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, []);

  const handleDownloadCSV = async () => {
    try {
      setError('');
      const params = new URLSearchParams({
        startDate,
        endDate
      });
      if (department) params.append('department', department);
      if (employee) params.append('employee', employee);
      if (panelType) params.append('panelType', panelType);

      const blob = await api.downloadBlob(`/reports/production/csv?${params.toString()}`);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `BHEL_Actual_Work_Report_${startDate}_to_${endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('CSV Export Error: ' + (err.message || 'Failed to generate CSV export.'));
    }
  };

  // Compile unique worker options from masterData
  const availableWorkers = [];
  if (masterData?.workflows) {
    const allStages = [
      ...(masterData.workflows.traction || []),
      ...(masterData.workflows.dcs || [])
    ];
    allStages.forEach(s => {
      (s.eligibleWorkers || []).forEach(w => {
        if (!availableWorkers.includes(w)) availableWorkers.push(w);
      });
    });
  }

  return (
    <div className="space-y-6">
      {/* Header & Controls Card */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 card-accent-reports p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800 tracking-tight flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-600"></span>
              <span>Production Reports: Actual Work by Date Range</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Compare planned production targets with actual recorded shop-floor stage completions and employee output.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleDownloadCSV}
              disabled={loading || !report}
              className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-xs transition flex items-center space-x-1.5 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>Download CSV (Excel)</span>
            </button>
            <button
              onClick={fetchReport}
              disabled={loading}
              className="p-2 border border-slate-300 hover:bg-slate-50 text-slate-600 rounded-lg transition"
              title="Refresh Report"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Date Range Selection & Quick Filters */}
        <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3 text-xs">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-cyan-600 outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-cyan-600 outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Department</label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-cyan-600 outline-none"
            >
              <option value="">All Departments</option>
              <option value="KSM">KSM Area</option>
              <option value="PDR">PDR Area</option>
              <option value="CRM">CRM Area</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Panel Type</label>
            <select
              value={panelType}
              onChange={(e) => setPanelType(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-cyan-600 outline-none"
            >
              <option value="">All Types</option>
              <option value="Traction">Traction</option>
              <option value="DCS">DCS</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Employee</label>
            <select
              value={employee}
              onChange={(e) => setEmployee(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-cyan-600 outline-none"
            >
              <option value="">All Employees</option>
              {availableWorkers.map(w => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={fetchReport}
              disabled={loading}
              className="w-full bg-cyan-700 hover:bg-cyan-800 text-white font-bold py-1.5 px-3 rounded-lg shadow-xs transition text-xs"
            >
              {loading ? 'Generating...' : 'Apply Filters'}
            </button>
          </div>
        </div>

        {/* Quick Range Buttons */}
        <div className="mt-3 flex items-center space-x-2 text-[11px]">
          <span className="text-slate-400 font-medium">Quick Presets:</span>
          <button
            onClick={() => setPresetRange('14days')}
            className="px-2.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold"
          >
            Last 14 Days
          </button>
          <button
            onClick={() => setPresetRange('thisMonth')}
            className="px-2.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold"
          >
            This Month
          </button>
          <button
            onClick={() => setPresetRange('lastMonth')}
            className="px-2.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold"
          >
            Last Month
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border-l-4 border-red-500 text-red-700 text-xs rounded-lg flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError('')} className="text-red-500 font-bold">✕</button>
        </div>
      )}

      {report && (
        <>
          {/* Executive KPI Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Planned Panels</span>
                <Layers className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-2xl font-bold text-slate-800 mt-2">
                {report.summary.totalPlannedPanels}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">Active in range</div>
            </div>

            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Completed Stages</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-bold text-emerald-700 mt-2">
                {report.summary.completedStagesCount}
              </div>
              <div className="text-[11px] text-emerald-600/80 mt-0.5">Actual output in range</div>
            </div>

            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-purple-600 uppercase tracking-wider">Fully Finished</span>
                <Award className="w-4 h-4 text-purple-600" />
              </div>
              <div className="text-2xl font-bold text-purple-700 mt-2">
                {report.summary.fullyCompletedPanelsCount}
              </div>
              <div className="text-[11px] text-purple-600/80 mt-0.5">Dispatched panels</div>
            </div>

            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">In Progress</span>
                <Clock className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-2xl font-bold text-blue-700 mt-2">
                {report.summary.inProgressStagesCount}
              </div>
              <div className="text-[11px] text-blue-600/80 mt-0.5">Currently on shop floor</div>
            </div>

            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">Overdue Panels</span>
                <AlertTriangle className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-2xl font-bold text-amber-700 mt-2">
                {report.summary.overduePanelsCount}
              </div>
              <div className="text-[11px] text-amber-600/80 mt-0.5">Due date passed</div>
            </div>
          </div>

          {/* Sub-view Navigation */}
          <div className="flex items-center space-x-2 border-b border-slate-200 pb-2">
            <button
              onClick={() => setActiveView('summary')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                activeView === 'summary' ? 'bg-cyan-700 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Overview & Planned vs Actual
            </button>
            <button
              onClick={() => setActiveView('stages')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                activeView === 'stages' ? 'bg-cyan-700 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Detailed Stage Completions ({report.records.length})
            </button>
            <button
              onClick={() => setActiveView('employees')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                activeView === 'employees' ? 'bg-cyan-700 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Employee Performance ({report.employeeBreakdown.length})
            </button>
          </div>

          {/* View 1: Overview & Planned vs Actual */}
          {activeView === 'summary' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Employee Summary Card */}
              <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
                <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="font-bold text-xs uppercase tracking-wider text-slate-800 flex items-center space-x-2">
                    <Users className="w-4 h-4 text-cyan-600" />
                    <span>Top Recorded Personnel Output</span>
                  </h3>
                  <button
                    onClick={() => setActiveView('employees')}
                    className="text-[11px] text-cyan-700 hover:underline font-bold"
                  >
                    View All →
                  </button>
                </div>
                <div className="divide-y divide-slate-100 text-xs">
                  {report.employeeBreakdown.length === 0 ? (
                    <div className="p-6 text-center text-slate-400">No stage completions recorded for this period.</div>
                  ) : (
                    report.employeeBreakdown.slice(0, 6).map((emp, i) => (
                      <div key={i} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50">
                        <div>
                          <div className="font-bold text-slate-800">{emp.employee}</div>
                          <div className="text-[11px] text-slate-400">
                            Dept: <span className="font-semibold text-slate-600">{emp.department}</span> • Panels: {emp.panelsInvolved.length}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800">
                            {emp.completedStages} Stages Completed
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Planned vs Actual Metrics Card */}
              <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-4">
                <h3 className="font-bold text-xs uppercase tracking-wider text-slate-800 flex items-center space-x-2">
                  <TrendingUp className="w-4 h-4 text-cyan-600" />
                  <span>Planned vs Actual Work Alignment</span>
                </h3>

                <div className="space-y-3 text-xs">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex justify-between font-bold text-slate-700 mb-1">
                      <span>Total Planned Panels in Period:</span>
                      <span className="font-mono text-blue-700">{report.summary.totalPlannedPanels}</span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Execution panels scheduled or active within {startDate} through {endDate}.
                    </p>
                  </div>

                  <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                    <div className="flex justify-between font-bold text-emerald-800 mb-1">
                      <span>Recorded Stage Completions:</span>
                      <span className="font-mono text-emerald-700">{report.summary.completedStagesCount}</span>
                    </div>
                    <p className="text-[11px] text-emerald-700/80">
                      Distinct stage transitions completed and authorized on the shop floor within the date range.
                    </p>
                  </div>

                  <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                    <div className="flex justify-between font-bold text-purple-800 mb-1">
                      <span>Panels Dispatched (Final Stage Completed):</span>
                      <span className="font-mono text-purple-700">{report.summary.fullyCompletedPanelsCount}</span>
                    </div>
                    <p className="text-[11px] text-purple-700/80">
                      Panels that finished all workflow stages including 'PQ & Dispatch'.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* View 2: Detailed Stage Completions Table */}
          {activeView === 'stages' && (
            <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-xs">
                  <thead className="th-tint-reports font-bold tracking-wider uppercase text-[11px]">
                    <tr>
                      <th className="py-2.5 px-3 text-left">Panel ID</th>
                      <th className="py-2.5 px-3 text-left">Type</th>
                      <th className="py-2.5 px-3 text-left">Project</th>
                      <th className="py-2.5 px-3 text-left">Stage Name</th>
                      <th className="py-2.5 px-2.5 text-left">Area</th>
                      <th className="py-2.5 px-3 text-left">Assigned Employee</th>
                      <th className="py-2.5 px-2.5 text-center">Status</th>
                      <th className="py-2.5 px-2.5 text-left">Planned Start</th>
                      <th className="py-2.5 px-2.5 text-left">Planned Due</th>
                      <th className="py-2.5 px-3 text-left">Completed At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {report.records.length === 0 ? (
                      <tr>
                        <td colSpan="10" className="py-8 text-center text-slate-400 font-medium">
                          No stage activity recorded matching these criteria in this date range.
                        </td>
                      </tr>
                    ) : (
                      report.records.map((r, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{r.panelId}</td>
                          <td className="py-2.5 px-3 font-medium">{r.type}</td>
                          <td className="py-2.5 px-3 text-slate-700 truncate max-w-xs">{r.project}</td>
                          <td className="py-2.5 px-3 font-semibold text-slate-800">{r.stageName}</td>
                          <td className="py-2.5 px-2.5">
                            <span className="font-bold text-cyan-700">{r.department}</span>
                          </td>
                          <td className="py-2.5 px-3 font-medium text-slate-700">{r.assignedTo || '—'}</td>
                          <td className="py-2.5 px-2.5 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              r.isCompleted ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                            }`}>
                              {r.stageStatus}
                            </span>
                          </td>
                          <td className="py-2.5 px-2.5 font-mono text-slate-500">{r.plannedStartDate || '—'}</td>
                          <td className="py-2.5 px-2.5 font-mono text-slate-500">
                            <span className={r.isOverdue ? 'text-red-600 font-bold' : ''}>
                              {r.plannedDueDate || '—'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-emerald-700 font-medium">
                            {r.completedAt ? r.completedAt.replace('T', ' ').slice(0, 16) : '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* View 3: Employee Output Breakdown */}
          {activeView === 'employees' && (
            <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-xs">
                  <thead className="th-tint-reports font-bold tracking-wider uppercase text-[11px]">
                    <tr>
                      <th className="py-2.5 px-4 text-left">Employee Name</th>
                      <th className="py-2.5 px-3 text-left">Primary Department</th>
                      <th className="py-2.5 px-4 text-center">Completed Stages</th>
                      <th className="py-2.5 px-4 text-left">Panels Involved</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {report.employeeBreakdown.length === 0 ? (
                      <tr>
                        <td colSpan="4" className="py-8 text-center text-slate-400 font-medium">
                          No employee activity records found for this period.
                        </td>
                      </tr>
                    ) : (
                      report.employeeBreakdown.map((emp, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="py-3 px-4 font-bold text-slate-900">{emp.employee}</td>
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-800">
                              {emp.department}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-bold text-emerald-700 text-sm">
                            {emp.completedStages}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex flex-wrap gap-1">
                              {emp.panelsInvolved.map((pId) => (
                                <span key={pId} className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                  {pId}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
