import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { brahmastraApi } from '../utils/api';

interface ScanCreateRequest {
  target: string;
  mode: string;
  tools?: Record<string, string[]>;
}

interface ScanContextType {
  currentScanId: string | null;
  scans: any[];
  loading: boolean;
  creating: boolean;
  error: string | null;
  fetchScans: () => Promise<void>;
  createAndStartScan: (req: ScanCreateRequest) => Promise<string | null>;
  cancelScan: (scanId: string) => Promise<void>;
  deleteScan: (scanId: string) => Promise<void>;
  clearError: () => void;
}

const ScanContext = createContext<ScanContextType | undefined>(undefined);

export const ScanProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentScanId, setCurrentScanId] = useState<string | null>(null);
  const [scans, setScans] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchScans = useCallback(async () => {
    setLoading(true);
    try {
      const res = await brahmastraApi.listScans();
      setScans(res.data);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch scans');
    } finally {
      setLoading(false);
    }
  }, []);

  const createAndStartScan = useCallback(async (req: ScanCreateRequest): Promise<string | null> => {
    setCreating(true);
    setError(null);
    try {
      const createRes = await brahmastraApi.createScan(req);
      const scanId = createRes.data.id;
      const payload = req.tools || {};
      await brahmastraApi.startScan(scanId, payload);
      setCurrentScanId(scanId);
      fetchScans();
      return scanId;
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Failed to create scan';
      setError(msg);
      return null;
    } finally {
      setCreating(false);
    }
  }, [fetchScans]);

  const cancelScan = useCallback(async (scanId: string) => {
    try {
      await brahmastraApi.cancelScan(scanId);
      fetchScans();
    } catch {}
  }, [fetchScans]);

  const deleteScan = useCallback(async (scanId: string) => {
    try {
      await brahmastraApi.deleteScan(scanId);
      fetchScans();
    } catch {}
  }, [fetchScans]);

  const clearError = useCallback(() => setError(null), []);

  return (
    <ScanContext.Provider value={{
      currentScanId, scans, loading, creating, error,
      fetchScans, createAndStartScan, cancelScan, deleteScan, clearError
    }}>
      {children}
    </ScanContext.Provider>
  );
};

export const useScanContext = () => {
  const ctx = useContext(ScanContext);
  if (!ctx) throw new Error('useScanContext must be used within ScanProvider');
  return ctx;
};