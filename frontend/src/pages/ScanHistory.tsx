import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { History, Target, Download, XCircle, ArrowLeft, Clock, Trash2, Pause, Play, AlertTriangle, FileText } from 'lucide-react';
import { useScanContext } from '../context/ScanContext';
import { brahmastraApi } from '../utils/api';
import toast from 'react-hot-toast';

interface ScanHistoryProps {
  onBack: () => void;
}

const statusColors: Record<string, string> = {
  completed: 'text-green-400 border-green-500/30',
  failed: 'text-red-400 border-red-500/30',
  pending: 'text-yellow-400 border-yellow-500/30',
  paused: 'text-amber-400 border-amber-500/30',
  recon_running: 'text-cyan-400 border-cyan-500/30',
  scanner_running: 'text-purple-400 border-purple-500/30',
  vuln_running: 'text-orange-400 border-orange-500/30',
  report_running: 'text-blue-400 border-blue-500/30',
};

const ScanHistory: React.FC<ScanHistoryProps> = ({ onBack }) => {
  const { scans, loading, fetchScans, cancelScan, deleteScan } = useScanContext();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [techEntries, setTechEntries] = useState<any[]>([]);

  useEffect(() => {
    fetchScans();
    const interval = setInterval(fetchScans, 5000);
    return () => clearInterval(interval);
  }, [fetchScans]);

  const fetchTechHistory = async () => {
    try {
      const res = await brahmastraApi.getBughunterHistory();
      setTechEntries(res.data?.entries || []);
    } catch { /* backend offline — leave as-is */ }
  };

  useEffect(() => {
    fetchTechHistory();
    const interval = setInterval(fetchTechHistory, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleDownload = async (scanId: string) => {
    try {
      const res = await brahmastraApi.getScanStatus(scanId);
      const reportPath = res.data.report_path;
      if (reportPath) {
        const filename = reportPath.split('/').pop() || reportPath;
        window.open(`/reports/${filename}`, '_blank');
      } else {
        toast.error('Report not available — no findings to report');
      }
    } catch { toast.error('Failed'); }
  };

  const handleCancel = async (scanId: string) => {
    await cancelScan(scanId);
    toast.success('Scan cancelled');
  };

  const handleDelete = async (scanId: string) => {
    await deleteScan(scanId);
    setConfirmDelete(null);
    toast.success('Scan deleted');
  };

  const handlePause = async (scanId: string) => {
    try {
      await brahmastraApi.pauseScan(scanId);
      fetchScans();
      toast.success('Scan paused');
    } catch { toast.error('Cannot pause scan'); }
  };

  const handleResume = async (scanId: string) => {
    try {
      await brahmastraApi.resumeScan(scanId);
      fetchScans();
      toast.success('Scan resumed');
    } catch { toast.error('Cannot resume scan'); }
  };

  const isRunning = (status: string) => status?.includes('running') || status === 'pending';
  const isPaused = (status: string) => status === 'paused';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-lg neon-btn">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <History className="w-6 h-6 text-red-400" />
        <h1 className="text-xl font-bold text-red-100 glitch-text">SCAN HISTORY</h1>
      </div>

      {loading && scans.length === 0 ? (
        <div className="cyber-card rounded-xl p-12 text-center">
          <div className="w-8 h-8 border-2 border-cyan-400/50 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm font-mono text-gray-500">Loading...</p>
        </div>
      ) : scans.length === 0 ? (
        <div className="cyber-card rounded-xl p-12 text-center">
          <Clock className="w-12 h-12 text-red-500/20 mx-auto mb-4" />
          <p className="text-sm font-mono text-gray-500">No scans yet. Launch from dashboard.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {scans.map((scan: any) => (
            <motion.div key={scan.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                        className={`cyber-card rounded-xl p-5 border ${statusColors[scan.status] || 'border-red-900/20'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${
                    scan.status === 'completed' ? 'bg-green-400 shadow-lg shadow-green-400/30' :
                    scan.status === 'failed' ? 'bg-red-400' :
                    scan.status === 'pending' ? 'bg-yellow-400' :
                    scan.status === 'paused' ? 'bg-amber-400' :
                    'bg-cyan-400 animate-pulse'
                  }`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-red-400" />
                      <span className="text-base font-mono font-bold text-gray-200">{scan.target}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs font-mono text-red-400/40 uppercase">{scan.mode}</span>
                      <span className={`text-xs font-mono capitalize ${
                        scan.status === 'completed' ? 'text-green-400' :
                        scan.status === 'failed' ? 'text-red-400' :
                        scan.status === 'paused' ? 'text-amber-400' :
                        'text-cyan-400'
                      }`}>{scan.status.replace(/_/g, ' ')}</span>
                      <span className="text-xs font-mono text-gray-600">{scan.created_at ? new Date(scan.created_at).toLocaleString() : ''}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-24 bg-black/60 rounded-full h-1.5">
                    <div className="h-full rounded-full bg-gradient-to-r from-red-600 to-cyan-400 transition-all"
                         style={{ width: `${scan.progress}%` }} />
                  </div>
                  <span className="text-xs font-mono text-gray-500 w-8 text-right">{scan.progress}%</span>

                  {/* Download — only when report exists */}
                  {scan.report_path ? (
                    <button onClick={() => handleDownload(scan.id)}
                            className="p-2 rounded bg-black/40 hover:bg-green-900/20 transition-all border border-green-900/20"
                            title="Download Report">
                      <Download className="w-4 h-4 text-green-400" />
                    </button>
                  ) : (
                    <div className="p-2 rounded bg-black/40 border border-gray-800/20" title="No report">
                      <Download className="w-4 h-4 text-gray-700" />
                    </div>
                  )}

                  {/* Pause / Resume */}
                  {isRunning(scan.status) && (
                    <button onClick={() => handlePause(scan.id)}
                            className="p-2 rounded bg-black/40 hover:bg-amber-900/20 transition-all border border-amber-900/20"
                            title="Pause scan">
                      <Pause className="w-4 h-4 text-amber-400" />
                    </button>
                  )}
                  {isPaused(scan.status) && (
                    <button onClick={() => handleResume(scan.id)}
                            className="p-2 rounded bg-black/40 hover:bg-cyan-900/20 transition-all border border-cyan-900/20"
                            title="Resume scan">
                      <Play className="w-4 h-4 text-cyan-400" />
                    </button>
                  )}

                  {/* Cancel — only for running scans */}
                  {isRunning(scan.status) && (
                    <button onClick={() => handleCancel(scan.id)}
                            className="p-2 rounded bg-black/40 hover:bg-red-900/20 transition-all border border-red-900/20"
                            title="Cancel scan">
                      <XCircle className="w-4 h-4 text-red-400" />
                    </button>
                  )}

                  {/* Delete — with confirmation */}
                  {confirmDelete === scan.id ? (
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleDelete(scan.id)}
                              className="px-2 py-1 rounded bg-red-900/40 border border-red-500/40 text-red-300 text-[10px] font-mono hover:bg-red-900/60 transition-all">
                        YES
                      </button>
                      <button onClick={() => setConfirmDelete(null)}
                              className="px-2 py-1 rounded bg-black/40 border border-gray-700 text-gray-400 text-[10px] font-mono hover:bg-black/60 transition-all">
                        NO
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDelete(scan.id)}
                            className="p-2 rounded bg-black/40 hover:bg-red-900/20 transition-all border border-red-900/20"
                            title="Delete scan">
                      <Trash2 className="w-4 h-4 text-red-400/60 hover:text-red-400" />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* ─── TECHNIQUE REPORTS (BugHunter runs, incl. cancelled) ─── */}
      <div className="flex items-center gap-2 pt-4">
        <FileText className="w-5 h-5 text-cyan-400" />
        <h2 className="text-lg font-bold text-cyan-100 glitch-text">TECHNIQUE REPORTS</h2>
        <span className="text-xs font-mono text-gray-600">({techEntries.length} run{techEntries.length === 1 ? '' : 's'})</span>
      </div>

      {techEntries.length === 0 ? (
        <div className="cyber-card rounded-xl p-6 text-center">
          <p className="text-xs font-mono text-gray-600">
            No technique runs yet — BugHunter skill results (including cancelled runs) appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(
            techEntries.reduce<Record<string, any[]>>((acc, e) => {
              (acc[e.target] = acc[e.target] || []).push(e);
              return acc;
            }, {})
          ).map(([target, entries]) => (
            <div key={target} className="cyber-card rounded-xl p-4 border border-cyan-900/20">
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-4 h-4 text-cyan-400" />
                <span className="font-mono font-bold text-gray-200">{target}</span>
                <span className="text-xs font-mono text-gray-600">{entries.length} run{entries.length === 1 ? '' : 's'}</span>
              </div>
              <div className="space-y-2">
                {entries.map((e: any) => (
                  <div key={e.exec_id}
                       className="flex items-center justify-between gap-3 bg-black/40 rounded-lg px-3 py-2 border border-gray-800/40">
                    <div className="min-w-0">
                      <div className="text-sm font-mono text-gray-300 truncate">{e.skill_name}</div>
                      <div className="text-[11px] font-mono text-gray-600">
                        {e.timestamp} ·{' '}
                        <span className={e.status === 'completed' ? 'text-green-400' : 'text-amber-400'}>
                          {e.status}
                        </span>
                        {' · '}{e.finding_count} finding{e.finding_count === 1 ? '' : 's'}
                        {typeof e.commands_ok === 'number'
                          ? ` · ${e.commands_ok}/${e.commands_total} cmds`
                          : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {['md', 'html', 'pdf'].map((fmt) => (
                        <button key={fmt}
                                onClick={() => window.open(`/api/v1/bughunter/report/${e.exec_id}/${fmt}`, '_blank')}
                                className="px-2 py-1 rounded bg-black/40 hover:bg-cyan-900/20 border border-cyan-900/30 text-cyan-300 text-[10px] font-mono uppercase transition-all"
                                title={`Download ${fmt.toUpperCase()} report`}>
                          {fmt}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
};

export default ScanHistory;
