import React from 'react';
import {
  CalendarDays,
  Layers,
  CheckSquare,
  BarChart3,
  Sliders,
  Database,
  FileText
} from 'lucide-react';

export const TABS = [
  {
    id: 'execute',
    label: '2 · Execute: Panels',
    colorKey: 'execute',
    icon: Layers,
    description: 'Panel lifecycle, Start, Complete, Hold & History'
  },
  {
    id: 'plan',
    label: '1 · Plan: Targets & Capacity',
    colorKey: 'plan',
    icon: CalendarDays,
    description: 'Monthly target setting and shared load %'
  },
  {
    id: 'daily',
    label: '3 · Daily Status',
    colorKey: 'daily',
    icon: CheckSquare,
    description: 'Daily targets, actuals and KSM sub-assembly tracking'
  },
  {
    id: 'overview',
    label: '4 · Overview & Bottlenecks',
    colorKey: 'overview',
    icon: BarChart3,
    description: 'Live KPI summary, held/overdue queues and bottleneck analysis'
  },
  {
    id: 'reports',
    label: '5 · Production Reports',
    colorKey: 'reports',
    icon: FileText,
    description: 'Actual work reports, date range analytics & Excel CSV exports'
  },
  {
    id: 'simulator',
    label: 'What-If Simulator',
    colorKey: 'simulator',
    icon: Sliders,
    description: 'Standalone capacity scenario simulation & feasibility testing'
  },
  {
    id: 'backup',
    label: 'Backup & Master Data',
    colorKey: 'backup',
    icon: Database,
    description: 'JSON/CSV backup, ID-merge restore & factory master reference'
  }
];

export default function Navigation({ activeTab, onSelectTab }) {
  const getTabClasses = (tab) => {
    const isActive = activeTab === tab.id;
    const base = 'flex items-center space-x-2 px-3.5 py-2 text-xs font-bold rounded-lg border-2 transition-all shadow-sm';

    if (tab.colorKey === 'execute') {
      return `${base} ${isActive ? 'tab-execute-active shadow-blue-200' : 'tab-execute-inactive hover:bg-blue-50'}`;
    }
    if (tab.colorKey === 'plan') {
      return `${base} ${isActive ? 'tab-plan-active shadow-purple-200' : 'tab-plan-inactive hover:bg-purple-50'}`;
    }
    if (tab.colorKey === 'daily') {
      return `${base} ${isActive ? 'tab-daily-active shadow-emerald-200' : 'tab-daily-inactive hover:bg-emerald-50'}`;
    }
    if (tab.colorKey === 'overview') {
      return `${base} ${isActive ? 'tab-overview-active shadow-orange-200' : 'tab-overview-inactive hover:bg-orange-50'}`;
    }
    if (tab.colorKey === 'reports') {
      return `${base} ${isActive ? 'tab-reports-active shadow-cyan-200' : 'tab-reports-inactive hover:bg-cyan-50'}`;
    }
    if (tab.colorKey === 'simulator') {
      return `${base} ${isActive ? 'tab-simulator-active shadow-indigo-200' : 'tab-simulator-inactive hover:bg-indigo-50'}`;
    }
    if (tab.colorKey === 'backup') {
      return `${base} ${isActive ? 'tab-backup-active shadow-slate-200' : 'tab-backup-inactive hover:bg-slate-50'}`;
    }
    return base;
  };

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center space-x-2 py-2.5 overflow-x-auto scrollbar-none">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                id={`nav-tab-${tab.id}`}
                onClick={() => onSelectTab(tab.id)}
                className={getTabClasses(tab)}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="whitespace-nowrap">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
