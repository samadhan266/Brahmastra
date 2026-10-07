import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Terminal, Wifi, WifiOff, Trash2, ScanLine, Expand, Minimize2 } from 'lucide-react';
import type { TerminalLine } from '../../hooks/useWebSocket';

interface LiveTerminalProps {
  lines: TerminalLine[];
  connected: boolean;
  onClear: () => void;
  scanId: string | null;
}

const LiveTerminal: React.FC<LiveTerminalProps> = ({ lines, connected, onClear, scanId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [matrixMode, setMatrixMode] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines]);

  const getLineStyle = (line: TerminalLine) => {
    if (line.stream === 'stderr') return 'text-red-400 font-bold';
    if (line.stream === 'system') {
      if (line.text.startsWith('[PIPELINE]')) {
        const inner = line.text.replace('[PIPELINE] ', '');
        if (inner.startsWith('╔') || inner.startsWith('╚') || inner.startsWith('║')) {
          return 'text-red-500/70';
        }
        if (inner.includes('RECON') || inner.includes('SCANNER') || inner.includes('VULNER') || inner.includes('REPORTER')) {
          return 'text-red-400 font-bold tracking-wider';
        }
        if (inner.includes('COMPLETE')) {
          return 'text-green-400 font-bold';
        }
        return 'text-cyan-400';
      }
      if (line.text.startsWith('[EXIT]')) {
        if (line.text.includes('✓')) return 'text-green-400/80';
        return 'text-red-400 font-bold';
      }
      if (line.text.startsWith('[STDERR]')) return 'text-yellow-400';
      if (line.text.startsWith('[WARN]')) return 'text-yellow-400/80';
      if (line.text.startsWith('[TIMEOUT]')) return 'text-red-400 font-bold';
      if (line.text.startsWith('[ERROR]')) return 'text-red-400 font-bold';
      if (line.text.startsWith('[SYSTEM]')) return 'text-cyan-400 font-bold';
      return 'text-cyan-400';
    }
    if (line.text.startsWith('$ ')) return 'text-yellow-300';
    if (line.text.startsWith('✓')) return 'text-green-400';
    if (line.text.startsWith('✗')) return 'text-red-400 font-bold';
    if (line.text.startsWith('[recon]')) return 'text-blue-300';
    if (line.text.startsWith('[scanner_agent]')) return 'text-purple-300';
    if (line.text.startsWith('[vuln_agent]')) return 'text-orange-300';
    if (line.text.startsWith('[reporter_agent]')) return 'text-green-300';
    return 'text-gray-300';
  };

  const matrixClass = matrixMode ? 'font-matrix text-green-400' : '';

  return (
    <div className={`terminal-window rounded-xl overflow-hidden flex flex-col h-full ${fullscreen ? 'fixed inset-0 z-50 rounded-none' : ''}`}>
      <div className="flex items-center justify-between px-5 py-3 bg-black/80 border-b border-green-900/40">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Terminal className={`w-5 h-5 ${connected ? 'text-green-400' : 'text-red-400'}`} />
            {connected && <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-400 animate-ping" />}
          </div>
          <span className="text-sm font-mono text-green-400/80">
            <span className="text-green-400">root</span><span className="text-gray-500">@</span><span className="text-cyan-400">brahmastra</span>
            <span className="text-gray-500">:</span><span className="text-blue-400">~</span>
            {scanId ? <span className="text-gray-500">/pipeline</span> : ''}
            <span className="text-gray-500">$</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMatrixMode(!matrixMode)}
            className={`p-1.5 rounded transition-colors ${matrixMode ? 'bg-green-900/30 text-green-400' : 'hover:bg-green-900/20 text-green-600'}`}
            title="Toggle matrix mode"
          >
            <ScanLine className="w-4 h-4" />
          </button>
          <button
            onClick={() => setFullscreen(!fullscreen)}
            className="p-1.5 hover:bg-green-900/20 rounded transition-colors text-green-600"
            title="Toggle fullscreen"
          >
            {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Expand className="w-4 h-4" />}
          </button>
          <span className="flex items-center gap-2 text-sm">
            {connected ? (
              <><Wifi className="w-4 h-4 text-green-400" /><span className="text-green-400/80 text-xs font-bold tracking-wider">LIVE</span></>
            ) : (
              <><WifiOff className="w-4 h-4 text-red-400" /><span className="text-red-400/60 text-xs">OFF</span></>
            )}
          </span>
          <button onClick={onClear} className="p-1.5 hover:bg-green-900/20 rounded transition-colors">
            <Trash2 className="w-4 h-4 text-green-500/50 hover:text-green-400" />
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className={`flex-1 overflow-y-auto p-5 font-mono text-base leading-relaxed scrollbar-custom ${matrixClass}`}
        style={{
          background: matrixMode
            ? 'rgba(0, 10, 0, 0.98)'
            : 'rgba(0, 0, 0, 0.95)',
          minHeight: fullscreen ? 'calc(100vh - 100px)' : '500px',
          maxHeight: fullscreen ? 'calc(100vh - 100px)' : 'calc(100vh - 140px)',
          boxShadow: connected ? 'inset 0 0 60px rgba(0, 255, 65, 0.03)' : 'none',
        }}
      >
        {lines.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-green-500/30">
            <Terminal className="w-20 h-20 mb-6 opacity-10" />
            <p className="text-lg font-mono animate-pulse">_</p>
            <p className="text-sm mt-4 text-green-500/20">Start a scan to see live commands</p>
            <div className="mt-8 space-y-1 text-xs text-green-500/10 text-center">
              <p>// BRAHMASTRA v1.0 — Autonomous AI Pentest System</p>
              <p>// Ready for target acquisition</p>
            </div>
          </div>
        ) : (
          <>
            {lines.map((line, idx) => (
              <motion.div
                key={line.id}
                initial={{ opacity: 0, y: -2 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
                className={`whitespace-pre-wrap break-all ${getLineStyle(line)}`}
              >
                {line.text}
              </motion.div>
            ))}
            <div className={`terminal-cursor inline-block mt-0.5 ${connected ? 'text-green-400' : 'text-red-400'}`} />
          </>
        )}
      </div>

      <div className="px-5 py-2 bg-black/60 border-t border-green-900/30">
        <div className="flex items-center gap-4 text-xs text-green-500/40 font-mono">
          <span className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
            {connected ? 'CONNECTED' : 'OFFLINE'}
          </span>
          <span className="text-gray-600">|</span>
          <span>LINES: {lines.length}</span>
          <span className="text-gray-600">|</span>
          <span>PID: {scanId ? scanId.slice(0, 8) : '—'}</span>
          <span className="flex-1" />
          <span className="text-green-500/20 tracking-widest">BRAHMASTRA::TERMINAL</span>
        </div>
      </div>
    </div>
  );
};

export default LiveTerminal;