import React from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { Factory, LogOut, Shield, User, HardHat } from 'lucide-react';

export default function Header() {
  const { user, logout, isAdmin } = useAuth();

  return (
    <header className="bg-white shadow-sm border-b border-slate-200">
      {/* Top Gradient Bar (Blue-to-Purple-to-Orange) specified by PDF */}
      <div className="gradient-top-bar h-1.5 w-full"></div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* Brand & Factory Identity */}
        <div className="flex items-center space-x-3.5">
          <div className="bg-blue-800 text-white p-2.5 rounded-lg shadow-sm">
            <Factory className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-blue-900 tracking-wider text-base">BHEL</span>
              <span className="text-slate-300 font-light">|</span>
              <span className="text-slate-700 font-semibold text-sm">EDN Electronics Division</span>
            </div>
            <h1 className="text-xs font-medium text-slate-500 tracking-wide">
              Traction & DCS Panel Assembly Management Portal
            </h1>
          </div>
        </div>

        {/* User Session & Role Indicator */}
        {user && (
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2.5 bg-slate-50 border border-slate-200 px-3.5 py-1.5 rounded-lg">
              {isAdmin ? (
                <Shield className="w-4 h-4 text-amber-600" />
              ) : (
                <HardHat className="w-4 h-4 text-blue-600" />
              )}
              <div className="text-left">
                <div className="text-xs font-bold text-slate-800 leading-none">
                  {user.displayName}
                </div>
                <div className="text-[10px] font-semibold text-slate-500 mt-0.5">
                  Role: <span className="text-blue-700 uppercase font-bold">{user.role}</span>
                  {isAdmin && <span className="ml-1 text-amber-600 font-bold">(Master Admin)</span>}
                </div>
              </div>
            </div>

            <button
              onClick={logout}
              title="Sign Out"
              className="flex items-center space-x-1.5 text-xs font-semibold text-slate-600 hover:text-red-600 bg-white hover:bg-red-50 border border-slate-300 hover:border-red-300 px-3 py-1.5 rounded-lg transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
