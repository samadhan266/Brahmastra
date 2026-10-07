import React from 'react';
import { Shield, Activity, History, Settings, Info } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const tabs = [
  { id: 'dashboard', label: 'Dashboard', icon: Activity },
  { id: 'scans', label: 'Scan History', icon: History },
  { id: 'info', label: 'System Info', icon: Info },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange }) => {
  return (
    <aside className="fixed left-0 top-0 h-screen w-20 lg:w-64 z-50 flex flex-col clay"
      style={{ borderRadius: 0, borderRight: '1px solid rgba(220, 20, 60, 0.15)' }}
    >
      <div className="flex items-center gap-3 p-4 lg:p-6 border-b border-red-900/30">
        <div className="w-10 h-10 rounded-xl clay-sm flex items-center justify-center flex-shrink-0">
          <Shield className="w-5 h-5 text-red-400" />
        </div>
        <div className="hidden lg:block">
          <h1 className="text-lg font-bold gradient-text">Brahmastra</h1>
          <p className="text-xs text-red-300/60">AI Pentest System</p>
        </div>
      </div>

      <nav className="flex-1 flex flex-col gap-1 p-3">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-300 ${
                isActive
                  ? 'clay-sm text-red-200'
                  : 'text-red-400/50 hover:text-red-300 hover:glass-light'
              }`}
            >
              <Icon className="w-5 h-5 mx-auto lg:mx-0" />
              <span className="hidden lg:block text-sm font-medium">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-red-900/30 hidden lg:block">
        <p className="text-xs text-red-500/40 text-center">
          v1.0.0 • Autonomous AI
        </p>
      </div>
    </aside>
  );
};

export default Sidebar;