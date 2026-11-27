import React, { useState, useEffect } from 'react';
import { X, Play, AlertTriangle, Users, UserPlus } from 'lucide-react';
import { api } from '../utils/api.js';

export default function StartStageModal({ panel, masterData, onClose, onStarted }) {
  const [selectedWorker, setSelectedWorker] = useState('');
  const [isOthers, setIsOthers] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customMembers, setCustomMembers] = useState('');
  const [error, setError] = useState('');
  const [overloadWarning, setOverloadWarning] = useState(null);
  const [loading, setLoading] = useState(false);

  // Determine eligible workers for this stage
  const workflow = panel.type === 'Traction' ? masterData.workflows.traction : masterData.workflows.dcs;
  const stageDef = workflow.find(s => s.stageNumber === panel.current_stage);
  const eligibleWorkers = stageDef ? stageDef.eligibleWorkers : [];

  const isTeamStage = Boolean(
    stageDef && (
      stageDef.eligibleWorkers.some(w => w.includes('Team')) ||
      stageDef.name.toLowerCase().includes('wiring') ||
      stageDef.name.toLowerCase().includes('cabling')
    )
  );

  useEffect(() => {
    if (eligibleWorkers.length > 0 && !isOthers) {
      setSelectedWorker(eligibleWorkers[0]);
    }
  }, [panel, eligibleWorkers]);

  const handleStart = async (confirmedOverload = false) => {
    let assignedName = selectedWorker;
    let customPayload = null;

    if (isOthers) {
      const cleanName = customName.trim();
      if (!cleanName || cleanName.length < 2) {
        setError(isTeamStage ? 'Please enter a valid team name (at least 2 characters).' : 'Please enter a valid worker name (at least 2 characters).');
        return;
      }

      if (isTeamStage) {
        const cleanMembers = customMembers.trim();
        if (!cleanMembers || cleanMembers.length < 2) {
          setError('Please specify team members (e.g. TEAM-OP-A, TEAM-OP-B).');
          return;
        }
        customPayload = {
          area: stageDef.area,
          type: 'team',
          name: cleanName,
          members: cleanMembers
        };
      } else {
        customPayload = {
          area: stageDef.area,
          type: 'worker',
          name: cleanName,
          members: null
        };
      }

      assignedName = cleanName;
    } else {
      if (!selectedWorker) {
        setError('Please select an eligible worker or team.');
        return;
      }
    }

    try {
      setLoading(true);
      setError('');
      setOverloadWarning(null);

      await api.post(`/panels/${panel.id}/start`, {
        assignedTo: assignedName,
        confirmedOverload,
        customManpower: customPayload
      });

      onStarted();
      onClose();
    } catch (err) {
      if (err.status === 409 && err.data && err.data.requiresConfirmation) {
        setOverloadWarning(err.data.message);
      } else {
        setError(err.message || 'Failed to start stage.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-blue-700 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Play className="w-5 h-5" />
            <h2 className="text-base font-bold">Start Stage: {stageDef?.name}</h2>
          </div>
          <button onClick={onClose} className="text-blue-200 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs">
          {/* Panel Info Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 grid grid-cols-2 gap-2">
            <div>
              <span className="text-slate-400 block font-medium">Panel ID:</span>
              <span className="font-mono font-bold text-slate-800">{panel.id} ({panel.type})</span>
            </div>
            <div>
              <span className="text-slate-400 block font-medium">Owning Area:</span>
              <span className="font-bold text-blue-700">{stageDef?.area}</span>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border-l-4 border-red-500 text-red-700 rounded">
              {error}
            </div>
          )}

          {overloadWarning && (
            <div className="p-3 bg-amber-50 border-l-4 border-amber-500 text-amber-800 rounded space-y-2">
              <div className="flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
                <span className="font-medium">{overloadWarning}</span>
              </div>
              <p className="text-[11px] text-amber-700">
                Rule note: You may explicitly confirm and proceed if authorised by factory supervisor.
              </p>
            </div>
          )}

          {/* Worker / Team Selection Dropdown with "Others" */}
          <div>
            <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span>Assign Eligible Worker / Team *</span>
              {isOthers && (
                <span className="text-blue-600 font-bold lowercase text-[11px]">
                  (custom entry mode)
                </span>
              )}
            </label>
            <div className="relative">
              <select
                id="select-stage-worker"
                value={isOthers ? '__OTHERS__' : selectedWorker}
                onChange={(e) => {
                  if (e.target.value === '__OTHERS__') {
                    setIsOthers(true);
                    setSelectedWorker('');
                  } else {
                    setIsOthers(false);
                    setSelectedWorker(e.target.value);
                  }
                  setOverloadWarning(null);
                  setError('');
                }}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-800 font-medium focus:ring-2 focus:ring-blue-600 outline-none"
              >
                {eligibleWorkers.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
                <option value="__OTHERS__" className="font-bold text-blue-700 bg-blue-50">
                  + Others (Custom {isTeamStage ? 'Team & Members' : 'Worker Name'})...
                </option>
              </select>
            </div>
          </div>

          {/* Dynamic "Others" Custom Entry Interface */}
          {isOthers && (
            <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-lg space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center space-x-1.5 text-blue-900 font-bold">
                {isTeamStage ? <Users className="w-4 h-4 text-blue-700" /> : <UserPlus className="w-4 h-4 text-blue-700" />}
                <span>Define Custom {isTeamStage ? 'Team & Membership' : 'Worker'}</span>
              </div>

              {!isTeamStage ? (
                <div>
                  <label className="block font-bold text-slate-700 text-xs mb-1">
                    Enter Worker Name *
                  </label>
                  <input
                    type="text"
                    id="input-worker-name"
                    required
                    placeholder="Enter worker name"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-blue-600 font-medium"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Name will be registered for {stageDef?.area} and persist across subsequent workflow stages.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div>
                    <label className="block font-bold text-slate-700 text-xs mb-1">
                      Enter Custom Team Name *
                    </label>
                    <input
                      type="text"
                      id="input-team-name"
                      required
                      placeholder="e.g., PDR Team 7, CRM Team 10"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-blue-600 font-medium"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 text-xs mb-1">
                      Enter Team Members *
                    </label>
                    <input
                      type="text"
                      id="input-team-members"
                      required
                      placeholder="e.g., TEAM-OP-A, TEAM-OP-B, TEAM-OP-C"
                      value={customMembers}
                      onChange={(e) => setCustomMembers(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-blue-600 font-medium"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Team and member names will be saved persistently for {stageDef?.area} and available for later assignments.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Buttons */}
          <div className="pt-3 border-t border-slate-200 flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg transition font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            {overloadWarning ? (
              <button
                type="button"
                onClick={() => handleStart(true)}
                disabled={loading}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg shadow transition disabled:opacity-50"
              >
                {loading ? 'Confirming...' : 'Authorize & Start with Overload'}
              </button>
            ) : (
              <button
                type="button"
                id="btn-confirm-start-stage"
                onClick={() => handleStart(false)}
                disabled={loading}
                className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-lg shadow transition disabled:opacity-50"
              >
                {loading ? 'Starting...' : 'Start Production Stage'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
