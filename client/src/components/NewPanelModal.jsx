import React, { useState } from 'react';
import { X, PlusCircle, AlertCircle } from 'lucide-react';
import { api } from '../utils/api.js';

export default function NewPanelModal({ isOpen, onClose, onCreated }) {
  const [panelId, setPanelId] = useState('');
  const [type, setType] = useState('Traction');
  const [project, setProject] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [startDate, setStartDate] = useState(() => {
    return new Date().toISOString().slice(0, 10);
  });
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!panelId.trim() || !project.trim() || !dueDate) {
      setError('Please provide all mandatory fields (ID, project, start date, due date).');
      return;
    }

    if (startDate && dueDate && startDate > dueDate) {
      setError(`Planned Start Date (${startDate}) cannot be after Planned Due Date (${dueDate}).`);
      return;
    }

    try {
      setLoading(true);
      setError('');
      await api.post('/panels', {
        id: panelId.trim().toUpperCase(),
        type,
        project: project.trim(),
        priority,
        startDate,
        dueDate
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create panel.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-md overflow-hidden">
        <div className="bg-blue-800 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <PlusCircle className="w-5 h-5" />
            <h2 className="text-base font-bold">Register New Panel</h2>
          </div>
          <button onClick={onClose} className="text-blue-200 hover:text-white transition">
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
            <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Panel Unique Identifier *
            </label>
            <input
              type="text"
              placeholder="e.g. TR-102, DCS-042"
              value={panelId}
              onChange={(e) => setPanelId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 font-mono font-bold focus:ring-2 focus:ring-blue-600 outline-none uppercase"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Panel Type *
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 font-medium focus:ring-2 focus:ring-blue-600 outline-none"
              >
                <option value="Traction">Traction (8 Stages)</option>
                <option value="DCS">DCS (6 Stages)</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Priority *
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 font-medium focus:ring-2 focus:ring-blue-600 outline-none"
              >
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Project Name / Description *
            </label>
            <input
              type="text"
              placeholder="e.g. WAG-9 Freight Loco, Vande Bharat"
              value={project}
              onChange={(e) => setProject(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-blue-600 outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Planned Start Date *
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-blue-600 outline-none"
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Planned Due Date *
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-blue-600 outline-none"
                required
              />
            </div>
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
              className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-lg shadow transition disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Register Panel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
