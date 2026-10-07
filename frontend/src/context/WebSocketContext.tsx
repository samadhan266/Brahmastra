import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import type { TerminalLine, AgentStatus, ToolPrompt } from '../hooks/useWebSocket';

interface WsMessage {
  type: 'terminal' | 'agent_status' | 'tool_prompt' | 'scan_update';
  stream?: string;
  data?: string;
  agent?: string;
  status?: string;
  message?: string;
  tool?: string;
  options?: ToolPrompt['options'];
  progress?: number;
  timestamp: number;
}

interface WebSocketContextType {
  lines: TerminalLine[];
  agentStatuses: AgentStatus[];
  currentPrompt: ToolPrompt | null;
  scanStatus: string;
  scanProgress: number;
  scanMessage: string;
  connected: boolean;
  clearTerminal: () => void;
  sendMessage: (msg: Record<string, unknown>) => void;
  setScanId: (id: string | null) => void;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

const WS_PROTO = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = `${WS_PROTO}//${window.location.host}`;

export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [scanId, setScanId] = useState<string | null>(null);
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [agentStatuses, setAgentStatuses] = useState<AgentStatus[]>([]);
  const [currentPrompt, setCurrentPrompt] = useState<ToolPrompt | null>(null);
  const [scanStatus, setScanStatus] = useState('idle');
  const [scanProgress, setScanProgress] = useState(0);
  const [scanMessage, setScanMessage] = useState('');
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const idRef = useRef(0);

  useEffect(() => {
    if (!scanId) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnected(false);
      return;
    }

    const connectWs = () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      const ws = new WebSocket(`${WS_URL}/api/v1/scans/ws/${scanId}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setLines(prev => [...prev, {
          id: idRef.current++,
          text: '[SYSTEM] WebSocket connected — listening for agent output...',
          stream: 'system',
          timestamp: Date.now()
        }]);
      };

      ws.onmessage = (event) => {
        try {
          const msg: WsMessage = JSON.parse(event.data);

          switch (msg.type) {
            case 'terminal': {
              const text = msg.data || '';
              if (text.trim()) {
                setLines(prev => [...prev, {
                  id: idRef.current++,
                  text: text,
                  stream: msg.stream === 'stderr' ? 'stderr' :
                          text.startsWith('[SYSTEM]') || text.startsWith('[PIPELINE]') ? 'system' :
                          msg.stream as 'stdout' | 'stderr' | 'system' || 'stdout',
                  timestamp: msg.timestamp || Date.now()
                }]);
              }
              break;
            }
            case 'agent_status': {
              setAgentStatuses(prev => {
                const existing = prev.findIndex(a => a.agent === msg.agent);
                const entry = { agent: msg.agent || '', status: msg.status || '', message: msg.message || '' };
                if (existing >= 0) {
                  const updated = [...prev];
                  updated[existing] = entry;
                  return updated;
                }
                return [...prev, entry];
              });
              break;
            }
            case 'tool_prompt': {
              setCurrentPrompt({
                tool: msg.tool || '',
                options: msg.options || []
              });
              break;
            }
            case 'scan_update': {
              if (msg.status) setScanStatus(msg.status);
              if (msg.progress !== undefined) setScanProgress(msg.progress);
              if (msg.message) setScanMessage(msg.message);
              break;
            }
          }
        } catch {}
      };

      ws.onclose = () => {
        setConnected(false);
      };

      ws.onerror = () => {
        setConnected(false);
      };
    };

    connectWs();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [scanId]);

  const clearTerminal = useCallback(() => {
    setLines([]);
  }, []);

  const sendMessage = useCallback((msg: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return (
    <WebSocketContext.Provider value={{
      lines, agentStatuses, currentPrompt,
      scanStatus, scanProgress, scanMessage, connected,
      clearTerminal, sendMessage, setScanId
    }}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocketContext = () => {
  const ctx = useContext(WebSocketContext);
  if (!ctx) throw new Error('useWebSocketContext must be used within WebSocketProvider');
  return ctx;
};
