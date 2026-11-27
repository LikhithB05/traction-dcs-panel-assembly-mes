import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import Header from './components/Header.jsx';
import Navigation from './components/Navigation.jsx';
import LoginModal from './components/LoginModal.jsx';
import ExecutePanels from './components/tabs/ExecutePanels.jsx';
import PlanTargets from './components/tabs/PlanTargets.jsx';
import DailyStatus from './components/tabs/DailyStatus.jsx';
import Overview from './components/tabs/Overview.jsx';
import WhatIfSimulator from './components/tabs/WhatIfSimulator.jsx';
import BackupMasterData from './components/tabs/BackupMasterData.jsx';
import ProductionReports from './components/tabs/ProductionReports.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { api } from './utils/api.js';

function Dashboard() {
  const { user, isAuthenticated, loading } = useAuth();
  // Default tab after login: 'execute' (Execute: Panels)
  const [activeTab, setActiveTab] = useState('execute');
  const [masterData, setMasterData] = useState(null);

  useEffect(() => {
    if (isAuthenticated) {
      api.get('/master-data').then(setMasterData).catch(console.error);
    }
  }, [isAuthenticated]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white font-mono text-sm">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <span>Initializing BHEL Secure Factory Session...</span>
        </div>
      </div>
    );
  }

  // Not authenticated: Show ONLY the sign-in modal
  if (!isAuthenticated) {
    return <LoginModal />;
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <Header />
      <Navigation activeTab={activeTab} onSelectTab={setActiveTab} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <ErrorBoundary>
          {activeTab === 'execute' && (
            <ExecutePanels masterData={masterData} />
          )}
          {activeTab === 'plan' && (
            <PlanTargets masterData={masterData} />
          )}
          {activeTab === 'daily' && (
            <DailyStatus masterData={masterData} />
          )}
          {activeTab === 'overview' && (
            <Overview masterData={masterData} onSelectPanel={() => setActiveTab('execute')} />
          )}
          {activeTab === 'reports' && (
            <ProductionReports masterData={masterData} />
          )}
          {activeTab === 'simulator' && (
            <WhatIfSimulator masterData={masterData} />
          )}
          {activeTab === 'backup' && (
            <BackupMasterData masterData={masterData} />
          )}
        </ErrorBoundary>
      </main>

      <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Bharat Heavy Electricals Limited — Electronics Division (EDN), Bangalore</span>
          <span className="font-mono text-[11px] text-slate-400">MES Portal v1.0.0 • SQLite Shared Engine Active</span>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Dashboard />
    </AuthProvider>
  );
}
