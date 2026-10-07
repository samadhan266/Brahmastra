import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bug, Search, Play, Square, ChevronDown, Clock, AlertTriangle,
  Terminal as TerminalIcon, Copy, Check, X, Filter, Zap, Shield,
  Target, Wifi, WifiOff, Trash2, ArrowLeft, CheckSquare,
} from 'lucide-react';
import { BUGHUNTER_SKILLS, SKILL_CATEGORIES } from '../data/bughunter-skills';
import type { BugHunterSkill, SkillCategory } from '../data/bughunter-skills';
import { brahmastraApi } from '../utils/api';

/* ── Constants ── */
const WS_PROTO = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_HOST = window.location.host;

const difficultyColors: Record<string, string> = {
  beginner: 'text-green-400 border-green-500/30 bg-green-900/10',
  intermediate: 'text-yellow-400 border-yellow-500/30 bg-yellow-900/10',
  advanced: 'text-red-400 border-red-500/30 bg-red-900/10',
};

const catAccentBorder: Record<string, string> = {
  blue: 'border-blue-500/30', cyan: 'border-cyan-500/30', purple: 'border-purple-500/30',
  orange: 'border-orange-500/30', red: 'border-red-500/30', green: 'border-green-500/30',
  sky: 'border-sky-500/30',
};
const catAccentText: Record<string, string> = {
  blue: 'text-blue-400', cyan: 'text-cyan-400', purple: 'text-purple-400',
  orange: 'text-orange-400', red: 'text-red-400', green: 'text-green-400',
  sky: 'text-sky-400',
};
const catAccentBg: Record<string, string> = {
  blue: 'bg-blue-900/20', cyan: 'bg-cyan-900/20', purple: 'bg-purple-900/20',
  orange: 'bg-orange-900/20', red: 'bg-red-900/20', green: 'bg-green-900/20',
  sky: 'bg-sky-900/20',
};

/* ── Terminal line type ── */
interface TerminalLine {
  id: number;
  text: string;
  stream: 'stdout' | 'stderr' | 'system' | 'command';
  timestamp: number;
}

/* ── Props ── */
interface BugHunterSkillsProps {
  onBack: () => void;
}

/* ══════════════════════════════════════════════════
   COMPONENT
   ══════════════════════════════════════════════════ */
const BugHunterSkills: React.FC<BugHunterSkillsProps> = ({ onBack }) => {
  /* ── Selection / filter state ── */
  const [expandedCats, setExpandedCats] = useState<Set<SkillCategory>>(
    () => new Set(Object.keys(SKILL_CATEGORIES) as SkillCategory[]),
  );
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [target, setTarget] = useState('');

  /* ── Terminal state ── */
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [connected, setConnected] = useState(false);
  const [currentExecId, setCurrentExecId] = useState<string | null>(null);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const idRef = useRef(0);

  /* ── Auto-scroll terminal ── */
  useEffect(() => {
    if (terminalRef.current)
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [terminalLines]);

  /* ── Cleanup on unmount ── */
  useEffect(() => {
    return () => { wsRef.current?.close(); };
  }, []);

  /* ── Filtered + grouped skills ── */
  const filteredSkills = useMemo(() => {
    if (!searchQuery) return BUGHUNTER_SKILLS;
    const q = searchQuery.toLowerCase();
    return BUGHUNTER_SKILLS.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.tools.some(t => t.toLowerCase().includes(q)) ||
      s.tags.some(t => t.toLowerCase().includes(q)),
    );
  }, [searchQuery]);

  const skillsByCategory = useMemo(() => {
    const map: Record<string, BugHunterSkill[]> = {};
    for (const cat of Object.keys(SKILL_CATEGORIES)) {
      map[cat] = filteredSkills.filter(s => s.category === cat);
    }
    return map;
  }, [filteredSkills]);

  const selectedCount = selectedSkills.size;
  const statsStr = `${filteredSkills.length}/${BUGHUNTER_SKILLS.length} SKILLS`;

  /* ── Terminal helpers ── */
  const addLine = useCallback((text: string, stream: TerminalLine['stream'] = 'stdout') => {
    setTerminalLines(p => [...p, { id: idRef.current++, text, stream, timestamp: Date.now() }]);
  }, []);

  const clearTerminal = useCallback(() => {
    setTerminalLines([]);
    idRef.current = 0;
  }, []);

  const handleCopyCommand = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(cmd);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  /* ── WebSocket connection ── */
  const connectWs = useCallback((execId: string) => {
    wsRef.current?.close();
    const ws = new WebSocket(`${WS_PROTO}//${WS_HOST}/api/v1/bughunter/ws/${execId}`);
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'terminal' && msg.data?.trim()) {
          const stream: TerminalLine['stream'] =
            msg.stream === 'stderr' ? 'stderr'
            : msg.data.startsWith('[BRAHMASTRA]') ? 'system'
            : msg.data.startsWith('$') ? 'command'
            : msg.data.startsWith('[✓]') || msg.data.startsWith('[✗]') ? 'system'
            : 'stdout';
          setTerminalLines(p => [...p, { id: idRef.current++, text: msg.data, stream, timestamp: msg.timestamp || Date.now() }]);
        } else if (msg.type === 'scan_update' && msg.status === 'completed') {
          setIsRunning(false);
          setCurrentExecId(null);
        }
      } catch {}
    };
    ws.onclose = () => { setConnected(false); };
    ws.onerror = () => { setConnected(false); };
  }, []);

  /* ── Run selected skills (batch) ── */
  const handleRunSelected = useCallback(async () => {
    if (!target.trim() || selectedSkills.size === 0) return;
    clearTerminal();
    setIsRunning(true);

    const cmds: string[] = [];
    const toolNames: string[] = [];
    selectedSkills.forEach(id => {
      const sk = BUGHUNTER_SKILLS.find(s => s.id === id);
      if (sk) {
        cmds.push(...sk.commands);
        sk.tools.forEach(t => { if (!toolNames.includes(t)) toolNames.push(t); });
      }
    });

    try {
      const res = await brahmastraApi.executeSkill({
        skill_id: `batch-${Date.now()}`,
        skill_name: `${selectedSkills.size} skills`,
        target: target.trim(),
        commands: cmds,
        tools: toolNames,
        timeout: 300,
      });
      const execId = res.data.exec_id;
      setCurrentExecId(execId);
      connectWs(execId);

      addLine(`[BRAHMASTRA] Batch: ${selectedSkills.size} skills`, 'system');
      addLine(`[BRAHMASTRA] Target: ${target}`, 'system');
      addLine(`[BRAHMASTRA] Execution ID: ${execId}`, 'system');
      addLine(`[BRAHMASTRA] Tools: ${toolNames.join(', ')}`, 'system');
      addLine('', 'stdout');
      addLine('[*] Connected — streaming live output...', 'system');
    } catch (err: any) {
      setIsRunning(false);
      addLine(`[✗] ${err?.response?.data?.detail || err?.message || 'error'}`, 'stderr');
    }
  }, [target, selectedSkills, clearTerminal, addLine, connectWs]);

  /* ── Stop ── */
  const handleStop = useCallback(async () => {
    if (currentExecId) {
      try { await brahmastraApi.cancelSkillExecution(currentExecId); } catch {}
    }
    wsRef.current?.close();
    setIsRunning(false);
    setCurrentExecId(null);
    setConnected(false);
    addLine('[!] Execution stopped by user', 'stderr');
  }, [currentExecId, addLine]);

  /* ── Category collapse / expand ── */
  const toggleCategory = (cat: SkillCategory) => {
    setExpandedCats(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  /* ── Skill checkbox toggle ── */
  const toggleSkill = (id: string) => {
    setSelectedSkills(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  /* ── Select-all in a category (visible skils only) ── */
  const toggleAllInCategory = (cat: SkillCategory) => {
    const skills = skillsByCategory[cat];
    if (!skills || skills.length === 0) return;
    const allSelected = skills.every(s => selectedSkills.has(s.id));
    setSelectedSkills(prev => {
      const next = new Set(prev);
      skills.forEach(s => {
        if (allSelected) next.delete(s.id); else next.add(s.id);
      });
      return next;
    });
  };

  /* ── Clear selection ── */
  const clearSelection = () => setSelectedSkills(new Set());

  /* ── Render ── */
  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0a] crt-effect">
      <div className="scanline" />

      {/* ═══════════════ HEADER ═══════════════ */}
      <header className="flex items-center justify-between px-6 py-2.5 border-b border-red-900/30 bg-black/70 flex-shrink-0 data-stream">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 rounded-lg neon-btn">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="relative group">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-900/40 to-black flex items-center justify-center border border-orange-500/30"
                 style={{ boxShadow: '0 0 15px rgba(255,100,0,0.15)' }}>
              <Bug className="w-5 h-5 text-orange-400" />
            </div>
            {isRunning && (
              <div className="absolute -top-1 -right-1 w-3 h-3">
                <div className="w-full h-full rounded-full bg-orange-500 animate-ping opacity-75" />
                <div className="absolute inset-0 rounded-full bg-orange-500" />
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold tracking-wider">
                <span className="text-orange-400 glitch-text">BUGHUNTER</span>
              </h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono border border-orange-500/30 text-orange-400 bg-orange-900/20 tracking-widest">SKILLS</span>
              <span className="text-[10px] font-mono text-gray-600 border border-gray-800 px-2 py-0.5 rounded">{statsStr}</span>
            </div>
            <p className="text-[11px] text-gray-500 font-mono tracking-wider flex items-center gap-2">
              <Zap className="w-3 h-3 text-orange-500/50" />
              BATCH SKILL EXECUTOR
              <span className="text-gray-700">|</span>
              <Shield className="w-3 h-3 text-cyan-500/50" />
              <span className="text-cyan-500/50">{Object.keys(SKILL_CATEGORIES).length} CATEGORIES</span>
              <span className="text-gray-700">|</span>
              <Target className="w-3 h-3 text-red-500/50" />
              <span className="text-red-500/50">{BUGHUNTER_SKILLS.length} SKILLS</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isRunning && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-orange-500/30 bg-orange-900/10">
              <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
              <span className="text-xs font-mono text-orange-400">RUNNING</span>
            </div>
          )}
          {connected ? (
            <div className="flex items-center gap-1.5 text-xs font-mono text-green-400">
              <Wifi className="w-3.5 h-3.5 animate-pulse" /> LIVE
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs font-mono text-gray-600">
              <WifiOff className="w-3.5 h-3.5" /> OFFLINE
            </div>
          )}
          {isRunning && (
            <button onClick={handleStop}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-900/20 border border-red-500/30 text-red-400 text-xs font-mono hover:bg-red-900/30 transition-all">
              <Square className="w-3 h-3" /> STOP
            </button>
          )}
        </div>
      </header>

      {isRunning && <div className="progress-bar flex-shrink-0" />}

      {/* ═══════════════ MAIN LAYOUT ═══════════════ */}
      <div className="flex-1 flex overflow-hidden">

        {/* ─── LEFT PANEL: SKILL SELECTION ─── */}
        <div className="w-[420px] min-w-[380px] flex flex-col border-r border-red-900/10 bg-black/20 flex-shrink-0">

          {/* Target Input */}
          <div className="p-4 border-b border-red-900/10">
            <label className="block text-xs font-mono text-cyan-400/80 mb-1.5">{'TARGET >'}</label>
            <div className="relative">
              <input type="text" value={target} onChange={e => setTarget(e.target.value)}
                     placeholder="example.com or 192.168.1.1"
                     className="w-full px-3 py-2.5 pl-9 neon-input rounded-lg text-sm font-mono placeholder-gray-600" />
              <Target className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-red-500/50" />
            </div>
          </div>

          {/* Search */}
          <div className="px-4 pt-3 pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
              <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                     placeholder="Search skills, tools, tags..."
                     className="w-full pl-9 pr-8 py-2 neon-input rounded-lg text-xs font-mono placeholder-gray-600" />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-red-900/20">
                  <X className="w-3 h-3 text-gray-500" />
                </button>
              )}
            </div>
          </div>

          {/* Run bar — always visible */}
          <div className="px-4 pb-3">
            <button
              onClick={handleRunSelected}
              disabled={isRunning || !target.trim() || selectedSkills.size === 0}
              className="w-full py-2.5 rounded-lg text-sm font-mono font-bold flex items-center justify-center gap-2 transition-all
                         bg-gradient-to-r from-orange-900/30 to-red-900/10 border border-orange-500/40 text-orange-300
                         hover:border-orange-400/60 hover:shadow-lg hover:shadow-orange-900/20
                         disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {isRunning ? (
                <><div className="w-4 h-4 border-2 border-orange-400/50 border-t-transparent rounded-full animate-spin" /> RUNNING...</>
              ) : (
                <><Play className="w-4 h-4" /> EXECUTE {selectedSkills.size} SKILL{selectedSkills.size !== 1 ? 'S' : ''}</>
              )}
            </button>
            <div className="flex items-center justify-between mt-2 text-[10px] font-mono">
              <span className="text-cyan-400/60">{selectedSkills.size} SELECTED</span>
              {selectedSkills.size > 0 && (
                <button onClick={clearSelection} className="text-red-400/60 hover:text-red-400 transition-colors">
                  CLEAR ALL
                </button>
              )}
            </div>
          </div>

          {/* ─── CATEGORY ACCORDION ─── */}
          <div className="flex-1 overflow-y-auto scrollbar-custom px-4 pb-4 space-y-2">
            {(Object.keys(SKILL_CATEGORIES) as SkillCategory[]).map(cat => {
              const meta = SKILL_CATEGORIES[cat];
              const skills = skillsByCategory[cat];
              const isExpanded = expandedCats.has(cat);
              const catSelected = skills?.every(s => selectedSkills.has(s.id)) ?? false;
              const catPartial = skills?.some(s => selectedSkills.has(s.id)) && !catSelected;

              if (!skills || skills.length === 0) return null;   // hidden by search

              return (
                <div key={cat}
                     className={`rounded-xl border ${catAccentBorder[meta.color]} bg-black/40 overflow-hidden`}>
                  {/* ── Category header ── */}
                  <div
                    onClick={() => toggleCategory(cat)}
                    className={`flex items-center justify-between px-3.5 py-2.5 cursor-pointer select-none
                                transition-colors hover:${catAccentBg[meta.color]}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        onClick={e => { e.stopPropagation(); toggleAllInCategory(cat); }}
                        className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors cursor-pointer
                                    ${catSelected
                                      ? `bg-${meta.color}-500 border-${meta.color}-500`
                                      : catPartial
                                        ? `border-${meta.color}-500/60 bg-${meta.color}-500/20`
                                        : 'border-gray-700 hover:border-gray-500'}`}
                      >
                        {(catSelected || catPartial) && (
                          <Check className={`w-3 h-3 ${catSelected ? 'text-white' : catAccentText[meta.color]}`} />
                        )}
                      </div>
                      <span className="text-base flex-shrink-0">{meta.icon}</span>
                      <span className={`text-xs font-mono font-bold tracking-wider ${catAccentText[meta.color]}`}>
                        {meta.label}
                      </span>
                      <span className="text-[10px] font-mono text-gray-600 flex-shrink-0">({skills.length})</span>
                    </div>
                    <ChevronDown className={`w-3.5 h-3.5 text-gray-500 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                  </div>

                  {/* ── Skills list ── */}
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        key="body"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-red-900/10" />
                        {skills.map(skill => {
                          const isSel = selectedSkills.has(skill.id);
                          return (
                            <div
                              key={skill.id}
                              className={`flex items-start gap-2.5 px-3.5 py-2.5 transition-colors cursor-pointer
                                          ${isSel ? catAccentBg[meta.color] : 'hover:bg-red-900/5'}`}
                              onClick={() => toggleSkill(skill.id)}
                            >
                              {/* Checkbox */}
                              <div className="flex-shrink-0 mt-0.5">
                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors
                                                ${isSel
                                                  ? `bg-${meta.color}-500 border-${meta.color}-500`
                                                  : 'border-gray-700 hover:border-gray-500'}`}
                                >
                                  {isSel && <Check className="w-3 h-3 text-white" />}
                                </div>
                              </div>
                              {/* Info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className={`text-xs font-mono font-bold ${isSel ? catAccentText[meta.color] : 'text-gray-200'}`}>
                                    {skill.name}
                                  </span>
                                  <span className={`px-1 py-0.5 rounded text-[8px] font-mono border leading-none ${difficultyColors[skill.difficulty]}`}>
                                    {skill.difficulty.toUpperCase().slice(0, 4)}
                                  </span>
                                </div>
                                <p className="text-[10px] font-mono text-gray-500 leading-relaxed mt-0.5 line-clamp-1">
                                  {skill.description}
                                </p>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  <span className="flex items-center gap-0.5 text-[9px] font-mono text-gray-600">
                                    <Clock className="w-2.5 h-2.5" /> {skill.estimatedTime}
                                  </span>
                                  <span className="text-[9px] font-mono text-gray-700">{skill.tools.length} tools</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}

            {filteredSkills.length === 0 && (
              <div className="text-center py-12">
                <Filter className="w-8 h-8 text-gray-600 mx-auto mb-3" />
                <p className="text-sm font-mono text-gray-500">No skills match</p>
              </div>
            )}
          </div>
        </div>

        {/* ─── RIGHT PANEL: TERMINAL ─── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="terminal-window rounded-none flex flex-col h-full">

            {/* Terminal Header */}
            <div className="flex items-center justify-between px-5 py-3 bg-black/80 border-b border-green-900/40">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <TerminalIcon className={`w-5 h-5 ${isRunning ? 'text-orange-400' : 'text-green-400'}`} />
                  {isRunning && <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-orange-400 animate-ping" />}
                </div>
                <span className="text-sm font-mono text-green-400/80">
                  <span className="text-green-400">root</span>
                  <span className="text-gray-500">@</span>
                  <span className="text-orange-400">bughunter</span>
                  <span className="text-gray-500">:</span>
                  <span className="text-blue-400">~</span>
                  <span className="text-gray-500">$</span>
                </span>
              </div>
              <div className="flex items-center gap-3">
                {isRunning && (
                  <button onClick={handleStop}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-900/20 border border-red-500/30 text-red-400 text-xs font-mono hover:bg-red-900/30 transition-all">
                    <Square className="w-3 h-3" /> STOP
                  </button>
                )}
                <button onClick={clearTerminal} className="p-1.5 hover:bg-green-900/20 rounded transition-colors" title="Clear terminal">
                  <Trash2 className="w-4 h-4 text-green-500/50 hover:text-green-400" />
                </button>
              </div>
            </div>

            {/* Terminal Body */}
            <div
              ref={terminalRef}
              className="flex-1 overflow-y-auto p-5 font-mono text-sm leading-relaxed scrollbar-custom"
              style={{
                background: 'rgba(0, 0, 0, 0.95)',
                minHeight: '400px',
                boxShadow: isRunning ? 'inset 0 0 60px rgba(255, 100, 0, 0.03)' : 'none',
              }}
            >
              {terminalLines.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-green-500/20">
                  <TerminalIcon className="w-20 h-20 mb-6 opacity-10" />
                  <p className="text-lg font-mono animate-pulse">_</p>
                  <p className="text-sm mt-4 text-green-500/15">Check skills, set target, execute</p>
                  <div className="mt-8 space-y-1 text-xs text-green-500/10 text-center">
                    <p>// BRAHMASTRA BUGHUNTER — Batch Skill Executor</p>
                    <p>// Select multiple skills, run them together</p>
                  </div>
                </div>
              ) : (
                <>
                  {terminalLines.map(line => {
                    let lineStyle = 'text-gray-300';
                    if (line.stream === 'stderr') lineStyle = 'text-red-400 font-bold';
                    else if (line.stream === 'command') lineStyle = 'text-yellow-300';
                    else if (line.stream === 'system') {
                      if (line.text.startsWith('[BRAHMASTRA]')) lineStyle = 'text-orange-400 font-bold';
                      else if (line.text.startsWith('[✓]')) lineStyle = 'text-green-400';
                      else if (line.text.startsWith('[✗]')) lineStyle = 'text-red-400 font-bold';
                      else if (line.text.startsWith('[!]')) lineStyle = 'text-yellow-400';
                      else if (line.text.startsWith('[*]')) lineStyle = 'text-cyan-400';
                      else lineStyle = 'text-cyan-400';
                    } else {
                      if (line.text.includes('[medium]')) lineStyle = 'text-yellow-400';
                      else if (line.text.includes('[high]')) lineStyle = 'text-orange-400';
                      else if (line.text.includes('[critical]')) lineStyle = 'text-red-400 font-bold';
                      else if (line.text.includes('PORT')) lineStyle = 'text-cyan-400';
                      else if (line.text.match(/\d+\/tcp\s+open/)) lineStyle = 'text-green-400';
                    }
                    return (
                      <motion.div key={line.id} initial={{ opacity: 0, x: -3 }} animate={{ opacity: 1, x: 0 }}
                                  transition={{ duration: 0.1 }}
                                  className={`whitespace-pre-wrap break-all ${lineStyle}`}>
                        {line.text}
                      </motion.div>
                    );
                  })}
                  <div className={`terminal-cursor inline-block mt-0.5 ${isRunning ? 'text-orange-400' : 'text-green-400'}`} />
                </>
              )}
            </div>

            {/* Terminal Footer */}
            <div className="px-5 py-2 bg-black/60 border-t border-green-900/30">
              <div className="flex items-center gap-4 text-xs text-green-500/40 font-mono">
                <span className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-orange-400 animate-pulse' : 'bg-green-400'}`} />
                  {isRunning ? 'EXECUTING' : 'READY'}
                </span>
                <span className="text-gray-600">|</span>
                <span>LINES: {terminalLines.length}</span>
                <span className="flex-1" />
                <span className="text-green-500/20 tracking-widest">BRAHMASTRA::BUGHUNTER</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BugHunterSkills;
