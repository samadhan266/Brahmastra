export interface Scan {
  id: string;
  target: string;
  mode: 'autonomous' | 'semi_autonomous' | 'manual';
  status: ScanStatus;
  current_agent: string | null;
  progress: number;
  error_message: string | null;
  created_at: string | null;
  completed_at: string | null;
  message?: string;
}

export type ScanStatus =
  | 'pending'
  | 'recon_running'
  | 'recon_completed'
  | 'scanner_running'
  | 'scanner_completed'
  | 'vuln_running'
  | 'vuln_completed'
  | 'cloud_running'
  | 'cloud_completed'
  | 'report_running'
  | 'completed'
  | 'failed';

export interface ScanProgress {
  id: string;
  target: string;
  mode: string;
  status: string;
  current_agent: string | null;
  progress: number;
  error_message: string | null;
  created_at: string | null;
  completed_at: string | null;
  agent_status: string;
  recon_results: Record<string, unknown> | null;
  scanner_results: Record<string, unknown> | null;
  vuln_results: Record<string, unknown> | null;
  cloud_results: Record<string, unknown> | null;
  report_path: string | null;
  agent_logs: AgentLogEntry[];
}

export interface AgentLogEntry {
  agent_name: string;
  action: string;
  status: string;
  duration_ms: number;
  error: string | null;
}

export interface AgentInfo {
  name: string;
  description: string;
}

export interface SystemInfo {
  name: string;
  description: string;
  agents: AgentInfo[];
  modes: Record<string, string>;
}

export interface ScanCreateRequest {
  target: string;
  mode: string;
}

export const AGENT_ORDER = ['recon_agent', 'scanner_agent', 'vuln_agent', 'cloud_agent', 'reporter_agent'];

export const AGENT_DISPLAY_NAMES: Record<string, string> = {
  recon_agent: 'Recon Agent',
  scanner_agent: 'Scanner Agent',
  vuln_agent: 'Vuln Assessment',
  cloud_agent: 'Cloud Analysis',
  reporter_agent: 'Reporter Agent',
};

export const AGENT_ICONS: Record<string, string> = {
  recon_agent: '🔍',
  scanner_agent: '📡',
  vuln_agent: '⚠️',
  cloud_agent: '☁️',
  reporter_agent: '📄',
};

export const AGENT_COLORS: Record<string, string> = {
  recon_agent: 'from-blue-600/40 to-blue-900/40',
  scanner_agent: 'from-purple-600/40 to-purple-900/40',
  vuln_agent: 'from-orange-600/40 to-orange-900/40',
  cloud_agent: 'from-cyan-600/40 to-cyan-900/40',
  reporter_agent: 'from-green-600/40 to-green-900/40',
};

// ─── BugHunter Skills ───
export type SkillCategory =
  | 'recon'
  | 'osint'
  | 'network'
  | 'vuln_hunting'
  | 'exploitation'
  | 'reporting';

export interface BugHunterSkill {
  id: string;
  name: string;
  category: SkillCategory;
  description: string;
  tools: string[];
  commands: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  tags: string[];
  estimatedTime: string;
}

export const SKILL_CATEGORY_META: Record<SkillCategory, { label: string; icon: string; color: string; description: string }> = {
  recon: {
    label: 'RECON',
    icon: '🔍',
    color: 'blue',
    description: 'Subdomain enumeration, asset discovery, attack surface mapping',
  },
  osint: {
    label: 'OSINT',
    icon: '🌐',
    color: 'cyan',
    description: 'Open source intelligence, data leaks, public exposure',
  },
  network: {
    label: 'NETWORK',
    icon: '📡',
    color: 'purple',
    description: 'Port scanning, service detection, network topology',
  },
  vuln_hunting: {
    label: 'VULN HUNT',
    icon: '🎯',
    color: 'orange',
    description: 'Vulnerability scanning, template-based detection, fuzzing',
  },
  exploitation: {
    label: 'EXPLOIT',
    icon: '💥',
    color: 'red',
    description: 'SQL injection, XSS, SSRF, command injection testing',
  },
  reporting: {
    label: 'REPORT',
    icon: '📄',
    color: 'green',
    description: 'Result aggregation, evidence collection, findings report',
  },
};