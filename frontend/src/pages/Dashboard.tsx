import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { brahmastraApi } from '../utils/api';
import { BUGHUNTER_SKILLS, SKILL_CATEGORIES } from '../data/bughunter-skills';
import type { BugHunterSkill, SkillCategory } from '../data/bughunter-skills';
import {
  Shield, Activity, Wifi, Terminal as TerminalIcon,
  ChevronDown, X, Target, Bug, Play, Square,
  ChevronRight, Check, Trash2, Clock, Send,
} from 'lucide-react';

const WS_PROTO = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_HOST = window.location.host;

const difficultyColors: Record<string, string> = {
  beginner: 'text-green-400 border-green-500/30 bg-green-900/10',
  intermediate: 'text-yellow-400 border-yellow-500/30 bg-yellow-900/10',
  advanced: 'text-red-400 border-red-500/30 bg-red-900/10',
};

const catColorBorder: Record<string, string> = {
  blue: 'border-blue-500/30',
  cyan: 'border-cyan-500/30',
  purple: 'border-purple-500/30',
  orange: 'border-orange-500/30',
  red: 'border-red-500/30',
  green: 'border-green-500/30',
  sky: 'border-sky-500/30',
};

const catColorText: Record<string, string> = {
  blue: 'text-blue-400',
  cyan: 'text-cyan-400',
  purple: 'text-purple-400',
  orange: 'text-orange-400',
  red: 'text-red-400',
  green: 'text-green-400',
  sky: 'text-sky-400',
};

const catColorBg: Record<string, string> = {
  blue: 'bg-blue-900/20',
  cyan: 'bg-cyan-900/20',
  purple: 'bg-purple-900/20',
  orange: 'bg-orange-900/20',
  red: 'bg-red-900/20',
  green: 'bg-green-900/20',
  sky: 'bg-sky-900/20',
};

const Dashboard: React.FC = () => {
  const [target, setTarget] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());
  const [expandedCat, setExpandedCat] = useState<SkillCategory | null>('recon');
  const [bhConnected, setBhConnected] = useState(false);
  const [bhRunning, setBhRunning] = useState(false);
  const [bhLines, setBhLines] = useState<Array<{ id: number; text: string; stream: string; ts: number }>>([]);
  const [glitchTrigger, setGlitchTrigger] = useState(0);
  const bhWsRef = useRef<WebSocket | null>(null);
  const bhIdRef = useRef(0);
  const bhTermRef = useRef<HTMLDivElement>(null);

  // Manual terminal state
  const [termInput, setTermInput] = useState('');
  const [termHistory, setTermHistory] = useState<string[]>([]);
  const [termHistoryIdx, setTermHistoryIdx] = useState(-1);
  const [termWsConnected, setTermWsConnected] = useState(false);
  const [termRunning, setTermRunning] = useState(false);
  const [termAiMode, setTermAiMode] = useState(false);
  const termWsRef = useRef<WebSocket | null>(null);
  const termSessionIdRef = useRef<string>('');
  const termInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (bhWsRef.current) { bhWsRef.current.close(); bhWsRef.current = null; }
      if (termWsRef.current) { termWsRef.current.close(); termWsRef.current = null; }
    };
  }, []);

  // Auto-scroll terminal
  useEffect(() => {
    if (bhTermRef.current) bhTermRef.current.scrollTop = bhTermRef.current.scrollHeight;
  }, [bhLines]);

  const addBhLine = useCallback((text: string, stream = 'stdout') => {
    setBhLines(prev => [...prev, { id: bhIdRef.current++, text, stream, ts: Date.now() }]);
  }, []);

  // Connect manual terminal WebSocket
  const connectTermWs = useCallback(() => {
    if (termWsRef.current) { termWsRef.current.close(); termWsRef.current = null; }
    if (!termSessionIdRef.current) termSessionIdRef.current = `term-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ws = new WebSocket(`${WS_PROTO}//${WS_HOST}/api/v1/bughunter/ws/terminal/${termSessionIdRef.current}`);
    termWsRef.current = ws;
    ws.onopen = () => setTermWsConnected(true);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'terminal' && msg.data != null) {
          const stream = msg.stream === 'stderr' ? 'stderr' : 'stdout';
          setBhLines(prev => [...prev, { id: bhIdRef.current++, text: msg.data, stream, ts: Date.now() }]);
        }
      } catch {}
    };
    ws.onclose = () => { setTermWsConnected(false); setTermRunning(false); };
    ws.onerror = () => { setTermWsConnected(false); setTermRunning(false); };
  }, []);

  // Send command to terminal
  const sendTermCommand = useCallback((cmd: string) => {
    if (!cmd.trim()) return;
    if (!termWsConnected || !termWsRef.current) {
      connectTermWs();
      setTimeout(() => {
        if (termWsRef.current?.readyState === WebSocket.OPEN) {
          termWsRef.current.send(JSON.stringify({ type: 'command', command: cmd }));
          setTermRunning(true);
        }
      }, 300);
    } else {
      termWsRef.current.send(JSON.stringify({ type: 'command', command: cmd }));
      setTermRunning(true);
    }
    setTermHistory(prev => [...prev, cmd]);
    setTermHistoryIdx(-1);
  }, [termWsConnected, connectTermWs]);

  // Send AI chat message to terminal
  const sendTermAiChat = useCallback((msg: string) => {
    if (!msg.trim()) return;
    const history: Array<{role:string;content:string}> = [];
    if (!termWsConnected || !termWsRef.current) {
      connectTermWs();
      setTimeout(() => {
        if (termWsRef.current?.readyState === WebSocket.OPEN) {
          termWsRef.current.send(JSON.stringify({ type: 'llm_chat', message: msg, history }));
          setTermRunning(true);
        }
      }, 300);
    } else {
      termWsRef.current.send(JSON.stringify({ type: 'llm_chat', message: msg, history }));
      setTermRunning(true);
    }
  }, [termWsConnected, connectTermWs]);

  // Cancel running terminal command
  const cancelTermCommand = useCallback(() => {
    if (termWsRef.current?.readyState === WebSocket.OPEN) {
      termWsRef.current.send(JSON.stringify({ type: 'cancel' }));
    }
    setTermRunning(false);
  }, []);

  // Handle terminal input keyboard events
  const handleTermKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (termAiMode) {
        sendTermAiChat(termInput);
      } else {
        sendTermCommand(termInput);
      }
      setTermInput('');
    } else if (e.key === 'c' && e.ctrlKey) {
      e.preventDefault();
      cancelTermCommand();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (termHistory.length > 0) {
        const newIdx = termHistoryIdx < termHistory.length - 1 ? termHistoryIdx + 1 : termHistoryIdx;
        setTermHistoryIdx(newIdx);
        setTermInput(termHistory[termHistory.length - 1 - newIdx] || '');
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (termHistoryIdx > 0) {
        const newIdx = termHistoryIdx - 1;
        setTermHistoryIdx(newIdx);
        setTermInput(termHistory[termHistory.length - 1 - newIdx] || '');
      } else {
        setTermHistoryIdx(-1);
        setTermInput('');
      }
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      setBhLines([]);
      bhIdRef.current = 0;
    }
  }, [termInput, termHistory, termHistoryIdx, termAiMode, sendTermCommand, sendTermAiChat, cancelTermCommand]);

  const connectBhWs = useCallback((execId: string) => {
    if (bhWsRef.current) { bhWsRef.current.close(); bhWsRef.current = null; }
    const ws = new WebSocket(`${WS_PROTO}//${WS_HOST}/api/v1/bughunter/ws/${execId}`);
    bhWsRef.current = ws;
    ws.onopen = () => setBhConnected(true);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'terminal' && msg.data?.trim()) {
          const stream = msg.stream === 'stderr' ? 'stderr' : 'stdout';
          setBhLines(prev => [...prev, { id: bhIdRef.current++, text: msg.data, stream, ts: Date.now() }]);
        } else if (msg.type === 'scan_update' && msg.status === 'completed') {
          setBhRunning(false);
        }
      } catch {}
    };
    ws.onclose = () => setBhConnected(false);
    ws.onerror = () => setBhConnected(false);
  }, []);

  const toggleSkill = (id: string) => {
    setSelectedSkills(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllInCategory = (cat: SkillCategory) => {
    const catSkills = BUGHUNTER_SKILLS.filter(s => s.category === cat);
    const allSelected = catSkills.every(s => selectedSkills.has(s.id));
    setSelectedSkills(prev => {
      const next = new Set(prev);
      catSkills.forEach(s => { if (allSelected) next.delete(s.id); else next.add(s.id); });
      return next;
    });
  };

  const clearSelection = () => setSelectedSkills(new Set());

  const handleRunSemiAuto = useCallback(async () => {
    if (!target.trim() || selectedSkills.size === 0) return;
    const cmds: string[] = [];
    const toolNames: string[] = [];
    selectedSkills.forEach(id => {
      const sk = BUGHUNTER_SKILLS.find(s => s.id === id);
      if (sk) { cmds.push(...sk.commands); sk.tools.forEach(t => { if (!toolNames.includes(t)) toolNames.push(t); }); }
    });
    setBhRunning(true);
    setBhLines([]);
    bhIdRef.current = 0;
    setGlitchTrigger(prev => prev + 1);
    try {
      const res = await brahmastraApi.executeSkill({
        skill_id: `semi-${Date.now()}`,
        skill_name: `${selectedSkills.size} skills`,
        target: target.trim(),
        commands: cmds,
        tools: toolNames,
        timeout: 300,
      });
      connectBhWs(res.data.exec_id);
      addBhLine(`[PENTESTER AI] Running ${cmds.length} commands across ${selectedSkills.size} skills`, 'system');
      addBhLine(`[PENTESTER AI] Target: ${target}`, 'system');
      addBhLine(`[PENTESTER AI] Tools: ${toolNames.join(', ')}`, 'system');
      addBhLine('', 'stdout');
    } catch (err: any) {
      setBhRunning(false);
      addBhLine(`[✗] Failed: ${err?.response?.data?.detail || err?.message || 'error'}`, 'stderr');
    }
  }, [target, selectedSkills, connectBhWs, addBhLine]);

  const handleRunSingleSkill = useCallback(async (skill: BugHunterSkill) => {
    if (!target.trim()) { addBhLine('[!] Set a target first', 'stderr'); return; }
    setBhRunning(true);
    setBhLines([]);
    bhIdRef.current = 0;
    setGlitchTrigger(prev => prev + 1);
    try {
      const res = await brahmastraApi.executeSkill({
        skill_id: skill.id,
        skill_name: skill.name,
        target: target.trim(),
        commands: skill.commands,
        tools: skill.tools,
        timeout: 300,
      });
      connectBhWs(res.data.exec_id);
      addBhLine(`[PENTESTER AI] Skill: ${skill.name}`, 'system');
      addBhLine(`[PENTESTER AI] Target: ${target}`, 'system');
      addBhLine('', 'stdout');
    } catch (err: any) {
      setBhRunning(false);
      addBhLine(`[✗] Failed: ${err?.response?.data?.detail || err?.message || 'error'}`, 'stderr');
    }
  }, [target, connectBhWs, addBhLine]);

  const handleStopBh = useCallback(async () => {
    if (bhWsRef.current) { bhWsRef.current.close(); bhWsRef.current = null; }
    setBhRunning(false);
    setBhConnected(false);
    addBhLine('[!] Stopped by user', 'stderr');
  }, [addBhLine]);

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0a] crt-effect">
      <div className="scanline" />
      <div className="matrix-rain" />

      {/* ─── HEADER ─── */}
      <header className="flex items-center justify-between px-6 py-2.5 border-b border-red-900/30 bg-black/70 flex-shrink-0 data-stream">
        <div className="flex items-center gap-4">
          <div className="relative group">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-900/40 to-black flex items-center justify-center border border-red-500/30"
                 style={{ boxShadow: '0 0 15px rgba(255,0,60,0.15)' }}>
              <Shield className="w-5 h-5 text-red-400" />
            </div>
            <div className="absolute -top-1 -right-1 w-3 h-3">
              <div className="w-full h-full rounded-full bg-red-500 animate-ping opacity-75" />
              <div className="absolute inset-0 rounded-full bg-red-500" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold tracking-wider">
                <span className="neon-text glitch-text" key={glitchTrigger}>BRAHMASTRA</span>
              </h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono border border-red-500/30 text-red-400 bg-red-900/20 tracking-widest">v1.0</span>
              <span className="text-[10px] font-mono text-gray-600 border border-gray-800 px-2 py-0.5 rounded">
                {bhRunning ? 'ACTIVE' : 'IDLE'}
              </span>
            </div>
            <p className="text-[11px] text-gray-500 font-mono tracking-wider flex items-center gap-2">
              <Bug className="w-3 h-3 text-orange-500/50" />
              PENTESTER AI
              <span className="text-gray-700">|</span>
              <span className="text-cyan-500/50">{Object.keys(SKILL_CATEGORIES).length} CATEGORIES</span>
              <span className="text-gray-700">|</span>
              <span className="text-red-500/50">{BUGHUNTER_SKILLS.length} SKILLS</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded border text-sm font-mono ${
            bhRunning
              ? 'border-cyan-500/30 bg-cyan-900/10'
              : !bhRunning && bhLines.length > 0
                ? 'border-green-500/30 bg-green-900/10'
                : 'border-gray-800'
          }`}>
            <Activity className={`w-3.5 h-3.5 ${bhRunning ? 'text-cyan-400 animate-pulse' : 'text-gray-600'}`} />
            <span className={`text-[11px] tracking-wider ${
              bhRunning ? 'text-cyan-400' :
              !bhRunning && bhLines.length > 0 ? 'text-green-400' : 'text-gray-600'
            }`}>
              {bhRunning ? 'SCANNING' : bhLines.length > 0 ? 'COMPLETE' : 'STANDBY'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-mono">
            {bhConnected ? (
              <><Wifi className="w-3.5 h-3.5 text-green-400 animate-pulse" /><span className="text-green-400/80 tracking-wider">LIVE</span></>
            ) : (
              <span className="text-gray-600">OFFLINE</span>
            )}
          </div>
        </div>
      </header>

      {bhRunning && <div className="progress-bar flex-shrink-0" />}

      {/* ─── MAIN LAYOUT ─── */}
      <div className="flex-1 flex dashboard-layout overflow-hidden">

        {/* ═══════════════════════════════════════════════════════ */}
        {/* LEFT PANEL: SKILL SELECTION                            */}
        {/* ═══════════════════════════════════════════════════════ */}
        <div className="w-[440px] min-w-[400px] flex flex-col gap-3 p-4 overflow-y-auto scrollbar-custom border-r border-red-900/10 bg-black/20 flex-shrink-0">

          {/* TARGET INPUT */}
          <div className="cyber-card rounded-xl p-3.5">
            <label className="block text-xs font-mono text-cyan-400/80 mb-1.5">{'TARGET >'}</label>
            <div className="relative">
              <input
                type="text"
                value={target}
                onChange={e => setTarget(e.target.value)}
                placeholder="example.com or 192.168.1.1"
                className="w-full px-3 py-2.5 pl-9 neon-input rounded-lg text-sm font-mono placeholder-gray-600"
              />
              <Target className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-red-500/50" />
            </div>
          </div>

          {/* SKILL CATEGORIES */}
          <div className="cyber-card rounded-xl overflow-hidden">
            <div className="flex items-center justify-between p-3 border-b border-red-900/20">
              <div className="flex items-center gap-2">
                <Bug className="w-4 h-4 text-orange-400" />
                <span className="text-sm font-mono font-bold text-orange-300">PENTESTER AI SKILLS</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-gray-500">{selectedSkills.size} selected</span>
                {selectedSkills.size > 0 && (
                  <button onClick={clearSelection} className="p-1 rounded hover:bg-red-900/20" title="Clear all">
                    <X className="w-3 h-3 text-gray-500 hover:text-red-400" />
                  </button>
                )}
              </div>
            </div>

            <div className="max-h-[500px] overflow-y-auto scrollbar-custom">
              {(Object.keys(SKILL_CATEGORIES) as SkillCategory[]).map(cat => {
                const meta = SKILL_CATEGORIES[cat];
                const catSkills = BUGHUNTER_SKILLS.filter(s => s.category === cat);
                const isExpanded = expandedCat === cat;
                const selectedCount = catSkills.filter(s => selectedSkills.has(s.id)).length;
                const allSelected = catSkills.length > 0 && catSkills.every(s => selectedSkills.has(s.id));

                return (
                  <div key={cat} className={`border-b border-red-900/10 ${isExpanded ? 'bg-black/30' : ''}`}>
                    <div className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-red-900/5 transition-colors"
                         onClick={() => setExpandedCat(isExpanded ? null : cat)}>
                      <div className="flex items-center gap-2.5">
                        <span className="text-sm">{meta.icon}</span>
                        <span className={`text-xs font-mono font-bold ${catColorText[meta.color]}`}>{meta.label}</span>
                        <span className="text-[10px] font-mono text-gray-600">
                          {selectedCount > 0 ? `${selectedCount}/${catSkills.length}` : `${catSkills.length} skills`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={e => { e.stopPropagation(); selectAllInCategory(cat); }}
                                className={`px-2 py-0.5 rounded text-[9px] font-mono border transition-all ${
                                  allSelected
                                    ? 'bg-orange-900/20 border-orange-500/30 text-orange-400'
                                    : 'border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-500'
                                }`}>
                          {allSelected ? 'DESELECT' : 'ALL'}
                        </button>
                        <ChevronRight className={`w-3.5 h-3.5 text-gray-600 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      </div>
                    </div>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="px-3 pb-3 space-y-1.5">
                            {catSkills.map(skill => {
                              const isSelected = selectedSkills.has(skill.id);
                              return (
                                <div key={skill.id}
                                     onClick={() => toggleSkill(skill.id)}
                                     className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                                       isSelected
                                         ? `${catColorBg[meta.color]} ${catColorBorder[meta.color]}`
                                         : 'bg-black/20 border-gray-800/50 hover:border-gray-700 hover:bg-black/40'
                                     }`}>
                                  <div className={`w-4 h-4 mt-0.5 rounded border flex-shrink-0 flex items-center justify-center transition-all ${
                                    isSelected
                                      ? 'border-orange-500 bg-orange-500/20'
                                      : 'border-gray-600'
                                  }`}>
                                    {isSelected && <Check className="w-3 h-3 text-orange-400" />}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                      <span className={`text-xs font-mono font-bold ${isSelected ? 'text-gray-100' : 'text-gray-300'}`}>
                                        {skill.name}
                                      </span>
                                      <span className={`px-1 py-0.5 rounded text-[8px] font-mono border ${difficultyColors[skill.difficulty]}`}>
                                        {skill.difficulty[0].toUpperCase()}
                                      </span>
                                    </div>
                                    <p className="text-[10px] font-mono text-gray-500 leading-relaxed line-clamp-1">{skill.description}</p>
                                    <div className="flex items-center gap-1.5 mt-1">
                                      <Clock className="w-2.5 h-2.5 text-gray-600" />
                                      <span className="text-[9px] font-mono text-gray-600">{skill.estimatedTime}</span>
                                      <span className="text-[9px] font-mono text-gray-700">|</span>
                                      <span className="text-[9px] font-mono text-gray-600">{skill.tools.join(', ')}</span>
                                    </div>
                                  </div>
                                  <button onClick={e => { e.stopPropagation(); handleRunSingleSkill(skill); }}
                                          disabled={bhRunning || !target.trim()}
                                          className="p-1.5 rounded hover:bg-red-900/20 disabled:opacity-20 transition-all flex-shrink-0"
                                          title={`Run ${skill.name}`}>
                                    <Play className="w-3 h-3 text-orange-400" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>

            {selectedSkills.size > 0 && (
              <div className="p-3 border-t border-red-900/20">
                <button onClick={handleRunSemiAuto}
                        disabled={bhRunning || !target.trim()}
                        className="w-full py-2.5 rounded-lg text-sm font-mono font-bold flex items-center justify-center gap-2 transition-all
                                   bg-gradient-to-r from-orange-900/30 to-red-900/20 border border-orange-500/40 text-orange-300
                                   hover:border-orange-400/60 hover:shadow-lg hover:shadow-orange-900/20 disabled:opacity-30 disabled:cursor-not-allowed">
                  {bhRunning ? (
                    <>
                      <div className="w-4 h-4 border-2 border-orange-400/50 border-t-transparent rounded-full animate-spin" />
                      RUNNING {selectedSkills.size} SKILLS...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      RUN {selectedSkills.size} SELECTED SKILLS
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* RIGHT PANEL: TERMINAL                                 */}
        {/* ═══════════════════════════════════════════════════════ */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="terminal-window rounded-none flex flex-col h-full">
              {/* Terminal Header */}
              <div className="flex items-center justify-between px-5 py-3 bg-black/80 border-b border-orange-900/40">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <TerminalIcon className={`w-5 h-5 ${bhRunning ? 'text-orange-400' : 'text-green-400'}`} />
                    {bhRunning && <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-orange-400 animate-ping" />}
                  </div>
                  <span className="text-sm font-mono text-green-400/80">
                    <span className="text-green-400">root</span>
                    <span className="text-gray-500">@</span>
                    <span className="text-orange-400">pentester</span>
                    <span className="text-gray-500">:</span>
                    <span className="text-blue-400">~</span>
                    <span className="text-gray-500">$</span>
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {bhRunning && (
                    <button onClick={handleStopBh}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-900/20 border border-red-500/30 text-red-400 text-xs font-mono hover:bg-red-900/30 transition-all">
                      <Square className="w-3 h-3" /> STOP
                    </button>
                  )}
                  <button onClick={() => { setBhLines([]); bhIdRef.current = 0; }}
                          className="p-1.5 hover:bg-green-900/20 rounded transition-colors" title="Clear">
                    <Trash2 className="w-4 h-4 text-green-500/50 hover:text-green-400" />
                  </button>
                </div>
              </div>

              {/* Terminal Body */}
              <div ref={bhTermRef}
                   className="flex-1 overflow-y-auto p-5 font-mono text-sm leading-relaxed scrollbar-custom"
                   style={{
                     background: 'rgba(0, 0, 0, 0.95)',
                     minHeight: '400px',
                     boxShadow: bhRunning ? 'inset 0 0 60px rgba(255, 100, 0, 0.03)' : 'none',
                   }}>
                {bhLines.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-green-500/20">
                    <TerminalIcon className="w-20 h-20 mb-6 opacity-10" />
                    <p className="text-lg font-mono animate-pulse">_</p>
                    <p className="text-sm mt-4 text-green-500/15">Select skills or type commands to begin</p>
                    <div className="mt-8 space-y-1 text-xs text-green-500/10 text-center">
                      <p>// BRAHMASTRA PENTESTER AI</p>
                      <p>// Manual terminal + BugHunter skills</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {bhLines.map(line => {
                      let lineStyle = 'text-gray-300';
                      if (line.stream === 'stderr') lineStyle = 'text-red-400 font-bold';
                      else if (line.text.startsWith('[PENTESTER AI]') || line.text.startsWith('[BRAHMASTRA]')) lineStyle = 'text-orange-400 font-bold';
                      else if (line.text.startsWith('[✓]')) lineStyle = 'text-green-400';
                      else if (line.text.startsWith('[✗]')) lineStyle = 'text-red-400 font-bold';
                      else if (line.text.startsWith('[!]')) lineStyle = 'text-yellow-400';
                      else if (line.text.startsWith('[*]')) lineStyle = 'text-cyan-400';
                      else if (line.text.startsWith('$')) lineStyle = 'text-yellow-300';
                      else if (line.text.includes('[medium]')) lineStyle = 'text-yellow-400';
                      else if (line.text.includes('[high]')) lineStyle = 'text-orange-400';
                      else if (line.text.includes('[critical]')) lineStyle = 'text-red-400 font-bold';
                      else if (line.text.includes('PORT')) lineStyle = 'text-cyan-400';
                      else if (line.text.match(/\d+\/tcp\s+open/)) lineStyle = 'text-green-400';

                      return (
                        <motion.div key={line.id}
                                   initial={{ opacity: 0, x: -3 }}
                                   animate={{ opacity: 1, x: 0 }}
                                   transition={{ duration: 0.1 }}
                                   className={`whitespace-pre-wrap break-all ${lineStyle}`}>
                          {line.text}
                        </motion.div>
                      );
                    })}
                    <div className={`terminal-cursor inline-block mt-0.5 ${bhRunning || termRunning ? 'text-orange-400' : 'text-green-400'}`} />
                  </>
                )}
              </div>

              {/* ─── MANUAL TERMINAL INPUT ─── */}
              <div className="flex-shrink-0 border-t border-orange-900/30 bg-black/90">
                <div className="flex items-center gap-2 px-4 py-2.5">
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-green-400 font-mono text-sm font-bold">root</span>
                    <span className="text-gray-500 font-mono text-sm">@</span>
                    <span className="text-orange-400 font-mono text-sm font-bold">pentester</span>
                    <span className="text-gray-500 font-mono text-sm">:</span>
                    <span className="text-blue-400 font-mono text-sm">~</span>
                    <span className="text-gray-500 font-mono text-sm">$</span>
                  </div>
                  <div className="relative flex-1">
                    <input
                      ref={termInputRef}
                      type="text"
                      value={termInput}
                      onChange={e => { setTermInput(e.target.value); setTermHistoryIdx(-1); }}
                      onKeyDown={handleTermKeyDown}
                      placeholder={termRunning ? "waiting for output... (Ctrl+C to cancel)" : termAiMode ? "ask AI about recon/tools/techniques..." : "type command... (Enter to execute, ↑↓ for history)"}
                      disabled={false}
                      className="w-full bg-transparent text-green-400 font-mono text-sm outline-none placeholder-gray-600 caret-green-400"
                      autoFocus
                    />
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => setTermAiMode(!termAiMode)}
                            className={`p-1.5 rounded transition-colors group ${termAiMode ? 'bg-orange-900/40 hover:bg-orange-800/50' : 'hover:bg-gray-800/50'}`}
                            title={termAiMode ? "Switch to command mode" : "Switch to AI chat mode"}>
                      <TerminalIcon className={`w-3.5 h-3.5 ${termAiMode ? 'text-orange-400 group-hover:text-orange-300' : 'text-gray-500 group-hover:text-gray-300'}`} />
                    </button>
                    {termRunning ? (
                      <button onClick={cancelTermCommand}
                              className="p-1.5 rounded hover:bg-red-900/30 transition-colors group"
                              title="Cancel (Ctrl+C)">
                        <Square className="w-3.5 h-3.5 text-red-400 group-hover:text-red-300" />
                      </button>
                    ) : (
                      <button onClick={() => { if (termInput.trim()) { if (termAiMode) { sendTermAiChat(termInput); } else { sendTermCommand(termInput); } setTermInput(''); } }}
                              disabled={!termInput.trim()}
                              className="p-1.5 rounded hover:bg-green-900/30 transition-colors group disabled:opacity-30"
                              title="Execute (Enter)">
                        <Send className="w-3.5 h-3.5 text-green-400 group-hover:text-green-300" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 px-4 pb-1.5 text-[9px] font-mono text-gray-600">
                  <span className="flex items-center gap-1">
                    <span className={`w-1 h-1 rounded-full ${termWsConnected ? 'bg-green-400' : 'bg-red-500'}`} />
                    {termWsConnected ? 'TERMINAL LIVE' : 'TERMINAL OFFLINE'}
                  </span>
                  <span>|</span>
                  <span>↑↓ history</span>
                  <span>|</span>
                  <span>Ctrl+C cancel</span>
                  <span>|</span>
                  <span>Ctrl+L clear</span>
                  <span className="flex-1" />
                  {termAiMode ? (
                    <span className="text-orange-500 font-semibold">ASK AI</span>
                  ) : (
                    <span className="text-orange-500/30">MANUAL</span>
                  )}
                </div>
              </div>

              {/* Terminal Footer */}
              <div className="px-5 py-2 bg-black/60 border-t border-orange-900/30">
                <div className="flex items-center gap-4 text-xs text-green-500/40 font-mono">
                  <span className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${bhRunning ? 'bg-orange-400 animate-pulse' : 'bg-green-400'}`} />
                    {bhRunning ? 'EXECUTING' : 'READY'}
                  </span>
                  <span className="text-gray-600">|</span>
                  <span>LINES: {bhLines.length}</span>
                  <span className="flex-1" />
                  <span className="text-green-500/20 tracking-widest">BRAHMASTRA::PENTESTER</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
