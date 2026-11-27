import React, { useState, useEffect } from 'react';
import { X, Edit3, AlertCircle, CheckCircle2, ShieldAlert, Calendar } from 'lucide-react';
import { api } from '../utils/api.js';

export default function EditPanelModal({ panel, isOpen, onClose, onUpdated }) {
  const [project, setProject] = useState('');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (panel) {
      setProject(panel.project || '');
      setStartDate(panel.startDate || panel.start_date || (panel.created_at ? panel.created_at.slice(0, 10) : ''));
      setDueDate(panel.dueDate || panel.due_date || '');
      setError('');
    }
  }, [panel, isOpen]);

  if (!isOpen || !panel) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!project.trim()) {
      setError('Panel project name / description cannot be blank.');
      return;
    }
    if (!startDate || !dueDate) {
      setError('Both planned start date and planned due date are required.');
      return;
    }
    if (startDate > dueDate) {
      setError(`Planned Start Date (${startDate}) cannot be later than Planned Due Date (${dueDate}).`);
      return;
    }

    try {
      setLoading(true);
      setError('');

      await api.patch(`/panels/${panel.id}/admin-edit`, {
        project: project.trim(),
        startDate,
        dueDate
      });

      if (onUpdated) {
        onUpdated();
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update panel. Master Admin privilege is required.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-slate-800 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Edit3 className="w-5 h-5 text-blue-400" />
            <div>
              <h2 className="text-base font-bold">Admin Edit: Panel Name & Dates</h2>
              <p className="text-[11px] text-slate-300">Authorized Master Administrator Change Control</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-red-50 border-l-4 border-red-500 text-red-700 rounded-lg flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Immutable Panel Attributes */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 grid grid-cols-2 gap-2 text-slate-600">
            <div>
              <span className="text-[11px] font-semibold text-slate-400 block uppercase">Panel ID (Immutable):</span>
              <span className="font-mono font-bold text-slate-900 text-sm">{panel.id}</span>
            </div>
            <div>
              <span className="text-[11px] font-semibold text-slate-400 block uppercase">Type / Current Stage:</span>
              <span className="font-semibold text-slate-800">{panel.type} • Stage {panel.current_stage}</span>
            </div>
          </div>

          {/* Editable Project / Panel Name */}
          <div>
            <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Panel / Project Name *
            </label>
            <input
              type="text"
              value={project}
              onChange={(e) => setProject(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 font-medium focus:ring-2 focus:ring-blue-600 outline-none"
              placeholder="e.g. WAG-9 Freight Locomotive"
              required
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Internal panel identifier <code className="font-mono font-bold text-slate-600">{panel.id}</code> and history remain immutable.
            </p>
          </div>

          {/* Planned Start Date */}
          <div>
            <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Planned Start Date *
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 font-medium focus:ring-2 focus:ring-blue-600 outline-none"
              required
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Past, present, or future date allowed for flexible scheduling and delayed data entry.
            </p>
          </div>

          {/* Planned Due Date */}
          <div>
            <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Planned Due Date *
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 font-medium focus:ring-2 focus:ring-blue-600 outline-none"
              required
            />
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex items-start space-x-2 text-[11px] text-amber-800">
            <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <span>
              This operation is recorded in the permanent audit trail with your administrator credentials and timestamp.
            </span>
          </div>

          {/* Actions */}
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
              className="px-5 py-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-lg shadow-xs transition disabled:opacity-50"
            >
              {loading ? 'Saving Changes...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
