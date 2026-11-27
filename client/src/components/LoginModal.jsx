import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { Lock, ShieldCheck, Factory, AlertCircle, KeyRound, UserCheck } from 'lucide-react';

export default function LoginModal() {
  const { login } = useAuth();
  const [username, setUsername] = useState('ksm');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!pin) {
      setError('Please enter your security PIN.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      await login(username, pin);
    } catch (err) {
      setError(err.message || 'Authentication failed. Please verify your role and PIN.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-md overflow-hidden">
        {/* Top Header with Gradient Bar */}
        <div className="gradient-top-bar h-2 w-full"></div>
        
        <div className="p-8">
          <div className="flex items-center space-x-3 mb-6">
            <div className="bg-blue-800 text-white p-3 rounded-lg shadow">
              <Factory className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">BHEL EDN — Bengaluru</h1>
              <p className="text-xs font-semibold text-blue-700 tracking-wide uppercase">Traction & DCS Panel Assembly Portal</p>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4 mb-6">
            <h2 className="text-base font-semibold text-slate-800 flex items-center space-x-2">
              <KeyRound className="w-4 h-4 text-slate-600" />
              <span>Operational Authentication</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Select your authorized area role and enter your secure PIN to access assembly management operations.
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-500 text-red-700 text-xs rounded flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>{error}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Role / Account Identifier
              </label>
              <div className="relative">
                <select
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-sm rounded-lg px-3.5 py-2.5 focus:ring-2 focus:ring-blue-600 focus:border-blue-600 outline-none transition"
                >
                  <option value="ksm">KSM — Support & Assembly Lead</option>
                  <option value="pdr">PDR — Mechanical & Electrical Lead</option>
                  <option value="crm">CRM — Electrical Cabling Lead</option>
                  <option value="akr">AKR — Master Administrator</option>
                  <option value="ckg">CKG — Master Administrator</option>
                </select>
                <UserCheck className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Security PIN / Password
              </label>
              <div className="relative">
                <input
                  type="password"
                  placeholder="Enter security PIN"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-sm rounded-lg px-3.5 py-2.5 focus:ring-2 focus:ring-blue-600 focus:border-blue-600 outline-none transition placeholder-slate-400"
                  autoFocus
                />
                <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 bg-blue-700 hover:bg-blue-800 text-white font-medium py-2.5 px-4 rounded-lg shadow-md hover:shadow-lg transition flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              {loading ? (
                <span>Authenticating Session...</span>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Sign In to Portal</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-200 text-center">
            <p className="text-[11px] text-slate-500">
              Authorized BHEL internal factory personnel only. All access, starts, and completions are cryptographically audited.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
