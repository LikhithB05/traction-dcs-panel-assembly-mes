import React, { useState } from 'react';
import { X, RotateCcw, AlertTriangle, ArrowLeft, ShieldAlert } from 'lucide-react';
import { api } from '../utils/api.js';

export default function UndoConfirmationModal({ panel, isOpen, onClose, onSuccess }) {
  const [reason, setReason] = useState('Operational correction: Stage marked completed by mistake');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !panel) return null;

  // Determine stage being reversed and destination stage
  const isFinalDone = panel.status === 'Done';
  const stageToReverse = isFinalDone ? panel.current_stage : (panel.current_stage - 1);
  const stageToReturn = isFinalDone ? panel.current_stage : (panel.current_stage - 1);

  const handleConfirmUndo = async (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Please provide a brief reason for reversing the stage completion.');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const res = await api.post(`/panels/${panel.id}/undo`, {
        reason: reason.trim()
      });

      onSuccess(res.message || `Stage completion reversed. Panel returned to Stage ${stageToReturn}.`);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to undo stage completion.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-lg overflow-hidden animate-in fade-in duration-150">
        {/* Header */}
        <div className="bg-amber-600 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <RotateCcw className="w-5 h-5" />
            <h2 className="text-base font-bold tracking-tight">Undo Last Stage Completion</h2>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-amber-100 hover:text-white p-1 rounded transition disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleConfirmUndo} className="p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-red-50 border-l-4 border-red-500 text-red-700 rounded flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Panel Info Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">Panel Identifier:</span>
              <span className="font-mono font-bold text-slate-800 text-sm">{panel.id} ({panel.type})</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">Project Name:</span>
              <span className="font-semibold text-slate-800">{panel.project}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">Current Status:</span>
              <span className={`inline-block px-2 py-0.5 rounded font-bold text-[11px] ${
                panel.status === 'Done' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-800'
              }`}>
                {panel.status} (Stage #{panel.current_stage})
              </span>
            </div>
          </div>

          {/* Transition Visualizer */}
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg space-y-2 text-slate-800">
            <div className="flex items-center space-x-2 text-amber-900 font-bold">
              <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>Workflow Reversal Preview</span>
            </div>

            <div className="grid grid-cols-5 gap-2 items-center text-center pt-1">
              <div className="col-span-2 bg-white border border-slate-200 p-2 rounded">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Reversing Completion</span>
                <span className="font-bold text-slate-800 text-xs">Stage #{stageToReverse}</span>
              </div>

              <div className="col-span-1 flex justify-center">
                <ArrowLeft className="w-5 h-5 text-amber-600 animate-pulse" />
              </div>

              <div className="col-span-2 bg-white border border-amber-300 p-2 rounded">
                <span className="text-[10px] uppercase font-bold text-amber-700 block">Returning Panel To</span>
                <span className="font-bold text-amber-900 text-xs">Stage #{stageToReturn} (Waiting)</span>
              </div>
            </div>

            <p className="text-[11px] text-amber-800 pt-1 leading-relaxed">
              The original completion timestamp will be preserved in the audit log, and the stage will be reset so operators can perform and complete it again.
            </p>
          </div>

          {/* Reason Input */}
          <div>
            <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
              Correction Reason (Auditable) *
            </label>
            <textarea
              rows={3}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this stage completion is being reversed..."
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs text-slate-800 focus:ring-2 focus:ring-amber-500 outline-none font-medium"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-200 flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg transition font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg shadow transition flex items-center space-x-1.5 disabled:opacity-50"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'Reversing Stage...' : 'Confirm & Reverse Stage'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
