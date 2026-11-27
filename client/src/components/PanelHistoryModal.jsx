import React from 'react';
import { X, Clock, CheckCircle2, AlertTriangle, User, Calendar, Tag } from 'lucide-react';

export default function PanelHistoryModal({ panel, onClose }) {
  if (!panel) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="text-xs font-bold px-2.5 py-1 rounded bg-blue-600 text-white uppercase tracking-wider">
              {panel.type}
            </span>
            <h2 className="text-lg font-bold tracking-tight">Panel {panel.id} Lifecycle Audit History</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Panel Overview Summary */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-3.5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <span className="text-slate-400 block font-medium">Project:</span>
            <span className="font-semibold text-slate-800">{panel.project}</span>
          </div>
          <div>
            <span className="text-slate-400 block font-medium">Priority:</span>
            <span className={`font-bold ${
              panel.priority === 'High' ? 'text-red-600' : panel.priority === 'Medium' ? 'text-amber-600' : 'text-blue-600'
            }`}>
              {panel.priority}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block font-medium">Due Date:</span>
            <span className="font-semibold text-slate-800">{panel.due_date}</span>
          </div>
          <div>
            <span className="text-slate-400 block font-medium">Current Status:</span>
            <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold ${
              panel.status === 'Done' ? 'bg-emerald-100 text-emerald-800' :
              panel.status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
              panel.status === 'Held' ? 'bg-amber-100 text-amber-800' :
              'bg-slate-200 text-slate-700'
            }`}>
              {panel.status}
            </span>
          </div>
        </div>

        {/* Stage Timeline Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          <div>
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
              Production Stage Progress Timeline
            </h3>

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-100 text-slate-700 font-semibold">
                  <tr>
                    <th className="py-2.5 px-3 text-left">#</th>
                    <th className="py-2.5 px-3 text-left">Stage Name</th>
                    <th className="py-2.5 px-3 text-left">Area</th>
                    <th className="py-2.5 px-3 text-left">Assigned Worker / Team</th>
                    <th className="py-2.5 px-3 text-left">Started At</th>
                    <th className="py-2.5 px-3 text-left">Completed At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {(panel.stageHistory || []).map((sh) => {
                    const isUndone = Boolean(sh.undone_at);
                    const isCompleted = Boolean(sh.completed_at) && !isUndone;
                    const isInProgress = Boolean(sh.started_at && !sh.completed_at && !isUndone);

                    return (
                      <tr key={sh.id} className={isUndone ? 'bg-amber-50/60' : isInProgress ? 'bg-blue-50/50' : ''}>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-600">{sh.stage_number}</td>
                        <td className="py-2.5 px-3 font-semibold text-slate-800">
                          <span>{sh.stage_name}</span>
                          {isInProgress && (
                            <span className="ml-2 text-[10px] bg-blue-600 text-white font-bold px-1.5 py-0.2 rounded">
                              ACTIVE
                            </span>
                          )}
                          {isUndone && (
                            <span className="ml-2 text-[10px] bg-amber-600 text-white font-bold px-1.5 py-0.2 rounded" title="Stage completion was reversed by administrator">
                              REVERSED CORRECTION
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-slate-100 text-slate-700 border border-slate-200">
                            {sh.area}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-700">
                          {sh.assigned_to || <span className="text-slate-400 italic">Unassigned</span>}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-500">
                          {sh.started_at ? new Date(sh.started_at).toLocaleString('en-IN') : '—'}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-500">
                          {isUndone ? (
                            <div className="space-y-0.5">
                              <span className="line-through text-slate-400 block">
                                {new Date(sh.completed_at).toLocaleString('en-IN')}
                              </span>
                              <span className="text-amber-800 font-sans font-bold text-[11px] block">
                                Undone: {new Date(sh.undone_at).toLocaleString('en-IN')} ({sh.undone_by || 'Admin'})
                              </span>
                              {sh.undo_reason && (
                                <span className="text-slate-600 font-sans italic text-[10px] block">
                                  "{sh.undo_reason}"
                                </span>
                              )}
                            </div>
                          ) : sh.completed_at ? (
                            new Date(sh.completed_at).toLocaleString('en-IN')
                          ) : (
                            isInProgress ? <span className="text-blue-600 font-semibold">In Progress</span> : '—'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Hold History Section if any */}
          {panel.holdHistory && panel.holdHistory.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Recorded Hold Interruptions</span>
              </h3>
              <div className="bg-amber-50/50 border border-amber-200 rounded-lg p-3 space-y-2 text-xs">
                {panel.holdHistory.map((hh) => (
                  <div key={hh.id} className="border-b border-amber-100 last:border-0 pb-2 last:pb-0">
                    <div className="flex items-center justify-between text-slate-600 mb-1">
                      <span className="font-semibold text-amber-900">Stage {hh.stage_number} Interruption</span>
                      <span className="font-mono text-[11px] text-slate-500">
                        {new Date(hh.held_at).toLocaleString('en-IN')} {hh.resumed_at ? `to ${new Date(hh.resumed_at).toLocaleString('en-IN')}` : '(Still Active)'}
                      </span>
                    </div>
                    <p className="text-slate-700 font-medium">Reason: <span className="italic">{hh.reason}</span></p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-100 border-t border-slate-200 px-6 py-3 flex justify-end">
          <button
            onClick={onClose}
            className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold px-4 py-2 rounded-lg transition"
          >
            Close Audit View
          </button>
        </div>
      </div>
    </div>
  );
}
