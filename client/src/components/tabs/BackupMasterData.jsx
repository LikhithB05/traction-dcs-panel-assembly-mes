import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { api, authStorage } from '../../utils/api.js';
import {
  Download, Upload, Database, FileSpreadsheet, Shield,
  CheckCircle2, AlertCircle, RefreshCw, Lock, GitFork, Users, UserPlus, Plus, X, ToggleLeft, ToggleRight, Trash2
} from 'lucide-react';

export default function BackupMasterData({ masterData }) {
  const { user, isAdmin } = useAuth();
  const [counts, setCounts] = useState(null);
  const [loadingCounts, setLoadingCounts] = useState(true);
  const [restoreJson, setRestoreJson] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Custom manpower state
  const [customList, setCustomList] = useState([]);
  const [loadingCustom, setLoadingCustom] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newArea, setNewArea] = useState(user?.role && ['KSM', 'PDR', 'CRM'].includes(user.role) ? user.role : 'KSM');
  const [newType, setNewType] = useState('worker');
  const [newName, setNewName] = useState('');
  const [newMembers, setNewMembers] = useState('');

  const fetchCounts = async () => {
    try {
      setLoadingCounts(true);
      const data = await api.get('/backup/counts');
      setCounts(data);
    } catch (e) {
      // ignore
    } finally {
      setLoadingCounts(false);
    }
  };

  const fetchCustomManpower = async () => {
    try {
      setLoadingCustom(true);
      const data = await api.get('/custom-manpower?includeInactive=true');
      setCustomList(data);
    } catch (e) {
      // ignore
    } finally {
      setLoadingCustom(false);
    }
  };

  useEffect(() => {
    fetchCounts();
    fetchCustomManpower();
  }, []);

  const handleCreateCustom = async (e) => {
    e.preventDefault();
    if (!newName.trim()) {
      setErrorMsg('Name is required.');
      return;
    }
    if (newType === 'team' && !newMembers.trim()) {
      setErrorMsg('Team members are required.');
      return;
    }

    try {
      setErrorMsg('');
      const res = await api.post('/custom-manpower', {
        area: newArea,
        type: newType,
        name: newName.trim(),
        members: newType === 'team' ? newMembers.trim() : null
      });

      setFeedbackMsg(res.message || 'Custom worker/team saved successfully.');
      setNewName('');
      setNewMembers('');
      setShowAddModal(false);
      fetchCustomManpower();
      setTimeout(() => setFeedbackMsg(''), 4000);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to create custom worker/team.');
    }
  };

  const handleToggleActive = async (item) => {
    try {
      setErrorMsg('');
      await api.patch(`/custom-manpower/${item.id}`, {
        is_active: item.is_active ? 0 : 1
      });
      fetchCustomManpower();
      setFeedbackMsg(`Custom ${item.type} '${item.name}' ${item.is_active ? 'deactivated' : 'activated'}.`);
      setTimeout(() => setFeedbackMsg(''), 3000);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to update status.');
    }
  };

  const handleDeleteCustom = async (item) => {
    if (!window.confirm(`Permanently remove custom ${item.type} '${item.name}'?`)) {
      return;
    }
    try {
      setErrorMsg('');
      await api.delete(`/custom-manpower/${item.id}`);
      fetchCustomManpower();
      setFeedbackMsg(`Custom ${item.type} '${item.name}' permanently deleted.`);
      setTimeout(() => setFeedbackMsg(''), 3000);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to delete record.');
    }
  };

  const handleDownloadJSON = async () => {
    try {
      const token = authStorage.getToken();
      const res = await fetch('/api/backup/export-json', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bhel_portal_full_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setFeedbackMsg('Full JSON backup downloaded successfully.');
      setTimeout(() => setFeedbackMsg(''), 4000);
    } catch (err) {
      setErrorMsg('Failed to download JSON backup: ' + err.message);
    }
  };

  const handleDownloadCSV = async () => {
    try {
      const token = authStorage.getToken();
      const res = await fetch('/api/backup/export-csv', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('CSV Export failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bhel_panels_master_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setFeedbackMsg('Panels CSV downloaded successfully.');
      setTimeout(() => setFeedbackMsg(''), 4000);
    } catch (err) {
      setErrorMsg('Failed to download CSV export: ' + err.message);
    }
  };

  const handleRestore = async (e) => {
    e.preventDefault();
    if (!restoreJson.trim()) {
      setErrorMsg('Please paste a valid JSON backup string into the restore area.');
      return;
    }

    let parsed = null;
    try {
      parsed = JSON.parse(restoreJson);
    } catch (err) {
      setErrorMsg('Invalid JSON format. Please verify the backup file contents.');
      return;
    }

    if (!window.confirm('Confirm Restore: Records with matching IDs will be merged/overwritten. Proceed?')) {
      return;
    }

    try {
      setRestoring(true);
      setErrorMsg('');

      const res = await api.post('/backup/restore', { backupData: parsed });
      setFeedbackMsg(res.message);
      setRestoreJson('');
      fetchCounts();
    } catch (err) {
      setErrorMsg(err.message || 'Restore failed.');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Tab Banner */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 card-accent-backup p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800 tracking-tight flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-600"></span>
              <span>Backup & Factory Master Data Registry</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Secure enterprise backup, Excel CSV exports, ID-based merge restores, and documented shop floor reference.
            </p>
          </div>

          <button
            onClick={fetchCounts}
            className="self-start sm:self-auto p-2 border border-slate-300 hover:bg-slate-50 text-slate-600 rounded-lg transition"
            title="Refresh Live Record Counts"
          >
            <RefreshCw className={`w-4 h-4 ${loadingCounts ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="p-3 bg-red-50 border-l-4 border-red-500 text-red-700 text-xs rounded-lg flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg('')} className="font-bold">✕</button>
        </div>
      )}

      {feedbackMsg && (
        <div className="p-3 bg-emerald-50 border-l-4 border-emerald-500 text-emerald-800 text-xs rounded-lg flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
            <span>{feedbackMsg}</span>
          </div>
          <button onClick={() => setFeedbackMsg('')} className="font-bold">✕</button>
        </div>
      )}

      {/* SECTION 1: BACKUP & RESTORE (Admin AKR / CKG only) */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2">
            <Shield className="w-5 h-5 text-slate-700" />
            <h3 className="font-bold text-slate-900 text-sm">Enterprise Backup & Restore Operations</h3>
          </div>
          <span className="text-[10px] font-bold px-2.5 py-1 rounded bg-slate-100 text-slate-700 uppercase tracking-wider">
            AKR & CKG Admins Only
          </span>
        </div>

        {/* Live Record Counts */}
        {counts && (
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 text-xs">
            <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-center">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Panels</span>
              <span className="font-mono font-bold text-slate-800 text-base">{counts.panels}</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-center">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Stage Histories</span>
              <span className="font-mono font-bold text-slate-800 text-base">{counts.stageHistories}</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-center">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Monthly Plans</span>
              <span className="font-mono font-bold text-slate-800 text-base">{counts.monthlyPlans}</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-center">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Daily Targets</span>
              <span className="font-mono font-bold text-slate-800 text-base">{counts.dailyTargets}</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-center">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Sub-Assemblies</span>
              <span className="font-mono font-bold text-slate-800 text-base">{counts.subAssemblies}</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-center">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Scenarios</span>
              <span className="font-mono font-bold text-slate-800 text-base">{counts.scenarios}</span>
            </div>
          </div>
        )}

        {isAdmin ? (
          <div className="space-y-4 pt-2">
            <div className="flex flex-wrap gap-3">
              <button
                id="btn-download-json"
                onClick={handleDownloadJSON}
                className="bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs py-2 px-4 rounded-lg shadow transition flex items-center space-x-2"
              >
                <Download className="w-4 h-4" />
                <span>Download Full Backup (JSON)</span>
              </button>

              <button
                id="btn-download-csv"
                onClick={handleDownloadCSV}
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs py-2 px-4 rounded-lg shadow transition flex items-center space-x-2"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Download Panels CSV (Excel)</span>
              </button>
            </div>

            {/* Restore Box */}
            <form onSubmit={handleRestore} className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-800 uppercase tracking-wider mb-1">
                  Safe Restore from Backup JSON (ID-Based Merge)
                </label>
                <p className="text-[11px] text-slate-500 mb-2">
                  Paste the JSON backup payload below. The system will overwrite records with matching IDs and preserve all non-matching records inside an atomic transaction.
                </p>
                <textarea
                  id="textarea-restore-json"
                  rows={4}
                  placeholder='Paste {"metadata": ..., "data": ...} here'
                  value={restoreJson}
                  onChange={(e) => setRestoreJson(e.target.value)}
                  className="w-full font-mono bg-white border border-slate-300 rounded p-2 text-slate-800 focus:ring-2 focus:ring-slate-600 outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={restoring}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg shadow transition flex items-center space-x-1.5 disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                <span>{restoring ? 'Restoring Records...' : 'Execute Safe Restore'}</span>
              </button>
            </form>
          </div>
        ) : (
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 text-xs flex items-center space-x-2">
            <Lock className="w-4 h-4 text-slate-400" />
            <span>Backup and restore actions are restricted to Master Administrators (AKR and CKG).</span>
          </div>
        )}
      </div>

      {/* SECTION 2: CUSTOM WORKERS & TEAMS REGISTRY ("OTHERS") */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2">
            <Users className="w-5 h-5 text-blue-700" />
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Custom Workers & Teams Registry ("Others")</h3>
              <p className="text-[11px] text-slate-500">
                Persistent manpower options configured via Execution Panels or registry management.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={fetchCustomManpower}
              className="p-1.5 border border-slate-300 hover:bg-slate-50 text-slate-600 rounded-lg transition"
              title="Refresh Custom Manpower"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingCustom ? 'animate-spin' : ''}`} />
            </button>

            {(isAdmin || (user?.role && ['KSM', 'PDR', 'CRM'].includes(user.role))) && (
              <button
                id="btn-add-custom-manpower"
                onClick={() => setShowAddModal(true)}
                className="bg-blue-700 hover:bg-blue-800 text-white font-semibold text-xs py-1.5 px-3 rounded-lg shadow-xs transition flex items-center space-x-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add Custom Worker / Team</span>
              </button>
            )}
          </div>
        </div>

        {/* Custom Entries Table */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-slate-200 text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px]">
              <tr>
                <th className="py-2.5 px-3 text-left">Area</th>
                <th className="py-2.5 px-3 text-left">Type</th>
                <th className="py-2.5 px-4 text-left">Name</th>
                <th className="py-2.5 px-4 text-left">Team Members</th>
                <th className="py-2.5 px-3 text-left">Status</th>
                <th className="py-2.5 px-3 text-left">Created By</th>
                <th className="py-2.5 px-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {customList.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-6 text-center text-slate-400 font-medium">
                    {loadingCustom ? 'Loading registry...' : 'No custom workers or teams registered yet.'}
                  </td>
                </tr>
              ) : (
                customList.map((item) => {
                  const canManage = isAdmin || user?.role === item.area;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50 transition">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-700">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px]">
                          {item.area}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-600 capitalize">
                        {item.type}
                      </td>
                      <td className="py-2.5 px-4 font-bold text-slate-800">
                        {item.name}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600">
                        {item.members || <span className="text-slate-400 italic">—</span>}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          item.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                        }`}>
                          {item.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                        {item.created_by || 'Admin'}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center space-x-1">
                          {canManage && (
                            <button
                              onClick={() => handleToggleActive(item)}
                              title={item.is_active ? 'Deactivate (preserve historical work)' : 'Reactivate'}
                              className={`px-1.5 py-0.5 rounded text-xs font-semibold transition ${
                                item.is_active ? 'text-amber-700 hover:bg-amber-50' : 'text-emerald-700 hover:bg-emerald-50'
                              }`}
                            >
                              {item.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              onClick={() => handleDeleteCustom(item)}
                              title="Permanently Delete (Admin Only)"
                              className="p-1 rounded text-xs text-red-500 hover:text-red-700 hover:bg-red-50 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {!canManage && !isAdmin && (
                            <span className="text-slate-400 text-[10px] italic">Restricted</span>
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

        {/* Modal for Proactive Custom Manpower Creation */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
            <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-md overflow-hidden animate-in fade-in duration-150">
              <div className="bg-blue-700 text-white px-5 py-3.5 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <UserPlus className="w-4 h-4" />
                  <h3 className="font-bold text-sm">Register Custom Worker or Team</h3>
                </div>
                <button onClick={() => setShowAddModal(false)} className="text-blue-200 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateCustom} className="p-5 space-y-3.5 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Department / Area *
                  </label>
                  <select
                    value={newArea}
                    onChange={(e) => setNewArea(e.target.value)}
                    disabled={!isAdmin}
                    className="w-full bg-slate-50 border border-slate-300 rounded p-2 text-xs text-slate-800 font-medium outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
                  >
                    <option value="KSM">KSM Area</option>
                    <option value="PDR">PDR Area</option>
                    <option value="CRM">CRM Area</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Assignment Type *
                  </label>
                  <div className="flex items-center space-x-4">
                    <label className="flex items-center space-x-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="customType"
                        value="worker"
                        checked={newType === 'worker'}
                        onChange={() => setNewType('worker')}
                      />
                      <span>Individual Worker</span>
                    </label>
                    <label className="flex items-center space-x-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="customType"
                        value="team"
                        checked={newType === 'team'}
                        onChange={() => setNewType('team')}
                      />
                      <span>Team (with Members)</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                    {newType === 'worker' ? 'Worker Name *' : 'Team Name *'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={newType === 'worker' ? 'Enter worker name' : 'Enter team name'}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded p-2 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-blue-600 font-medium"
                  />
                </div>

                {newType === 'team' && (
                  <div>
                    <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Team Members (Comma-Separated) *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., TEAM-OP-A, TEAM-OP-B, TEAM-OP-C"
                      value={newMembers}
                      onChange={(e) => setNewMembers(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded p-2 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-blue-600 font-medium"
                    />
                  </div>
                )}

                <div className="pt-2 border-t border-slate-200 flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-3.5 py-1.5 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded transition font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded shadow transition"
                  >
                    Save Custom {newType === 'worker' ? 'Worker' : 'Team'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 3: MASTER DATA REFERENCE (Everyone can view) */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-6">
        <div className="border-b border-slate-100 pb-3">
          <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-2">
            <Database className="w-4 h-4 text-slate-600" />
            <span>Factory Master Data Reference (Authoritative from PDF)</span>
          </h3>
          <p className="text-[11px] text-slate-500">
            Process flows, manpower rosters, capabilities, and capacity rules.
          </p>
        </div>

        {/* Process Flows Display */}
        <div className="space-y-4">
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
            <GitFork className="w-3.5 h-3.5 text-blue-600" />
            <span>Documented Process Workflows</span>
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Traction */}
            <div className="border border-slate-200 rounded-lg p-3 space-y-2 bg-slate-50/50">
              <span className="font-bold text-indigo-900 block border-b border-slate-200 pb-1">
                Traction Assembly Flow (10 Stages)
              </span>
              <ol className="list-decimal pl-4 space-y-1 text-slate-700">
                {(masterData?.workflows?.traction || []).map(s => (
                  <li key={s.stageNumber}>
                    <span className="font-semibold text-slate-800">{s.name}</span> — <span className="font-mono text-[10px] px-1 py-0.2 rounded bg-slate-200">{s.area}</span>: <span className="text-slate-500">{s.notes}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* DCS */}
            <div className="border border-slate-200 rounded-lg p-3 space-y-2 bg-slate-50/50">
              <span className="font-bold text-cyan-900 block border-b border-slate-200 pb-1">
                DCS Assembly Flow (8 Stages)
              </span>
              <ol className="list-decimal pl-4 space-y-1 text-slate-700">
                {(masterData?.workflows?.dcs || []).map(s => (
                  <li key={s.stageNumber}>
                    <span className="font-semibold text-slate-800">{s.name}</span> — <span className="font-mono text-[10px] px-1 py-0.2 rounded bg-slate-200">{s.area}</span>: <span className="text-slate-500">{s.notes}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>

        {/* Assumptions Registry Display */}
        <div className="space-y-3 pt-3 border-t border-slate-100">
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Documented Assumptions & Open Items (PDF Section 9)
          </h4>

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-slate-200 text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px]">
                <tr>
                  <th className="py-2.5 px-3 text-left">Ref</th>
                  <th className="py-2.5 px-3 text-left">Factory Item</th>
                  <th className="py-2.5 px-3 text-left">Documented Assumption</th>
                  <th className="py-2.5 px-3 text-left">Portal Implementation Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {(masterData?.assumptions || []).map(a => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-600">{a.id}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-800">{a.title}</td>
                    <td className="py-2.5 px-3 text-slate-600">{a.assumption}</td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        {a.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
