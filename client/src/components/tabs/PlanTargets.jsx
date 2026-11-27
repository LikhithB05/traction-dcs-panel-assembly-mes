import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { api } from '../../utils/api.js';
import {
  Calendar, Save, AlertTriangle, CheckCircle2,
  AlertCircle, RefreshCw, Info, Lock
} from 'lucide-react';

export default function PlanTargets() {
  const { user, isAdmin } = useAuth();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingRow, setSavingRow] = useState(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Local draft state for edits
  const [drafts, setDrafts] = useState({});

  // Overload confirmation modal state
  const [overloadConfirm, setOverloadConfirm] = useState(null);

  const fetchPlans = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await api.get(`/plans?month=${month}`);
      setPlans(data.plans);

      // Initialize drafts
      const draftMap = {};
      data.plans.forEach(p => {
        draftMap[p.teamOrPerson] = {
          tractionPlan: p.tractionPlan,
          dcsPlan: p.dcsPlan
        };
      });
      setDrafts(draftMap);
    } catch (err) {
      setError(err.message || 'Failed to load planning targets.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, [month]);

  const handleInputChange = (teamOrPerson, field, value) => {
    const val = value === '' ? 0 : parseInt(value, 10);
    const num = isNaN(val) ? 0 : Math.max(0, val);
    setDrafts(prev => ({
      ...prev,
      [teamOrPerson]: {
        ...prev[teamOrPerson],
        [field]: num
      }
    }));
  };

  const calculateDynamicLoad = (item) => {
    const draft = drafts[item.teamOrPerson] || { tractionPlan: item.tractionPlan, dcsPlan: item.dcsPlan };
    if (!item.tractionCap || !item.dcsCap) return null;
    const tFrac = draft.tractionPlan / item.tractionCap;
    const dFrac = draft.dcsPlan / item.dcsCap;
    return Math.round((tFrac + dFrac) * 100 * 10) / 10;
  };

  const handleSavePlan = async (item, confirmedOverload = false) => {
    const draft = drafts[item.teamOrPerson] || { tractionPlan: item.tractionPlan, dcsPlan: item.dcsPlan };

    try {
      setSavingRow(item.teamOrPerson);
      setError('');
      setOverloadConfirm(null);

      const res = await api.post('/plans', {
        month,
        area: item.area,
        teamOrPerson: item.teamOrPerson,
        tractionPlan: draft.tractionPlan,
        dcsPlan: draft.dcsPlan,
        confirmedOverload
      });

      setSuccessMsg(`Saved target plan for ${item.teamOrPerson}`);
      setTimeout(() => setSuccessMsg(''), 4000);
      fetchPlans();
    } catch (err) {
      if (err.status === 409 && err.data && err.data.requiresConfirmation) {
        setOverloadConfirm({
          item,
          message: err.data.message,
          load: err.data.planLoadPercent
        });
      } else {
        setError(err.message || 'Failed to save plan.');
      }
    } finally {
      setSavingRow(null);
    }
  };

  const canEditArea = (area) => {
    if (!user) return false;
    if (isAdmin) return true;
    return user.role === area;
  };

  const renderPlanningTable = (categoryTitle, items, area) => {
    const editable = canEditArea(area);

    return (
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden mb-6">
        <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-600"></span>
            <h3 className="font-bold text-slate-800 text-sm">{categoryTitle}</h3>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-bold">
              Area: {area}
            </span>
          </div>
          {!editable && (
            <span className="text-[11px] text-slate-500 flex items-center space-x-1">
              <Lock className="w-3 h-3 text-slate-400" />
              <span>View Only (requires {area} Lead or Admin)</span>
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-xs">
            <thead className="th-tint-plan font-bold text-[11px] tracking-wider uppercase">
              <tr>
                <th className="py-2.5 px-4 text-left">Team / Person</th>
                <th className="py-2.5 px-3 text-center">Traction Plan</th>
                <th className="py-2.5 px-3 text-center">DCS Plan</th>
                <th className="py-2.5 px-3 text-center">Traction Cap</th>
                <th className="py-2.5 px-3 text-center">DCS Cap</th>
                <th className="py-2.5 px-3 text-center">Plan Load %</th>
                <th className="py-2.5 px-3 text-center">Actual Load %</th>
                <th className="py-2.5 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {items.map(item => {
                const draft = drafts[item.teamOrPerson] || { tractionPlan: item.tractionPlan, dcsPlan: item.dcsPlan };
                const dynamicLoad = calculateDynamicLoad(item);
                const isOverloaded = dynamicLoad !== null && dynamicLoad > 100;
                const isSaving = savingRow === item.teamOrPerson;

                return (
                  <tr key={item.teamOrPerson} className="hover:bg-purple-50/20 transition">
                    <td className="py-3 px-4 font-bold text-slate-800">
                      {item.teamOrPerson}
                    </td>

                    <td className="py-3 px-3 text-center">
                      {editable ? (
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={draft.tractionPlan}
                          onChange={(e) => handleInputChange(item.teamOrPerson, 'tractionPlan', e.target.value)}
                          className="w-16 bg-slate-50 border border-slate-300 rounded px-2 py-1 text-center font-bold text-slate-800 focus:ring-2 focus:ring-purple-600 outline-none"
                        />
                      ) : (
                        <span className="font-semibold text-slate-700">{item.tractionPlan}</span>
                      )}
                    </td>

                    <td className="py-3 px-3 text-center">
                      {editable ? (
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={draft.dcsPlan}
                          onChange={(e) => handleInputChange(item.teamOrPerson, 'dcsPlan', e.target.value)}
                          className="w-16 bg-slate-50 border border-slate-300 rounded px-2 py-1 text-center font-bold text-slate-800 focus:ring-2 focus:ring-purple-600 outline-none"
                        />
                      ) : (
                        <span className="font-semibold text-slate-700">{item.dcsPlan}</span>
                      )}
                    </td>

                    <td className="py-3 px-3 text-center font-mono text-slate-600">
                      {item.tractionCap || '—'}
                    </td>

                    <td className="py-3 px-3 text-center font-mono text-slate-600">
                      {item.dcsCap || '—'}
                    </td>

                    <td className="py-3 px-3 text-center">
                      <span className={`inline-block px-2.5 py-1 rounded font-mono font-bold text-xs ${
                        isOverloaded
                          ? 'bg-red-100 text-red-700 border border-red-300'
                          : 'bg-purple-50 text-purple-700 border border-purple-200'
                      }`}>
                        {dynamicLoad !== null ? `${dynamicLoad}%` : '—'}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-center">
                      <span className="font-mono text-slate-600">
                        {item.actualLoadPercent !== null ? `${item.actualLoadPercent}%` : '—'}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-center">
                      {editable && (
                        <button
                          onClick={() => handleSavePlan(item, false)}
                          disabled={isSaving}
                          className="bg-purple-700 hover:bg-purple-800 text-white font-semibold text-xs px-3 py-1.5 rounded-lg shadow-xs transition flex items-center space-x-1 mx-auto disabled:opacity-40"
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
    );
  };

  const pdrMechItems = plans.filter(p => p.category === 'PDR Mechanical');
  const pdrElecItems = plans.filter(p => p.category === 'PDR Electrical');
  const crmElecItems = plans.filter(p => p.category === 'CRM Electrical');

  return (
    <div className="space-y-6">
      {/* Tab Header Card */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 card-accent-plan p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800 tracking-tight flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-600"></span>
              <span>Plan: Targets & Capacity Allocation</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Monthly capacity planning per team or individual. Evaluates shared load formula: <span className="font-mono font-semibold">Load % = Σ(Plan / Capacity) * 100</span>.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2 bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5">
              <Calendar className="w-4 h-4 text-purple-600" />
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-800 outline-none"
              />
            </div>

            <button
              onClick={fetchPlans}
              className="p-2 border border-slate-300 hover:bg-slate-50 text-slate-600 rounded-lg transition"
              title="Refresh Plan"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Informational Guidance Notice */}
        <div className="mt-4 p-3 bg-purple-50/60 border border-purple-200 rounded-lg text-xs text-purple-900 flex items-start space-x-2.5">
          <Info className="w-4 h-4 flex-shrink-0 text-purple-600 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-semibold">Shared Capacity Rule:</span>
            <span> A team or person works on Traction OR DCS. Any combined load exceeding 100% requires explicit confirmation before saving. KSM daily assembly targets (KSM-OP-1 & KSM-OP-2) are monitored on Daily Status.</span>
          </div>
        </div>
      </div>

      {/* Feedback Banners */}
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

      {/* Section 1: PDR Mechanical */}
      {renderPlanningTable('PDR Mechanical Capacity Plan (10 Traction OR 30 DCS / mo per person)', pdrMechItems, 'PDR')}

      {/* Section 2: PDR Electrical */}
      {renderPlanningTable('PDR Electrical Teams (3 Traction OR 5 DCS / mo per team; Team 6 LV rate)', pdrElecItems, 'PDR')}

      {/* Section 3: CRM Electrical */}
      {renderPlanningTable('CRM Electrical Teams (3 Traction OR 5 DCS / mo per team)', crmElecItems, 'CRM')}

      {/* Overload Confirmation Modal */}
      {overloadConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-md overflow-hidden">
            <div className="bg-red-700 text-white px-6 py-4 flex items-center space-x-2">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <h2 className="text-base font-bold">Capacity Overload Warning (&gt;100%)</h2>
            </div>
            <div className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 font-medium">
                {overloadConfirm.message}
              </div>
              <p className="text-slate-600">
                Are you sure you want to save this allocation? The factory supervisor must authorize any schedule that pushes a team beyond 100% monthly capacity.
              </p>
              <div className="pt-3 border-t border-slate-200 flex justify-end space-x-2">
                <button
                  onClick={() => setOverloadConfirm(null)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg font-medium"
                >
                  Cancel & Adjust
                </button>
                <button
                  onClick={() => handleSavePlan(overloadConfirm.item, true)}
                  className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white font-semibold rounded-lg shadow"
                >
                  Confirm & Save Overload
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
