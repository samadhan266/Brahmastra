import React from 'react';
import { motion } from 'framer-motion';
import { AGENT_ORDER, AGENT_DISPLAY_NAMES } from '../../types';

interface AgentPipelineProps {
  currentAgent: string | null;
  status: string;
  agentStatuses: Array<{ agent: string; status: string; message: string }>;
}

const getAgentStatus = (agentName: string, currentAgent: string | null, status: string, agentStatuses: Array<{ agent: string; status: string; message: string }>) => {
  if (status === 'completed') return { stage: 'completed', label: 'COMPLETED' };
  if (status === 'failed' && currentAgent === agentName) return { stage: 'failed', label: 'FAILED' };

  const wsStatus = agentStatuses.find(a => a.agent === agentName);
  if (wsStatus) {
    if (wsStatus.status === 'completed') return { stage: 'completed', label: '✓ DONE' };
    if (wsStatus.status === 'running') return { stage: 'running', label: 'RUNNING' };
    if (wsStatus.status === 'failed') return { stage: 'failed', label: 'FAILED' };
  }

  const agentIndex = AGENT_ORDER.indexOf(agentName);
  const currentIndex = AGENT_ORDER.indexOf(currentAgent || '');
  if (currentIndex === -1) return { stage: 'pending', label: 'PENDING' };
  if (agentIndex < currentIndex) return { stage: 'completed', label: '✓ DONE' };
  if (agentIndex === currentIndex) return { stage: 'running', label: 'RUNNING' };
  return { stage: 'pending', label: 'PENDING' };
};

const AgentPipeline: React.FC<AgentPipelineProps> = ({ currentAgent, status, agentStatuses }) => {
  return (
    <div className="cyber-card rounded-xl p-4">
      <div className="flex items-center gap-2.5 mb-3 border-b border-red-900/20 pb-2.5">
        <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
        <span className="text-sm font-mono text-cyan-400/70">AGENT PIPELINE</span>
        <span className="flex-1" />
        <span className="text-xs font-mono text-red-400/50">{AGENT_ORDER.length} AGENTS</span>
      </div>

      <div className="space-y-2">
        {AGENT_ORDER.map((agentName, index) => {
          const agentState = getAgentStatus(agentName, currentAgent, status, agentStatuses);
          const isRunning = agentState.stage === 'running';
          const isCompleted = agentState.stage === 'completed';
          const isFailed = agentState.stage === 'failed';

          const colors: Record<string, string> = {
            recon_agent: 'border-l-blue-500',
            scanner_agent: 'border-l-purple-500',
            vuln_agent: 'border-l-orange-500',
            cloud_agent: 'border-l-cyan-500',
            reporter_agent: 'border-l-green-500',
          };

          return (
            <motion.div
              key={agentName}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className={`relative pl-4 py-2.5 pr-4 rounded border-l-2 ${
                colors[agentName] || 'border-l-red-500'
              } ${
                isRunning
                  ? 'bg-red-900/10 border-l-red-400'
                  : isCompleted
                  ? 'bg-green-900/5 border-l-green-500/50'
                  : isFailed
                  ? 'bg-red-900/10 border-l-red-500'
                  : 'bg-black/20 border-l-gray-700'
              } transition-all duration-300`}
            >
              <div className="flex items-center gap-2.5">
                <div className={`w-2 h-2 rounded-full ${
                  isRunning ? 'bg-cyan-400 animate-pulse shadow-lg shadow-cyan-400/50' :
                  isCompleted ? 'bg-green-400' :
                  isFailed ? 'bg-red-400' :
                  'bg-gray-600'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={`text-base font-mono ${
                      isRunning ? 'text-cyan-300' :
                      isCompleted ? 'text-green-300' :
                      isFailed ? 'text-red-300' :
                      'text-gray-500'
                    }`}>
                      {AGENT_DISPLAY_NAMES[agentName]}
                    </span>
                    <span className={`text-xs font-mono ${
                      isRunning ? 'text-cyan-400' :
                      isCompleted ? 'text-green-500' :
                      isFailed ? 'text-red-400' :
                      'text-gray-600'
                    }`}>
                      {agentState.label}
                    </span>
                  </div>
                  {isRunning && (
                    <div className="mt-1.5 h-1 rounded-full bg-black/60 overflow-hidden">
                      <div className="h-full w-full bg-gradient-to-r from-cyan-400 via-red-400 to-cyan-400 bg-[length:200%_100%]"
                           style={{ animation: 'scan-progress 1.5s linear infinite' }} />
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default AgentPipeline;