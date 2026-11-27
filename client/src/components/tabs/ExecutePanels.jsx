import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { api } from '../../utils/api.js';
import {
  Plus, Search, Filter, Play, CheckCircle, CheckCircle2, PauseCircle,
  PlayCircle, Trash2, Clock, AlertCircle, Eye, RefreshCw, FileSpreadsheet, Edit3, RotateCcw
} from 'lucide-react';
import NewPanelModal from '../NewPanelModal.jsx';
import StartStageModal from '../StartStageModal.jsx';
import HoldModal from '../HoldModal.jsx';
import PanelHistoryModal from '../PanelHistoryModal.jsx';
import ExcelImportModal from '../ExcelImportModal.jsx';
import EditPanelModal from '../EditPanelModal.jsx';
import UndoConfirmationModal from '../UndoConfirmationModal.jsx';

export default function ExecutePanels({ masterData }) {
  const { user, isAdmin } = useAuth();
  const [panels, setPanels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modals
  const [showNewModal, setShowNewModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editModalPanel, setEditModalPanel] = useState(null);
  const [startModalPanel, setStartModalPanel] = useState(null);
  const [holdModalPanel, setHoldModalPanel] = useState(null);
  const [historyModalPanel, setHistoryModalPanel] = useState(null);
  const [undoModalPanel, setUndoModalPanel] = useState(null);

  const fetchPanels = async () => {
    try {
      setLoading(true);
      setError('');
      const queryParams = new URLSearchParams();
      if (search) queryParams.append('search', search);
      if (areaFilter) queryParams.append('area', areaFilter);
      if (typeFilter) queryParams.append('type', typeFilter);
      if (statusFilter) queryParams.append('status', statusFilter);

      const data = await api.get(`/panels?${queryParams.toString()}`);
      setPanels(data);
    } catch (err) {
      setError(err.message || 'Failed to load panels.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPanels();
  }, [areaFilter, typeFilter, statusFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchPanels();
  };

  const handleComplete = async (panel) => {
    if (!window.confirm(`Advance panel ${panel.id} from stage "${panel.stageName}" to completion?`)) {
      return;
    }

    try {
      setError('');
      const res = await api.post(`/panels/${panel.id}/complete`, {});
      setSuccessMsg(res.message);
      setTimeout(() => setSuccessMsg(''), 4000);
      fetchPanels();
    } catch (err) {
      setError(err.message || 'Failed to complete stage.');
    }
  };

  const handleResume = async (panel) => {
    try {
      setError('');
      const res = await api.post(`/panels/${panel.id}/resume`, {});
      setSuccessMsg(res.message);
      setTimeout(() => setSuccessMsg(''), 4000);
      fetchPanels();
    } catch (err) {
      setError(err.message || 'Failed to resume panel.');
    }
  };

  const handleDelete = async (panel) => {
    if (!window.confirm(`PERMANENT ACTION: Delete panel ${panel.id} and all associated histories?`)) {
      return;
    }

    try {
      setError('');
      await api.delete(`/panels/${panel.id}`);
      setSuccessMsg(`Panel ${panel.id} deleted.`);
      setTimeout(() => setSuccessMsg(''), 4000);
      fetchPanels();
    } catch (err) {
      setError(err.message || 'Failed to delete panel.');
    }
  };

  const openHistory = async (panelId) => {
    try {
      const detail = await api.get(`/panels/${panelId}`);
      setHistoryModalPanel(detail);
    } catch (err) {
      setError('Failed to fetch full panel history: ' + err.message);
    }
  };

  // Permission check: Can current user operate on this panel?
  const canOperate = (panel) => {
    if (!user) return false;
    if (isAdmin) return true;
    // Traction Stage 3 (HV Stage) allows both PDR and CRM
    if (panel.type === 'Traction' && panel.current_stage === 3) {
      return user.role === 'PDR' || user.role === 'CRM';
    }
    return user.role === panel.current_area;
  };

  return (
    <div className="space-y-6">
      {/* Top Action Bar & Filter Controls */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 card-accent-execute p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800 tracking-tight flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
              <span>Execute: Panel Assembly Operations</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Live tracking and stage execution for Traction & DCS panels on shop floor.
            </p>
          </div>

          <div className="flex items-center space-x-2.5">
            <button
              onClick={fetchPanels}
              title="Refresh Records"
              className="p-2 border border-slate-300 hover:bg-slate-50 text-slate-600 rounded-lg transition"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            {(isAdmin || user?.role === 'KSM') && (
              <>
                <button
                  id="btn-import-excel"
                  onClick={() => setShowImportModal(true)}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold px-3.5 py-2 rounded-lg shadow-xs transition flex items-center space-x-1.5"
                  title="Upload manufacturing plan spreadsheet (.xlsx, .xls, .csv)"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Import Plan (Excel)</span>
                </button>

                <button
                  id="btn-new-panel"
                  onClick={() => setShowNewModal(true)}
                  className="bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-xs transition flex items-center space-x-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ New Panel</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          <form onSubmit={handleSearchSubmit} className="relative sm:col-span-2">
            <input
              type="text"
              placeholder="Search ID or project name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-800 focus:ring-2 focus:ring-blue-600 outline-none"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2 pointer-events-none" />
          </form>

          <div>
            <select
              value={areaFilter}
              onChange={(e) => setAreaFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-2 focus:ring-blue-600 outline-none font-medium"
            >
              <option value="">All Areas</option>
              <option value="KSM">KSM Area</option>
              <option value="PDR">PDR Area</option>
              <option value="CRM">CRM Area</option>
            </select>
          </div>

          <div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-2 focus:ring-blue-600 outline-none font-medium"
            >
              <option value="">All Types</option>
              <option value="Traction">Traction</option>
              <option value="DCS">DCS</option>
            </select>
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-2 focus:ring-blue-600 outline-none font-medium"
            >
              <option value="">All Statuses</option>
              <option value="Waiting">Waiting</option>
              <option value="In Progress">In Progress</option>
              <option value="Held">Held</option>
              <option value="Done">Done</option>
            </select>
          </div>
        </div>
      </div>

      {/* Alert Messages */}
      {error && (
        <div className="p-3 bg-red-50 border-l-4 border-red-500 text-red-700 text-xs rounded-lg flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError('')} className="text-red-500 hover:text-red-700 font-bold ml-2">✕</button>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-50 border-l-4 border-emerald-500 text-emerald-800 text-xs rounded-lg flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg('')} className="text-emerald-500 hover:text-emerald-700 font-bold ml-2">✕</button>
        </div>
      )}

      {/* Main Panels Table */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-xs">
            <thead className="th-tint-execute font-bold tracking-wider uppercase text-[11px]">
              <tr>
                <th className="py-3 px-4 text-left">Panel ID</th>
                <th className="py-3 px-3 text-left">Type</th>
                <th className="py-3 px-4 text-left">Project</th>
                <th className="py-3 px-3 text-left">Priority</th>
                <th className="py-3 px-3 text-left">Due Date</th>
                <th className="py-3 px-4 text-left">Current Stage</th>
                <th className="py-3 px-3 text-left">Area</th>
                <th className="py-3 px-4 text-left">Assigned Team / Person</th>
                <th className="py-3 px-3 text-left">Status</th>
                <th className="py-3 px-3 text-center">Days in Stage</th>
                <th className="py-3 px-4 text-center">Operational Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {panels.length === 0 ? (
                <tr>
                  <td colSpan="11" className="py-8 text-center text-slate-400 font-medium">
                    {loading ? 'Loading panel records...' : 'No panels matching filter criteria.'}
                  </td>
                </tr>
              ) : (
                panels.map((panel) => {
                  const allowedToOperate = canOperate(panel);

                  return (
                    <tr key={panel.id} className="hover:bg-slate-50/70 transition">
                      {/* ID with Click-to-Audit */}
                      <td className="py-3 px-4">
                        <button
                          onClick={() => openHistory(panel.id)}
                          className="font-mono font-bold text-blue-700 hover:text-blue-900 underline text-left flex items-center space-x-1"
                          title="Click to view full lifecycle audit history"
                        >
                          <span>{panel.id}</span>
                          <Eye className="w-3 h-3 text-slate-400 inline" />
                        </button>
                      </td>

                      {/* Type */}
                      <td className="py-3 px-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          panel.type === 'Traction' ? 'bg-indigo-100 text-indigo-800' : 'bg-cyan-100 text-cyan-800'
                        }`}>
                          {panel.type}
                        </span>
                      </td>

                      {/* Project */}
                      <td className="py-3 px-4 font-semibold text-slate-800 max-w-[150px] truncate" title={panel.project}>
                        {panel.project}
                      </td>

                      {/* Priority */}
                      <td className="py-3 px-3">
                        <span className={`font-bold ${
                          panel.priority === 'High' ? 'text-red-600' : panel.priority === 'Medium' ? 'text-amber-600' : 'text-slate-600'
                        }`}>
                          {panel.priority}
                        </span>
                      </td>

                      {/* Due Date & Overdue Badge */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="font-mono text-slate-700">{panel.due_date}</div>
                        {panel.isOverdue && (
                          <span className="inline-block px-1.5 py-0.2 rounded bg-red-100 text-red-700 font-bold text-[10px]">
                            Overdue ({panel.daysOverdue}d)
                          </span>
                        )}
                      </td>

                      {/* Current Stage */}
                      <td className="py-3 px-4 font-medium text-slate-800">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-mono text-slate-400 text-[10px]">#{panel.current_stage}</span>
                          <span>{panel.stageName}</span>
                        </div>
                      </td>

                      {/* Current Area */}
                      <td className="py-3 px-3">
                        <span className="font-mono font-bold text-[10px] px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700">
                          {panel.current_area}
                        </span>
                      </td>

                      {/* Assigned Worker / Team */}
                      <td className="py-3 px-4 text-slate-700">
                        {panel.assigned_to ? (
                          <span className="font-semibold text-slate-800">{panel.assigned_to}</span>
                        ) : (
                          <span className="text-slate-400 italic">Unassigned</span>
                        )}
                      </td>

                      {/* Status Badge */}
                      <td className="py-3 px-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                          panel.status === 'Done' ? 'bg-emerald-100 text-emerald-800' :
                          panel.status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
                          panel.status === 'Held' ? 'bg-amber-100 text-amber-800' :
                          'bg-slate-200 text-slate-700'
                        }`}>
                          {panel.status === 'Held' && <PauseCircle className="w-3 h-3 mr-1 text-amber-600" />}
                          {panel.status === 'In Progress' && <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse mr-1.5"></span>}
                          {panel.status}
                        </span>
                      </td>

                      {/* Days in Stage */}
                      <td className="py-3 px-3 text-center font-mono font-semibold text-slate-600">
                        {panel.daysInStage}d
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center space-x-1.5">
                          {/* Start Action */}
                          {panel.status === 'Waiting' && (
                            <button
                              onClick={() => setStartModalPanel(panel)}
                              disabled={!allowedToOperate}
                              title={allowedToOperate ? 'Start Stage' : `Requires ${panel.current_area} role`}
                              className="bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded text-xs font-semibold shadow-xs transition flex items-center space-x-1 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <Play className="w-3 h-3" />
                              <span>Start</span>
                            </button>
                          )}

                          {/* Complete Action */}
                          {panel.status === 'In Progress' && (
                            <button
                              onClick={() => handleComplete(panel)}
                              disabled={!allowedToOperate}
                              title={allowedToOperate ? 'Complete Stage & Advance' : `Requires ${panel.current_area} role`}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded text-xs font-semibold shadow-xs transition flex items-center space-x-1 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <CheckCircle className="w-3 h-3" />
                              <span>Complete</span>
                            </button>
                          )}

                          {/* Hold Action */}
                          {panel.status === 'In Progress' && (
                            <button
                              onClick={() => setHoldModalPanel(panel)}
                              disabled={!allowedToOperate}
                              title={allowedToOperate ? 'Place Stage on Hold' : `Requires ${panel.current_area} role`}
                              className="bg-amber-500 hover:bg-amber-600 text-white p-1 rounded text-xs shadow-xs transition disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <PauseCircle className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Resume Action */}
                          {panel.status === 'Held' && (
                            <button
                              onClick={() => handleResume(panel)}
                              disabled={!allowedToOperate}
                              title={allowedToOperate ? 'Resume Stage Work' : `Requires ${panel.current_area} role`}
                              className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs font-semibold shadow-xs transition flex items-center space-x-1 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <PlayCircle className="w-3.5 h-3.5" />
                              <span>Resume</span>
                            </button>
                          )}

                          {/* Undo Last Stage Completion (Admins only, eligible reversible stages) */}
                          {isAdmin && (panel.status === 'Done' || (panel.status === 'Waiting' && panel.current_stage > 1)) && (
                            <button
                              id={`btn-undo-${panel.id}`}
                              onClick={() => setUndoModalPanel(panel)}
                              title={`Undo Last Stage Completion (Reverse Stage #${panel.status === 'Done' ? panel.current_stage : panel.current_stage - 1})`}
                              className="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 hover:border-amber-400 px-2 py-1 rounded text-xs font-semibold shadow-xs transition flex items-center space-x-1"
                            >
                              <RotateCcw className="w-3 h-3 text-amber-600" />
                              <span>Undo</span>
                            </button>
                          )}

                          {/* Admin-only Edit Name & Dates */}
                          {isAdmin && (
                            <button
                              onClick={() => setEditModalPanel(panel)}
                              title="Edit Name & Dates (Admin Only)"
                              className="text-slate-400 hover:text-blue-600 p-1 rounded transition"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Admin-only Delete Button */}
                          {isAdmin && (
                            <button
                              onClick={() => handleDelete(panel)}
                              title="Delete Panel (Admin Only)"
                              className="text-slate-400 hover:text-red-600 p-1 rounded transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      <NewPanelModal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        onCreated={fetchPanels}
      />

      <ExcelImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportSuccess={fetchPanels}
      />

      {editModalPanel && (
        <EditPanelModal
          panel={editModalPanel}
          isOpen={!!editModalPanel}
          onClose={() => setEditModalPanel(null)}
          onUpdated={() => {
            fetchPanels();
            setSuccessMsg(`Panel ${editModalPanel.id} name and dates updated successfully.`);
            setTimeout(() => setSuccessMsg(''), 4000);
          }}
        />
      )}

      {startModalPanel && (
        <StartStageModal
          panel={startModalPanel}
          masterData={masterData}
          onClose={() => setStartModalPanel(null)}
          onStarted={fetchPanels}
        />
      )}

      {holdModalPanel && (
        <HoldModal
          panel={holdModalPanel}
          onClose={() => setHoldModalPanel(null)}
          onHeld={fetchPanels}
        />
      )}

      {historyModalPanel && (
        <PanelHistoryModal
          panel={historyModalPanel}
          onClose={() => setHistoryModalPanel(null)}
        />
      )}

      {undoModalPanel && (
        <UndoConfirmationModal
          panel={undoModalPanel}
          isOpen={!!undoModalPanel}
          onClose={() => setUndoModalPanel(null)}
          onSuccess={(msg) => {
            fetchPanels();
            setSuccessMsg(msg);
            setTimeout(() => setSuccessMsg(''), 4000);
          }}
        />
      )}
    </div>
  );
}
