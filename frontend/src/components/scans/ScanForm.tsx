import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Target, Zap, Brain, ArrowRight, Loader2, Shield, Terminal as TerminalIcon } from 'lucide-react';
import { useScanContext } from '../../context/ScanContext';

interface ScanFormProps {
  onScanStart: (scanId: string) => void;
}

const toolGroups = {
  recon_agent: [
    { id: 'subfinder', name: 'Subfinder', desc: 'Passive subdomain discovery' },
    { id: 'assetfinder', name: 'Assetfinder', desc: 'Asset discovery' },
    { id: 'Findomain', name: 'Findomain', desc: 'Fast subdomain enumeration' },
    { id: 'gau', name: 'GAU', desc: 'Get all URLs' },
    { id: 'waybackurls', name: 'WaybackURLs', desc: 'WayMachine URLs' },
    { id: 'ParamSpider', name: 'ParamSpider', desc: 'Parameter discovery' },
    { id: 'chaos-client', name: 'Chaos', desc: 'Chaos dataset' },
    { id: 'LinkFinder', name: 'LinkFinder', desc: 'JS endpoint extractor' },
    { id: 'SecretFinder', name: 'SecretFinder', desc: 'Secret scanner' },
  ],
  scanner_agent: [
    { id: 'nmap', name: 'Nmap', desc: 'Port scanner + service detection' },
    { id: 'RustScan', name: 'RustScan', desc: 'Fast port scanner' },
    { id: 'masscan', name: 'Masscan', desc: 'Mass IP scanner' },
    { id: 'gobuster', name: 'Gobuster', desc: 'Dir/DNS brute-force' },
    { id: 'dirsearch', name: 'Dirsearch', desc: 'Web path scanner' },
    { id: 'feroxbuster', name: 'Feroxbuster', desc: 'Recursive dir enum' },
    { id: 'WhatWeb', name: 'WhatWeb', desc: 'Web tech fingerprinting' },
  ],
  vuln_agent: [
    { id: 'nikto', name: 'Nikto', desc: 'Web server scanner' },
    { id: 'nuclei', name: 'Nuclei', desc: 'Template-based vuln scanner' },
    { id: 'sqlmap', name: 'SQLMap', desc: 'SQL injection tester' },
    { id: 'XSStrike', name: 'XSStrike', desc: 'XSS scanner' },
    { id: 'dalfox', name: 'Dalfox', desc: 'XSS analyzer' },
    { id: 'zaproxy', name: 'ZAP', desc: 'OWASP ZAP proxy' },
  ],
  cloud_agent: [
    { id: 'deep_scan', name: 'Deep Scan', desc: 'Full port & vuln scan on cloud' },
    { id: 'port_scan', name: 'Port Scan', desc: 'Quick port scan on cloud' },
    { id: 'vuln_scan', name: 'Vuln Scan', desc: 'Vulnerability scan on cloud' },
    { id: 'ai_analysis', name: 'AI Analysis', desc: 'LLM-based result analysis' },
  ],
};

type ToolSelection = Record<string, string[]>;

const ScanForm: React.FC<ScanFormProps> = ({ onScanStart }) => {
  const { createAndStartScan, creating } = useScanContext();
  const [target, setTarget] = useState('');
  const [mode, setMode] = useState<'autonomous' | 'semi_autonomous'>('autonomous');
  const [showToolConfig, setShowToolConfig] = useState(false);
  const [selectedTools, setSelectedTools] = useState<ToolSelection>({});

  const toggleTool = (agent: string, toolId: string) => {
    setSelectedTools(prev => {
      const current = prev[agent] || [];
      return {
        ...prev,
        [agent]: current.includes(toolId)
          ? current.filter(t => t !== toolId)
          : [...current, toolId]
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target.trim()) return;

    const toolsForMode = mode === 'semi_autonomous' ? selectedTools : {};
    const scanId = await createAndStartScan({
      target: target.trim(),
      mode,
      tools: toolsForMode
    });
    if (scanId) {
      onScanStart(scanId);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="cyber-card rounded-xl p-6 space-y-5">
      <div className="flex items-center gap-3 border-b border-red-900/20 pb-3">
        <div className="w-10 h-10 rounded-lg bg-red-900/30 flex items-center justify-center neon-border">
          <Shield className="w-5 h-5 text-red-400" />
        </div>
        <div>
          <h2 className="text-base font-bold text-red-200">New Security Scan</h2>
          <p className="text-sm text-red-400/50">Configure and launch penetration test</p>
        </div>
      </div>

      <div>
        <label className="block text-sm font-mono text-cyan-400/80 mb-2">{'TARGET >'}</label>
        <div className="relative">
          <input
            type="text"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="example.com, 192.168.1.1 (comma-separated for multi-target)"
            className="w-full px-4 py-3 pl-10 neon-input rounded-lg text-base font-mono
                       placeholder-gray-600 disabled:opacity-50"
            disabled={creating}
          />
          <Target className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500/50" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-mono text-cyan-400/80 mb-2">{'MODE >'}</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => { setMode('autonomous'); setShowToolConfig(false); }}
            className={`p-4 rounded-lg border text-left transition-all ${
              mode === 'autonomous'
                ? 'bg-red-900/20 border-red-500/40 neon-border'
                : 'bg-black/40 border-red-900/20 hover:border-red-700/30'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Zap className={`w-5 h-5 ${mode === 'autonomous' ? 'text-red-300' : 'text-red-500/50'}`} />
              <span className={`text-sm font-bold ${mode === 'autonomous' ? 'text-red-200' : 'text-red-400/60'}`}>
                AUTONOMOUS
              </span>
            </div>
            <p className="text-xs text-red-400/40 mt-1.5">WHOIS → NSLOOKUP → all JSON tools</p>
          </button>

          <button
            type="button"
            onClick={() => setMode('semi_autonomous')}
            className={`p-4 rounded-lg border text-left transition-all ${
              mode === 'semi_autonomous'
                ? 'bg-red-900/20 border-red-500/40 neon-border'
                : 'bg-black/40 border-red-900/20 hover:border-red-700/30'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Brain className={`w-5 h-5 ${mode === 'semi_autonomous' ? 'text-red-300' : 'text-red-500/50'}`} />
              <span className={`text-sm font-bold ${mode === 'semi_autonomous' ? 'text-red-200' : 'text-red-400/60'}`}>
                SEMI-AUTO
              </span>
            </div>
            <p className="text-xs text-red-400/40 mt-1.5">Pick tools + AI command search</p>
          </button>
        </div>
      </div>

      {mode === 'semi_autonomous' && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-3">
          <button
            type="button"
            onClick={() => setShowToolConfig(!showToolConfig)}
            className="w-full px-4 py-2.5 rounded-lg bg-black/40 border border-red-900/30 text-sm
                       text-red-300/80 hover:border-red-700/50 transition-all flex items-center justify-between"
          >
            <span className="font-mono font-bold">TOOL SELECTION</span>
            <span className="text-xs text-red-400/50">{showToolConfig ? '▲' : '▼'}</span>
          </button>

          {showToolConfig && (
            <div className="space-y-3 max-h-[280px] overflow-y-auto scrollbar-custom">
              {Object.entries(toolGroups).map(([agent, tools]) => (
                <div key={agent} className="bg-black/40 rounded-lg p-3 border border-red-900/20">
                  <p className="text-xs font-mono text-cyan-400/60 mb-2 uppercase tracking-wider">
                    {agent.replace('_', ' ')}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {tools.map(tool => {
                      const isSelected = (selectedTools[agent] || []).includes(tool.id);
                      return (
                        <button
                          key={tool.id}
                          type="button"
                          onClick={() => toggleTool(agent, tool.id)}
                          className={`px-3 py-1.5 rounded text-xs font-mono border transition-all ${
                            isSelected
                              ? 'bg-red-900/30 border-red-500/40 text-red-200 neon-border'
                              : 'bg-black/60 border-red-900/20 text-red-400/50 hover:text-red-300'
                          }`}
                          title={tool.desc}
                        >
                          {tool.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      <button
        type="submit"
        disabled={creating || !target.trim()}
        className="w-full py-3 rounded-lg neon-btn text-base font-bold flex items-center justify-center gap-2
                   disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {creating ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="font-mono">INITIALIZING...</span>
          </>
        ) : (
          <>
            <TerminalIcon className="w-5 h-5" />
            <span className="font-mono">EXECUTE SCAN</span>
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>
    </form>
  );
};

export default ScanForm;