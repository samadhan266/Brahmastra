import React from 'react';
import { motion } from 'framer-motion';
import { FileText, Download, ExternalLink, AlertTriangle, Shield, Activity } from 'lucide-react';
import type { ScanProgress } from '../../types';

interface ScanResultsProps {
  scan: ScanProgress;
}

const ScanResults: React.FC<ScanResultsProps> = ({ scan }) => {
  const { recon_results, scanner_results, vuln_results, report_path } = scan;

  const getFindingsCount = () => {
    return (vuln_results as any)?.results?.cvss_scoring?.total_findings ?? 0;
  };

  const getCriticalCount = () => {
    return (vuln_results as any)?.results?.cvss_scoring?.critical_count ?? 0;
  };

  const getHighCount = () => {
    return (vuln_results as any)?.results?.cvss_scoring?.high_count ?? 0;
  };

  const getMediumCount = () => {
    return (vuln_results as any)?.results?.cvss_scoring?.medium_count ?? 0;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-6 lg:p-8 w-full max-w-3xl mx-auto"
    >
      <h3 className="text-lg font-bold text-red-100 mb-6">Scan Results</h3>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="clay-sm p-4 rounded-xl text-center">
          <p className="text-2xl font-bold text-red-300">{getFindingsCount()}</p>
          <p className="text-xs text-red-400/60 mt-1">Total Findings</p>
        </div>
        <div className="clay-sm p-4 rounded-xl text-center">
          <p className="text-2xl font-bold text-red-400">{getCriticalCount()}</p>
          <p className="text-xs text-red-400/60 mt-1">Critical</p>
        </div>
        <div className="clay-sm p-4 rounded-xl text-center">
          <p className="text-2xl font-bold text-orange-400">{getHighCount()}</p>
          <p className="text-xs text-red-400/60 mt-1">High</p>
        </div>
        <div className="clay-sm p-4 rounded-xl text-center">
          <p className="text-2xl font-bold text-yellow-400">{getMediumCount()}</p>
          <p className="text-xs text-red-400/60 mt-1">Medium</p>
        </div>
      </div>

      {recon_results && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-blue-400" />
            <h4 className="text-sm font-semibold text-red-200">Reconnaissance</h4>
          </div>
          <p className="text-xs text-red-400/60">
            {(recon_results as any)?.summary || 'Recon completed'}
          </p>
        </div>
      )}

      {scanner_results && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-purple-400" />
            <h4 className="text-sm font-semibold text-red-200">Scanner</h4>
          </div>
          <p className="text-xs text-red-400/60">
            {(scanner_results as any)?.summary || 'Scan completed'}
          </p>
        </div>
      )}

      {vuln_results && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-orange-400" />
            <h4 className="text-sm font-semibold text-red-200">Vulnerability Assessment</h4>
          </div>
          <p className="text-xs text-red-400/60 mb-3">
            {(vuln_results as any)?.summary || 'Assessment completed'}
          </p>

          <div className="space-y-2">
            {((vuln_results as any)?.results?.cvss_scoring?.findings || []).slice(0, 5).map((finding: any, i: number) => (
              <div key={i} className="glass-light p-3 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-red-200">{finding.id}</span>
                  <span className={`text-xs font-bold ${
                    finding.severity === 'CRITICAL' ? 'text-red-400' :
                    finding.severity === 'HIGH' ? 'text-orange-400' :
                    finding.severity === 'MEDIUM' ? 'text-yellow-400' :
                    'text-green-400'
                  }`}>
                    {finding.score} - {finding.severity}
                  </span>
                </div>
                <p className="text-xs text-red-400/50 mt-1">{finding.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {report_path && (
        <a
          href={report_path}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full py-3.5 rounded-xl clay-sm text-red-100 font-semibold
                     flex items-center justify-center gap-2
                     hover:bg-red-800/30 transition-all duration-300 group"
        >
          <Download className="w-4 h-4 group-hover:-translate-y-0.5 transition-transform" />
          Download PDF Report
          <ExternalLink className="w-3 h-3 opacity-50" />
        </a>
      )}
    </motion.div>
  );
};

export default ScanResults;