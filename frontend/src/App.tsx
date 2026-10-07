import React, { useState } from 'react';
import { Toaster } from 'react-hot-toast';
import { ScanProvider } from './context/ScanContext';
import { WebSocketProvider } from './context/WebSocketContext';
import Dashboard from './pages/Dashboard';
import ScanHistory from './pages/ScanHistory';
import SystemInfo from './pages/SystemInfo';
import LLMChat from './pages/LLMChat';
import PasswordGate from './components/PasswordGate';
import { LayoutDashboard, History, Server, Sparkles } from 'lucide-react';

const App: React.FC = () => {
  const [unlocked, setUnlocked] = useState(false);
  const [page, setPage] = useState('dashboard');

  if (!unlocked) {
    return <PasswordGate onUnlock={() => setUnlocked(true)} />;
  }

  return (
    <ScanProvider>
      <WebSocketProvider>
        <div className="min-h-screen bg-[#0a0a0a]">
          <div className="scanline" />

          {page !== 'chat' && (
          <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1
                          glass-dark rounded-full px-2 py-1.5 shadow-2xl border border-red-900/20">
            {[
              { id: 'dashboard', label: 'PENTESTER AI', icon: LayoutDashboard },
              { id: 'chat', label: 'VAANI', icon: Sparkles },
              { id: 'history', label: 'HISTORY', icon: History },
              { id: 'info', label: 'INFO', icon: Server },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setPage(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[10px] font-mono tracking-wider transition-all ${
                    page === tab.id
                      ? 'bg-red-900/40 text-red-200 neon-border'
                      : 'text-gray-500 hover:text-gray-300 hover:bg-red-900/10'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
          )}

          {/* Dashboard always mounted — use visibility to persist terminal state */}
          <div style={{ display: page === 'dashboard' ? 'block' : 'none' }}>
            <Dashboard />
          </div>

          {/* History and Info render on top when active */}
          {page === 'history' && (
            <div className="p-6 max-w-4xl mx-auto pt-12">
              <ScanHistory onBack={() => setPage('dashboard')} />
            </div>
          )}
          {page === 'info' && (
            <div className="p-6 max-w-4xl mx-auto pt-12">
              <SystemInfo onBack={() => setPage('dashboard')} />
            </div>
          )}

          {/* LLM Chat renders fullscreen */}
          {page === 'chat' && <LLMChat onBack={() => setPage('dashboard')} />}
        </div>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'rgba(10, 10, 10, 0.95)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255, 0, 60, 0.2)',
              color: '#e0e0e0',
              borderRadius: '8px',
              fontSize: '12px',
              fontFamily: 'JetBrains Mono, monospace',
            },
          }}
        />
      </WebSocketProvider>
    </ScanProvider>
  );
};

export default App;
