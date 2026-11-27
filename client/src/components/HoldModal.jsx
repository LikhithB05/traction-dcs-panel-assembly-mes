import React, { useState } from 'react';
import { X, PauseCircle, AlertCircle } from 'lucide-react';
import { api } from '../utils/api.js';

export default function HoldModal({ panel, onClose, onHeld }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!panel) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('A reason is mandatory to place a panel on Hold.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      await api.post(`/panels/${panel.id}/hold`, { reason: reason.trim() });
      onHeld();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to place panel on hold.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-md overflow-hidden">
        <div className="bg-amber-600 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <PauseCircle className="w-5 h-5" />
            <h2 className="text-base font-bold">Hold Panel: {panel.id}</h2>
          </div>
          <button onClick={onClose} className="text-amber-200 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-red-50 border-l-4 border-red-500 text-red-700 rounded flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Reason for Production Hold *
            </label>
            <textarea
              rows={3}
              placeholder="e.g. Awaiting missing busbar component from stores, drawing clarification..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 outline-none"
              required
              autoFocus
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Hold reason will be permanently archived in the panel's audit history.
            </p>
          </div>

          <div className="pt-3 border-t border-slate-200 flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg transition font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg shadow transition disabled:opacity-50"
            >
              {loading ? 'Submitting...' : 'Confirm Hold'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
