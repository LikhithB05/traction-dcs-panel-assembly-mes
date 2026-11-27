import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { api } from '../../utils/api.js';
import {
  Calendar, CheckSquare, Save, AlertCircle, CheckCircle2,
  RefreshCw, Boxes, Lock, Sparkles, TrendingUp
} from 'lucide-react';

export default function DailyStatus() {
  const { user, isAdmin } = useAuth();
  const [area, setArea] = useState(() => (user?.role && ['KSM', 'PDR', 'CRM'].includes(user.role) ? user.role : 'KSM'));
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [roster, setRoster] = useState([]);
  const [subAssemblies, setSubAssemblies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingWorker, setSavingWorker] = useState(null);
  const [savingSubItem, setSavingSubItem] = useState(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Local drafts to enable smooth typing before save
  const [rosterDrafts, setRosterDrafts] = useState({});
  const [subDrafts, setSubDrafts] = useState({});

  const fetchDailyData = async () => {
    try {
      setLoading(true);
      setError('');

      // Fetch workers daily status for area and date
      const data = await api.get(`/daily-status?area=${area}&date=${date}`);
      setRoster(data.roster);

      const rDrafts = {};
      data.roster.forEach(w => {
        rDrafts[w.teamOrPerson] = { target: w.target, actual: w.actual };
      });
      setRosterDrafts(rDrafts);

      // Fetch KSM sub-assemblies if area is KSM
      if (area === 'KSM') {
        const subData = await api.get(`/sub-assemblies?date=${date}`);
        setSubAssemblies(subData.items);

        const sDrafts = {};
        subData.items.forEach(item => {
          sDrafts[item.item] = { target: item.target, actual: item.actual };
        });
        setSubDrafts(sDrafts);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch daily status.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDailyData();
  }, [area, date]);

  const handleRosterChange = (name, field, val) => {
    const num = Math.max(0, parseFloat(val) || 0);
    setRosterDrafts(prev => ({
      ...prev,
      [name]: {
        ...prev[name],
        [field]: num
      }
    }));
  };

  const handleSubChange = (item, field, val) => {
    const num = Math.max(0, parseFloat(val) || 0);
    setSubDrafts(prev => ({
      ...prev,
      [item]: {
        ...prev[item],
        [field]: num
      }
    }));
  };

  const handleSaveRoster = async (worker) => {
    const draft = rosterDrafts[worker.teamOrPerson] || { target: worker.target, actual: worker.actual };
    try {
      setSavingWorker(worker.teamOrPerson);
      setError('');

      const res = await api.post('/daily-status', {
        date,
        area,
        teamOrPerson: worker.teamOrPerson,
        target: draft.target,
        actual: draft.actual
      });

      setSuccessMsg(`Saved entry for ${worker.teamOrPerson}: Target=${draft.target}, Actual=${draft.actual}`);
      setTimeout(() => setSuccessMsg(''), 4000);
      fetchDailyData();
    } catch (err) {
      setError(err.message || 'Failed to save daily status.');
    } finally {
      setSavingWorker(null);
    }
  };

  const handleSaveSubAssembly = async (spec) => {
    const draft = subDrafts[spec.item] || { target: spec.target, actual: spec.actual };
    try {
      setSavingSubItem(spec.item);
      setError('');

      const res = await api.post('/sub-assemblies', {
        date,
        item: spec.item,
        target: draft.target,
        actual: draft.actual
      });

      setSuccessMsg(`Saved sub-assembly for ${spec.item}`);
      setTimeout(() => setSuccessMsg(''), 4000);
      fetchDailyData();
    } catch (err) {
      setError(err.message || 'Failed to save sub-assembly.');
    } finally {
      setSavingSubItem(null);
    }
  };

  const canEditCurrentArea = () => {
    if (!user) return false;
    if (isAdmin) return true;
    return user.role === area;
  };

  const isEditable = canEditCurrentArea();

  return (
    <div className="space-y-6">
      {/* Header and Control Bar */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 card-accent-daily p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800 tracking-tight flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
              <span>Daily Status: Tracking & Execution Log</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Daily operational targets vs actuals. Automatic stage completion count & sub-assembly tracking.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Area Selector */}
            <div className="flex items-center space-x-1.5 bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5">
              <span className="text-xs font-bold text-slate-600">Area:</span>
              <select
                id="select-daily-area"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-800 outline-none"
              >
                <option value="KSM">KSM Area</option>
                <option value="PDR">PDR Area</option>
                <option value="CRM">CRM Area</option>
              </select>
            </div>

            {/* Date Selector */}
            <div className="flex items-center space-x-1.5 bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5">
              <Calendar className="w-4 h-4 text-emerald-600" />
              <input
                id="input-daily-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-800 outline-none"
              />
            </div>

            <button
              onClick={fetchDailyData}
              title="Refresh Records"
              className="p-2 border border-slate-300 hover:bg-slate-50 text-slate-600 rounded-lg transition"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {!isEditable && (
          <div className="mt-4 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center space-x-2">
            <Lock className="w-4 h-4 flex-shrink-0 text-amber-600" />
            <span>Viewing as {user?.role}. Only {area} Area Lead or Master Admin can edit these records.</span>
          </div>
        )}
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-3 bg-red-50 border-l-4 border-red-500 text-red-700 text-xs rounded-lg flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError('')} className="font-bold">✕</button>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-50 border-l-4 border-emerald-500 text-emerald-800 text-xs rounded-lg flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg('')} className="font-bold">✕</button>
        </div>
      )}

      {/* Personnel Daily Output Table */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
        <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm flex items-center space-x-2">
            <span>{area} Personnel & Teams Daily Roster</span>
            <span className="text-xs font-mono font-medium text-slate-500">({date})</span>
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-xs">
            <thead className="th-tint-daily font-bold text-[11px] tracking-wider uppercase">
              <tr>
                <th className="py-2.5 px-4 text-left">Team / Person</th>
                <th className="py-2.5 px-4 text-left">Role / Activity</th>
                <th className="py-2.5 px-3 text-center">Daily Target</th>
                <th className="py-2.5 px-3 text-center">Daily Actual</th>
                <th className="py-2.5 px-3 text-center">Auto-Logged Done</th>
                <th className="py-2.5 px-3 text-center">Variance</th>
                <th className="py-2.5 px-3 text-center">Achievement %</th>
                <th className="py-2.5 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {roster.map((worker) => {
                const draft = rosterDrafts[worker.teamOrPerson] || { target: worker.target, actual: worker.actual };
                const variance = draft.actual - draft.target;
                const achievement = draft.target > 0 ? Math.round((draft.actual / draft.target) * 100 * 10) / 10 : 0;
                const isSaving = savingWorker === worker.teamOrPerson;

                return (
                  <tr key={worker.teamOrPerson} className="hover:bg-emerald-50/20 transition">
                    <td className="py-3 px-4 font-bold text-slate-800">
                      {worker.teamOrPerson}
                    </td>

                    <td className="py-3 px-4 text-slate-500 font-medium">
                      {worker.roleDescription}
                    </td>

                    {/* Target */}
                    <td className="py-3 px-3 text-center">
                      {isEditable ? (
                        <input
                          id={`target-${worker.teamOrPerson}`}
                          type="number"
                          min="0"
                          step="1"
                          value={draft.target}
                          onChange={(e) => handleRosterChange(worker.teamOrPerson, 'target', e.target.value)}
                          className="w-16 bg-slate-50 border border-slate-300 rounded px-2 py-1 text-center font-bold text-slate-800 focus:ring-2 focus:ring-emerald-600 outline-none"
                        />
                      ) : (
                        <span className="font-semibold text-slate-700">{worker.target}</span>
                      )}
                    </td>

                    {/* Actual */}
                    <td className="py-3 px-3 text-center">
                      {isEditable ? (
                        <input
                          id={`actual-${worker.teamOrPerson}`}
                          type="number"
                          min="0"
                          step="1"
                          value={draft.actual}
                          onChange={(e) => handleRosterChange(worker.teamOrPerson, 'actual', e.target.value)}
                          className="w-16 bg-slate-50 border border-slate-300 rounded px-2 py-1 text-center font-bold text-slate-800 focus:ring-2 focus:ring-emerald-600 outline-none"
                        />
                      ) : (
                        <span className="font-semibold text-slate-700">{worker.actual}</span>
                      )}
                    </td>

                    {/* Auto-Logged Done */}
                    <td className="py-3 px-3 text-center">
                      <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-100 border border-slate-200 font-mono font-bold text-slate-700">
                        <Sparkles className="w-3 h-3 text-emerald-600" />
                        <span>{worker.autoLoggedDone}</span>
                      </span>
                    </td>

                    {/* Variance */}
                    <td className="py-3 px-3 text-center">
                      <span className={`font-mono font-bold ${
                        variance >= 0 ? 'text-emerald-700' : 'text-red-600'
                      }`}>
                        {variance > 0 ? `+${variance}` : variance}
                      </span>
                    </td>

                    {/* Achievement % */}
                    <td className="py-3 px-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded font-mono font-bold text-[11px] ${
                        achievement >= 100 ? 'bg-emerald-100 text-emerald-800' :
                        achievement >= 75 ? 'bg-blue-100 text-blue-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {achievement}%
                      </span>
                    </td>

                    {/* Save Button */}
                    <td className="py-3 px-4 text-center">
                      {isEditable && (
                        <button
                          id={`save-btn-${worker.teamOrPerson}`}
                          onClick={() => handleSaveRoster(worker)}
                          disabled={isSaving}
                          className="bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs px-3 py-1.5 rounded-lg shadow-xs transition flex items-center space-x-1 mx-auto disabled:opacity-40"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>{isSaving ? 'Saving...' : 'Save'}</span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* KSM Sub-Assembly Section */}
      {area === 'KSM' && (
        <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
          <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Boxes className="w-4 h-4 text-emerald-700" />
              <h3 className="font-bold text-slate-800 text-sm">
                KSM Sub-Assembly Preparation Roster
              </h3>
            </div>
            <span className="text-xs text-slate-500 font-medium">
              Lead: KSM-SUB-1, KSM-SUB-2, KSM-SUB-3
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-xs">
              <thead className="th-tint-daily font-bold text-[11px] tracking-wider uppercase">
                <tr>
                  <th className="py-2.5 px-4 text-left">Sub-Assembly Item</th>
                  <th className="py-2.5 px-3 text-center">Daily Capacity</th>
                  <th className="py-2.5 px-3 text-center">Target</th>
                  <th className="py-2.5 px-3 text-center">Actual</th>
                  <th className="py-2.5 px-3 text-center">Variance</th>
                  <th className="py-2.5 px-3 text-center">Achievement %</th>
                  <th className="py-2.5 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {subAssemblies.map((item) => {
                  const draft = subDrafts[item.item] || { target: item.target, actual: item.actual };
                  const variance = draft.actual - draft.target;
                  const achievement = draft.target > 0 ? Math.round((draft.actual / draft.target) * 100 * 10) / 10 : 0;
                  const isSaving = savingSubItem === item.item;

                  return (
                    <tr key={item.item} className="hover:bg-emerald-50/20 transition">
                      <td className="py-3 px-4 font-bold text-slate-800">
                        {item.item}
                      </td>

                      <td className="py-3 px-3 text-center font-mono font-semibold text-slate-600">
                        {item.dailyCapacity} <span className="text-[10px] text-slate-400">/day</span>
                      </td>

                      <td className="py-3 px-3 text-center">
                        {isEditable ? (
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={draft.target}
                            onChange={(e) => handleSubChange(item.item, 'target', e.target.value)}
                            className="w-16 bg-slate-50 border border-slate-300 rounded px-2 py-1 text-center font-bold text-slate-800 focus:ring-2 focus:ring-emerald-600 outline-none"
                          />
                        ) : (
                          <span className="font-semibold text-slate-700">{item.target}</span>
                        )}
                      </td>

                      <td className="py-3 px-3 text-center">
                        {isEditable ? (
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={draft.actual}
                            onChange={(e) => handleSubChange(item.item, 'actual', e.target.value)}
                            className="w-16 bg-slate-50 border border-slate-300 rounded px-2 py-1 text-center font-bold text-slate-800 focus:ring-2 focus:ring-emerald-600 outline-none"
                          />
                        ) : (
                          <span className="font-semibold text-slate-700">{item.actual}</span>
                        )}
                      </td>

                      <td className="py-3 px-3 text-center">
                        <span className={`font-mono font-bold ${
                          variance >= 0 ? 'text-emerald-700' : 'text-red-600'
                        }`}>
                          {variance > 0 ? `+${variance}` : variance}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded font-mono font-bold text-[11px] ${
                          achievement >= 100 ? 'bg-emerald-100 text-emerald-800' :
                          achievement >= 75 ? 'bg-blue-100 text-blue-800' :
                          'bg-amber-100 text-amber-800'
                        }`}>
                          {achievement}%
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center">
                        {isEditable && (
                          <button
                            onClick={() => handleSaveSubAssembly(item)}
                            disabled={isSaving}
                            className="bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs px-3 py-1.5 rounded-lg shadow-xs transition flex items-center space-x-1 mx-auto disabled:opacity-40"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>{isSaving ? 'Saving...' : 'Save'}</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
