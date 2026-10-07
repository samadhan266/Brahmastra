import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Shield, Cpu, ArrowLeft,
  Globe, Database, Lock, Target, Bug, Eye, Code,
  Crosshair, Network, Radar, Server, RefreshCw, CheckCircle,
  XCircle, AlertTriangle, Activity, Wrench, Play, Trash2,
} from 'lucide-react';
import { brahmastraApi } from '../utils/api';
import { BUGHUNTER_SKILLS, SKILL_CATEGORIES } from '../data/bughunter-skills';
import type { SkillCategory } from '../data/bughunter-skills';

interface SystemInfoProps {
  onBack: () => void;
}

const SystemInfo: React.FC<SystemInfoProps> = ({ onBack }) => {
  const [tab, setTab] = useState<'overview' | 'tools' | 'activity' | 'errors'>('overview');
  const [systemStatus, setSystemStatus] = useState<any>(null);
  const [activity, setActivity] = useState<any>(null);
  const [errors, setErrors] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, activityRes, errorsRes] = await Promise.all([
        brahmastraApi.getSystemStatus(),
        brahmastraApi.getBackgroundActivity(),
        brahmastraApi.getErrors(),
      ]);
      setSystemStatus(statusRes.data);
      setActivity(activityRes.data);
      setErrors(errorsRes.data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleUpdateAll = async () => {
    setUpdating(true);
    try {
      const res = await brahmastraApi.updateAllTools();
      alert('Update results:\n' + res.data.results.map((r: any) =>
        `${r.tool}: ${r.success ? 'OK' : 'FAILED'} — ${r.output}`
      ).join('\n'));
      refresh();
    } catch { alert('Update failed'); }
    setUpdating(false);
  };

  const handleRetry = async (scanId: string) => {
    try { await brahmastraApi.retryError(scanId); refresh(); } catch {}
  };

  const handleDismiss = async (scanId: string) => {
    try { await brahmastraApi.dismissError(scanId); refresh(); } catch {}
  };

  const tabs = [
    { id: 'overview', label: 'OVERVIEW', icon: <Shield className="w-3 h-3" /> },
    { id: 'tools', label: 'TOOLS STATUS', icon: <Wrench className="w-3 h-3" /> },
    { id: 'activity', label: 'ACTIVITY', icon: <Activity className="w-3 h-3" /> },
    { id: 'errors', label: 'ERRORS', icon: <AlertTriangle className="w-3 h-3" /> },
  ] as const;

  const toolCount = systemStatus?.tools_total || 26;
  const installedCount = systemStatus?.tools_installed || 0;
  const tools = systemStatus?.tools || {};
  const activeScans = activity?.total_active || 0;
  const errorList = errors?.errors || [];
  const totalErrors = errors?.total || 0;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-lg neon-btn">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <Shield className="w-6 h-6 text-cyan-400" />
        <h1 className="text-xl font-bold text-cyan-100 glitch-text">SHIELD CONTROL</h1>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-black/40 rounded-lg p-1 border border-red-900/20">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-mono tracking-wider transition-all ${
                    tab === t.id ? 'bg-cyan-900/30 text-cyan-300 border border-cyan-500/30' : 'text-gray-500 hover:text-gray-300'
                  }`}>
            {t.icon} {t.label}
            {t.id === 'errors' && totalErrors > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-red-900/50 text-red-400 text-[9px]">{totalErrors}</span>
            )}
            {t.id === 'activity' && activeScans > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-cyan-900/50 text-cyan-400 text-[9px]">{activeScans}</span>
            )}
          </button>
        ))}
      </div>

      {/* ─── OVERVIEW TAB ─── */}
      {tab === 'overview' && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-black/40 rounded-lg p-3 border border-red-900/20 text-center">
              <p className="text-lg font-bold text-cyan-400 font-mono">{toolCount}</p>
              <p className="text-[10px] font-mono text-gray-500">SECURITY TOOLS</p>
            </div>
            <div className="bg-black/40 rounded-lg p-3 border border-red-900/20 text-center">
              <p className="text-lg font-bold text-orange-400 font-mono">{BUGHUNTER_SKILLS.length}</p>
              <p className="text-[10px] font-mono text-gray-500">TECHNIQUES</p>
            </div>
            <div className="bg-black/40 rounded-lg p-3 border border-red-900/20 text-center">
              <p className="text-lg font-bold text-green-400 font-mono">{Object.keys(SKILL_CATEGORIES).length}</p>
              <p className="text-[10px] font-mono text-gray-500">CATEGORIES</p>
            </div>
            <div className="bg-black/40 rounded-lg p-3 border border-red-900/20 text-center">
              <p className="text-lg font-bold text-purple-400 font-mono">{installedCount}/{toolCount}</p>
              <p className="text-[10px] font-mono text-gray-500">INSTALLED</p>
            </div>
          </div>

          {/* Quick actions */}
          <div className="cyber-card rounded-xl p-5">
            <p className="text-[10px] font-mono text-cyan-400/60 uppercase tracking-wider flex items-center gap-2 mb-3">
              <Wrench className="w-3 h-3" /> QUICK ACTIONS
            </p>
            <div className="grid grid-cols-3 gap-3">
              <button onClick={handleUpdateAll} disabled={updating}
                      className="bg-black/40 rounded-lg p-3 border border-cyan-900/20 hover:bg-cyan-900/10 transition-all text-left disabled:opacity-50">
                <RefreshCw className={`w-4 h-4 text-cyan-400 mb-1 ${updating ? 'animate-spin' : ''}`} />
                <p className="text-xs font-mono text-gray-300">{updating ? 'Updating...' : 'Update All Tools'}</p>
                <p className="text-[9px] font-mono text-gray-600">Pull latest versions</p>
              </button>
              <button onClick={refresh}
                      className="bg-black/40 rounded-lg p-3 border border-green-900/20 hover:bg-green-900/10 transition-all text-left">
                <Activity className="w-4 h-4 text-green-400 mb-1" />
                <p className="text-xs font-mono text-gray-300">Refresh Status</p>
                <p className="text-[9px] font-mono text-gray-600">Check all systems</p>
              </button>
              <button onClick={() => setTab('errors')}
                      className="bg-black/40 rounded-lg p-3 border border-red-900/20 hover:bg-red-900/10 transition-all text-left">
                <AlertTriangle className="w-4 h-4 text-red-400 mb-1" />
                <p className="text-xs font-mono text-gray-300">View Errors ({totalErrors})</p>
                <p className="text-[9px] font-mono text-gray-600">Resolve failed scans</p>
              </button>
            </div>
          </div>

          {/* Pentester AI Techniques */}
          <div className="cyber-card rounded-xl p-5">
            <p className="text-[10px] font-mono text-cyan-400/60 uppercase tracking-wider flex items-center gap-2 mb-3">
              <Bug className="w-3 h-3" /> PENTESTER AI ({BUGHUNTER_SKILLS.length})
            </p>
            <div className="space-y-4">
              {(Object.keys(SKILL_CATEGORIES) as SkillCategory[]).map(cat => {
                const meta = SKILL_CATEGORIES[cat];
                const catSkills = BUGHUNTER_SKILLS.filter(s => s.category === cat);
                return (
                  <div key={cat}>
                    <p className="text-xs font-mono text-gray-400 mb-2 flex items-center gap-2">
                      <span>{meta.icon}</span>
                      <span className="text-gray-300">{meta.label}</span>
                      <span className="text-gray-600">({catSkills.length})</span>
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {catSkills.map(skill => (
                        <div key={skill.id}
                             className="bg-black/40 rounded-lg p-3 border border-red-900/20 hover:border-red-500/20 transition-all">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-mono font-bold text-gray-200">{skill.name}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono border ${
                              skill.difficulty === 'beginner' ? 'text-green-400 border-green-500/30' :
                              skill.difficulty === 'intermediate' ? 'text-yellow-400 border-yellow-500/30' :
                              'text-red-400 border-red-500/30'
                            }`}>
                              {skill.difficulty[0].toUpperCase()}
                            </span>
                          </div>
                          <p className="text-[10px] font-mono text-gray-500 leading-relaxed">{skill.description}</p>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {skill.tools.map(t => (
                              <span key={t} className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-black/40 border border-gray-800 text-gray-500">{t}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── TOOLS STATUS TAB ─── */}
      {tab === 'tools' && (
        <div className="space-y-4">
          <div className="cyber-card rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] font-mono text-cyan-400/60 uppercase tracking-wider flex items-center gap-2">
                <Wrench className="w-3 h-3" /> TOOL INSTALLATION STATUS ({installedCount}/{toolCount})
              </p>
              <button onClick={handleUpdateAll} disabled={updating}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-cyan-900/30 border border-cyan-500/30 text-cyan-300 text-[10px] font-mono hover:bg-cyan-900/50 transition-all disabled:opacity-50">
                <RefreshCw className={`w-3 h-3 ${updating ? 'animate-spin' : ''}`} />
                {updating ? 'UPDATING...' : 'UPDATE ALL'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {Object.entries(tools).sort(([,a]: any, [,b]: any) => (b.installed ? 1 : 0) - (a.installed ? 1 : 0)).map(([name, info]: any) => (
                <div key={name}
                     className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                       info.installed
                         ? 'bg-black/40 border-green-900/20 hover:border-green-500/20'
                         : 'bg-black/40 border-red-900/20 hover:border-red-500/20'
                     }`}>
                  {info.installed ? (
                    <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-mono font-bold text-gray-200 truncate">{name}</p>
                    <p className="text-[9px] font-mono text-gray-600 truncate">{info.path}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── ACTIVITY TAB ─── */}
      {tab === 'activity' && (
        <div className="space-y-4">
          <div className="cyber-card rounded-xl p-5">
            <p className="text-[10px] font-mono text-cyan-400/60 uppercase tracking-wider flex items-center gap-2 mb-3">
              <Activity className="w-3 h-3" /> BACKGROUND ACTIVITY
            </p>
            {activeScans === 0 ? (
              <div className="text-center py-8">
                <Activity className="w-10 h-10 text-gray-700 mx-auto mb-3" />
                <p className="text-sm font-mono text-gray-500">No active scans running</p>
                <p className="text-[10px] font-mono text-gray-600 mt-1">Launch a scan from the dashboard</p>
              </div>
            ) : (
              <div className="space-y-2">
                {activity?.active_scans?.map((scan: any) => (
                  <div key={scan.scan_id}
                       className="flex items-center justify-between p-3 rounded-lg bg-black/40 border border-cyan-900/20">
                    <div className="flex items-center gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full ${scan.running ? 'bg-cyan-400 animate-pulse' : 'bg-gray-600'}`} />
                      <div>
                        <p className="text-xs font-mono text-gray-300">{scan.scan_id.slice(0, 8)}...</p>
                        <p className="text-[9px] font-mono text-gray-600">{scan.running ? 'Running' : 'Done'}</p>
                      </div>
                    </div>
                    {scan.running && (
                      <div className="w-20 bg-black/60 rounded-full h-1.5">
                        <div className="h-full rounded-full bg-gradient-to-r from-cyan-600 to-cyan-400 animate-pulse" style={{ width: '60%' }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── ERRORS TAB ─── */}
      {tab === 'errors' && (
        <div className="space-y-4">
          <div className="cyber-card rounded-xl p-5">
            <p className="text-[10px] font-mono text-cyan-400/60 uppercase tracking-wider flex items-center gap-2 mb-3">
              <AlertTriangle className="w-3 h-3" /> FAILED SCANS & ERROR RESOLUTION ({totalErrors})
            </p>
            {totalErrors === 0 ? (
              <div className="text-center py-8">
                <CheckCircle className="w-10 h-10 text-green-700 mx-auto mb-3" />
                <p className="text-sm font-mono text-gray-500">No errors found</p>
                <p className="text-[10px] font-mono text-gray-600 mt-1">All scans completed successfully</p>
              </div>
            ) : (
              <div className="space-y-2">
                {errorList.map((err: any) => (
                  <div key={err.scan_id}
                       className="p-4 rounded-lg bg-black/40 border border-red-900/20">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Target className="w-4 h-4 text-red-400" />
                        <span className="text-xs font-mono font-bold text-gray-200">{err.target}</span>
                      </div>
                      <span className="text-[9px] font-mono text-gray-600">{err.at ? new Date(err.at).toLocaleString() : ''}</span>
                    </div>
                    <p className="text-[10px] font-mono text-red-400/80 mb-3 bg-red-900/10 rounded p-2">{err.error}</p>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleRetry(err.scan_id)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded bg-cyan-900/30 border border-cyan-500/30 text-cyan-300 text-[10px] font-mono hover:bg-cyan-900/50 transition-all">
                        <Play className="w-3 h-3" /> RETRY
                      </button>
                      <button onClick={() => handleDismiss(err.scan_id)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded bg-black/40 border border-gray-700 text-gray-400 text-[10px] font-mono hover:bg-black/60 transition-all">
                        <Trash2 className="w-3 h-3" /> DISMISS
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default SystemInfo;
