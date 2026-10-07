import { useEffect, useRef, useState, useCallback } from 'react';

export interface TerminalLine {
  id: number;
  text: string;
  stream: 'stdout' | 'stderr' | 'system';
  timestamp: number;
}

export interface AgentStatus {
  agent: string;
  status: string;
  message: string;
}

export interface ToolPrompt {
  tool: string;
  options: Array<{
    command: string;
    description?: string;
    intent?: string;
    prompt?: string;
  }>;
}

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

interface UseWebSocketReturn {
  lines: TerminalLine[];
  agentStatuses: AgentStatus[];
  currentPrompt: ToolPrompt | null;
  scanStatus: string;
  scanProgress: number;
  scanMessage: string;
  connected: boolean;
  clearTerminal: () => void;
  sendMessage: (msg: Record<string, unknown>) => void;
}

const WS_PROTO = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = `${WS_PROTO}//${window.location.host}`;

export function useWebSocket(scanId: string | null): UseWebSocketReturn {
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
      setConnected(false);
      return;
    }

    const ws = new WebSocket(`${WS_URL}/api/v1/scans/ws/${scanId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setLines(prev => [...prev, {
        id: idRef.current++,
        text: '[SYSTEM] WebSocket connected - listening for agent output...',
        stream: 'system',
        timestamp: Date.now()
      }]);
    };

    ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data);

        switch (msg.type) {
          case 'terminal': {
            const prefix = msg.stream === 'stderr' ? '!' : '';
            const text = msg.data || '';
            if (text.trim()) {
              setLines(prev => [...prev, {
                id: idRef.current++,
                text: text,
                stream: msg.stream as 'stdout' | 'stderr' | 'system' || 'stdout',
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

    return () => {
      ws.close();
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

  return {
    lines, agentStatuses, currentPrompt,
    scanStatus, scanProgress, scanMessage, connected,
    clearTerminal, sendMessage
  };
}