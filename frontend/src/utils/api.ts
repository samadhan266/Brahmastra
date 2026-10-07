import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

export const brahmastraApi = {
  getHealth: () => api.get('/health').catch(() => { throw new Error('Backend unavailable'); }),
  getInfo: () => api.get('/info'),

  createScan: (data: { target: string; mode: string; tools?: Record<string, string[]> }) =>
    api.post('/v1/scans/create', data),

  startScan: (scanId: string, toolSelections?: Record<string, string[]>) =>
    api.post(`/v1/scans/${scanId}/start`, toolSelections || {}),

  getScanStatus: (scanId: string) => api.get(`/v1/scans/${scanId}/status`),
  getScanResults: (scanId: string) => api.get(`/v1/scans/${scanId}/results`),

  listScans: (limit = 20, offset = 0) =>
    api.get('/v1/scans/list', { params: { limit, offset } }),

  cancelScan: (scanId: string) => api.post(`/v1/scans/${scanId}/cancel`),
  deleteScan: (scanId: string) => api.delete(`/v1/scans/${scanId}`),
  pauseScan: (scanId: string) => api.post(`/v1/scans/${scanId}/pause`),
  resumeScan: (scanId: string) => api.post(`/v1/scans/${scanId}/resume`),

  // ─── LLM SEARCH ───
  llmQuery: (query: string, target?: string) =>
    api.post('/v1/scans/llm-query', { query, target }),

  // ─── API TOGGLE ───
  getApiToggle: () => api.get('/v1/scans/api-toggle'),
  setApiToggle: (enabled: boolean) => api.post('/v1/scans/api-toggle', { enabled }),

  // ─── TOOLS ───
  listTools: (category?: string) =>
    api.get('/v1/scans/tools', { params: category ? { category } : {} }),
  getToolDetail: (toolName: string) => api.get(`/v1/scans/tools/${toolName}`),

  // ─── SYSTEM STATUS (Shield page) ───
  getSystemStatus: () => api.get('/v1/scans/system/status'),
  checkToolUpdate: (toolName: string) => api.get(`/v1/scans/tools/${toolName}/check-update`),
  updateAllTools: () => api.post('/v1/scans/tools/update-all'),
  getBackgroundActivity: () => api.get('/v1/scans/activity'),
  getErrors: () => api.get('/v1/scans/errors'),
  retryError: (scanId: string) => api.post(`/v1/scans/errors/${scanId}/retry`),
  dismissError: (scanId: string) => api.delete(`/v1/scans/errors/${scanId}`),

  // ─── BUGHUNTER SKILLS ───
  executeSkill: (data: {
    skill_id: string;
    skill_name: string;
    target: string;
    commands: string[];
    tools: string[];
    timeout?: number;
  }) => api.post('/v1/bughunter/execute', data),

  cancelSkillExecution: (execId: string) =>
    api.post(`/v1/bughunter/${execId}/cancel`),

  // ─── BUGHUNTER HISTORY / TECHNIQUE REPORTS ───
  getBughunterHistory: () => api.get('/v1/bughunter/history'),
  getBughunterReports: () => api.get('/v1/bughunter/reports'),
};