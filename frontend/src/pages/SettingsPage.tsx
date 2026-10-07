import React from 'react';
import { motion } from 'framer-motion';
import { Settings, Key, Shield, Bell, Globe } from 'lucide-react';

const SettingsPage: React.FC = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex items-center gap-3">
        <Settings className="w-6 h-6 text-red-400" />
        <h1 className="text-2xl font-bold text-red-100">Settings</h1>
      </div>

      <div className="space-y-4">
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <Key className="w-5 h-5 text-red-400" />
            <h3 className="text-sm font-semibold text-red-200">API Configuration</h3>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-red-300/60 mb-1">OpenRouter API Key</label>
              <div className="glass-light rounded-xl p-3">
                <code className="text-xs text-red-400/80 font-mono break-all">
                  sk-or-...abaadb
                </code>
              </div>
            </div>
            <div>
              <label className="block text-xs text-red-300/60 mb-1">AI Model</label>
              <div className="glass-light rounded-xl p-3">
                <span className="text-xs text-red-300">anthropic/claude-3-opus</span>
              </div>
            </div>
          </div>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <Shield className="w-5 h-5 text-red-400" />
            <h3 className="text-sm font-semibold text-red-200">Scan Configuration</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-red-300/80">Max Concurrent Scans</span>
              <span className="text-xs font-mono text-red-300">3</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-red-300/80">Scan Timeout</span>
              <span className="text-xs font-mono text-red-300">300s</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-red-300/80">Nmap Port Range</span>
              <span className="text-xs font-mono text-red-300">Top 1000</span>
            </div>
          </div>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <Globe className="w-5 h-5 text-red-400" />
            <h3 className="text-sm font-semibold text-red-200">Security Tools</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-red-300/80">Shodan API</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${'bg-yellow-900/30 text-yellow-400'}`}>Not Configured</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-red-300/80">NVD API</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${'bg-yellow-900/30 text-yellow-400'}`}>Not Configured</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-red-300/80">Nmap</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${'bg-green-900/30 text-green-400'}`}>Available</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-red-300/80">SQLMap</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${'bg-yellow-900/30 text-yellow-400'}`}>Not Installed</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default SettingsPage;