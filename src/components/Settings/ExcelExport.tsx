import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileSpreadsheet, UploadCloud, RefreshCw, CheckCircle2,
  AlertCircle, Loader2, Database, FileCheck, Clock, Zap,
  HardDrive, Globe, Layers, ExternalLink, ChevronDown, ChevronUp,
} from 'lucide-react';
import { api } from '../../services/apiClient';

interface ExportStatusResponse {
  success: boolean;
  target: string;           // 'excel' | 'sheets' | 'both'
  running: boolean;
  pendingFlush: boolean;
  sheetsConfigured: boolean;
  stats: {
    pending: string;
    exported_excel: string;
    exported_sheets: string;
    last_exported_at: string | null;
  };
}

function fmtDate(iso: string | null) {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' });
}
function timeDiff(iso: string | null) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return '· just now';
  if (m < 60) return `· ${m}m ago`;
  const h = Math.floor(m / 60);
  return `· ${h}h ${m % 60}m ago`;
}

const TARGET_OPTIONS = [
  { value: 'excel',  label: 'Excel / OneDrive',     icon: HardDrive, desc: 'Local file synced via OneDrive or Google Drive for Desktop' },
  { value: 'sheets', label: 'Google Sheets',          icon: Globe,     desc: 'Direct cloud write via Google Sheets API' },
  { value: 'both',   label: 'Both simultaneously',   icon: Layers,    desc: 'Writes to both destinations at once' },
];

export const ExcelExport: React.FC = () => {
  const [status, setStatus]         = useState<ExportStatusResponse | null>(null);
  const [loading, setLoading]       = useState(true);
  const [running, setRunning]       = useState(false);
  const [testingSheets, setTesting] = useState(false);
  const [toast, setToast]           = useState<{ msg: string; ok: boolean } | null>(null);
  const [showSetup, setShowSetup]   = useState(false);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 5000);
  };

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api('/api/export/auto-status');
      if (res.ok) setStatus(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    fetchStatus().finally(() => setLoading(false));
    const t = setInterval(fetchStatus, 6000);
    return () => clearInterval(t);
  }, [fetchStatus]);

  async function runNow() {
    setRunning(true);
    try {
      const res  = await api('/api/export/run-now', { method: 'POST' });
      const data = await res.json();
      showToast(data.message, data.success);
      setTimeout(fetchStatus, 2000);
    } catch { showToast('Connection error', false); }
    finally { setTimeout(() => setRunning(false), 1500); }
  }

  async function testSheets() {
    setTesting(true);
    try {
      const res  = await api('/api/export/test-sheets', { method: 'POST' });
      const data = await res.json();
      showToast(data.message, data.success);
    } catch { showToast('Connection error', false); }
    finally { setTesting(false); }
  }

  const pending       = parseInt(status?.stats.pending         ?? '0', 10);
  const expExcel      = parseInt(status?.stats.exported_excel  ?? '0', 10);
  const expSheets     = parseInt(status?.stats.exported_sheets ?? '0', 10);
  const isRunning     = status?.running || running;
  const isQueued      = status?.pendingFlush && !isRunning;
  const target        = status?.target ?? 'excel';
  const sheetsOk      = status?.sheetsConfigured ?? false;
  const showExcel     = target === 'excel' || target === 'both';
  const showSheets    = target === 'sheets' || target === 'both';

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-6 h-6 animate-spin text-lime-600" />
    </div>
  );

  return (
    <div className="space-y-5 max-w-2xl">

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium shadow-sm ${
              toast.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                       : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            {toast.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center shrink-0 shadow-sm">
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div>
            <p className="text-xl font-bold text-slate-900 leading-none">{pending.toLocaleString()}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Pending export</p>
          </div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center shrink-0 shadow-sm">
            <Database className="w-4 h-4 text-slate-600" />
          </div>
          <div>
            <p className="text-xl font-bold text-slate-900 leading-none">{(pending + Math.max(expExcel, expSheets)).toLocaleString()}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Total companies</p>
          </div>
        </div>
        {showExcel && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center shrink-0 shadow-sm">
              <FileCheck className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-slate-900 leading-none">{expExcel.toLocaleString()}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Exported → Excel</p>
            </div>
          </div>
        )}
        {showSheets && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center shrink-0 shadow-sm">
              <Globe className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-slate-900 leading-none">{expSheets.toLocaleString()}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Exported → Sheets</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Main card ── */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-lime-50 rounded-xl flex items-center justify-center ring-1 ring-lime-200">
            <FileSpreadsheet className="w-5 h-5 text-lime-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-slate-900">Automatic Export</h3>
            <p className="text-xs text-slate-500">Triggers automatically when a company is enriched by AI</p>
          </div>
          {isRunning ? (
            <span className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-full text-xs font-semibold text-blue-700 shrink-0">
              <Loader2 className="w-3 h-3 animate-spin" /> Writing…
            </span>
          ) : isQueued ? (
            <span className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-full text-xs font-semibold text-amber-700 shrink-0">
              <Clock className="w-3 h-3" /> Queued (10s)
            </span>
          ) : (
            <span className="flex items-center gap-1.5 px-2.5 py-1 bg-lime-50 border border-lime-200 rounded-full text-xs font-semibold text-lime-700 shrink-0">
              <Zap className="w-3 h-3" /> Always on
            </span>
          )}
        </div>

        {/* Active destination badges */}
        <div className="flex gap-2 flex-wrap">
          {TARGET_OPTIONS.filter(o => target === 'both' || o.value === target).map(opt => {
            const Icon = opt.icon;
            const isSheetsMissing = opt.value === 'sheets' && !sheetsOk;
            return (
              <div key={opt.value}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border ${
                  isSheetsMissing
                    ? 'bg-red-50 border-red-200 text-red-700'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {opt.label}
                {isSheetsMissing && <span className="text-[10px] font-bold text-red-500">· not configured</span>}
              </div>
            );
          })}
        </div>

        {/* Last export */}
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          Last export: <span className="font-semibold text-slate-700">{fmtDate(status?.stats.last_exported_at ?? null)}</span>
          <span className="text-slate-400">{timeDiff(status?.stats.last_exported_at ?? null)}</span>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-3 pt-1 border-t border-slate-100">
          <button
            onClick={runNow}
            disabled={isRunning || pending === 0}
            title={pending === 0 ? 'No companies pending' : undefined}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-lime-600 text-white hover:bg-lime-700 transition-all disabled:opacity-40 shadow-sm"
          >
            {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
            Export now
            {pending > 0 && <span className="bg-white/30 rounded-full px-1.5 text-[10px] font-bold">{pending}</span>}
          </button>
          <button onClick={fetchStatus} className="p-2.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Configuration ── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <button
          onClick={() => setShowSetup(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <span>Configuration &amp; Setup</span>
          {showSetup ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        <AnimatePresence>
          {showSetup && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} className="overflow-hidden"
            >
              <div className="px-5 pb-5 space-y-5 border-t border-slate-100">

                {/* EXPORT_TARGET selector */}
                <div className="pt-4 space-y-2">
                  <p className="text-xs font-bold text-slate-500 uppercase">Destination (set in .env)</p>
                  <div className="grid grid-cols-1 gap-2">
                    {TARGET_OPTIONS.map(opt => {
                      const Icon = opt.icon;
                      const isActive = target === opt.value;
                      return (
                        <div key={opt.value} className={`flex items-center gap-3 p-3 rounded-xl border text-sm ${
                          isActive ? 'bg-lime-50 border-lime-300' : 'bg-slate-50 border-slate-200'
                        }`}>
                          <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-lime-600' : 'text-slate-400'}`} />
                          <div className="flex-1 min-w-0">
                            <span className={`font-semibold ${isActive ? 'text-lime-800' : 'text-slate-700'}`}>{opt.label}</span>
                            <p className="text-[11px] text-slate-500">{opt.desc}</p>
                          </div>
                          {isActive && <span className="text-[10px] font-bold text-lime-600 bg-lime-100 px-2 py-0.5 rounded-full">ACTIVE</span>}
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2 p-3 bg-slate-900 rounded-lg text-xs font-mono text-slate-300 leading-relaxed">
                    <span className="text-slate-500"># .env</span><br />
                    <span className="text-lime-400">EXPORT_TARGET</span>=<span className="text-amber-300">excel</span>
                    <span className="text-slate-500">  # or: sheets | both</span>
                  </div>
                </div>

                {/* OneDrive / Google Drive for Desktop */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-slate-500" />
                    <p className="text-xs font-bold text-slate-500 uppercase">Excel via OneDrive / Google Drive for Desktop</p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2 text-slate-600">
                    <p>✅ <strong>Already working</strong> — your file is in OneDrive and syncs automatically.</p>
                    <p>To use Google Drive for Desktop instead, install it and change <code className="bg-slate-200 px-1 rounded">EXCEL_PATH</code> to the local Google Drive folder:</p>
                    <div className="p-2 bg-slate-900 rounded-lg font-mono text-slate-300">
                      <span className="text-lime-400">EXCEL_PATH</span>=<span className="text-amber-300">G:\My Drive\companies.xlsx</span>
                    </div>
                  </div>
                </div>

                {/* Google Sheets */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-blue-500" />
                    <p className="text-xs font-bold text-slate-500 uppercase">Google Sheets API</p>
                    {sheetsOk
                      ? <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Configured</span>
                      : <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Not configured</span>
                    }
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-3 text-slate-600">
                    <div className="space-y-1">
                      <p className="font-semibold text-slate-700">Step 1 — Create a Service Account</p>
                      <ol className="list-decimal list-inside space-y-0.5 text-slate-500">
                        <li>Go to <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" className="text-blue-600 underline inline-flex items-center gap-0.5">console.cloud.google.com <ExternalLink className="w-2.5 h-2.5" /></a></li>
                        <li>Create a project → enable <strong>Google Sheets API</strong></li>
                        <li>IAM &amp; Admin → Service Accounts → Create → download JSON key</li>
                      </ol>
                    </div>
                    <div className="space-y-1">
                      <p className="font-semibold text-slate-700">Step 2 — Share your Sheet</p>
                      <p className="text-slate-500">Open your Google Sheet → Share → paste the service account email (ends in <code className="bg-slate-200 px-1 rounded">@...iam.gserviceaccount.com</code>) → Editor access.</p>
                    </div>
                    <div className="space-y-1">
                      <p className="font-semibold text-slate-700">Step 3 — Configure .env</p>
                      <div className="p-2 bg-slate-900 rounded-lg font-mono text-slate-300 leading-relaxed">
                        <span className="text-lime-400">EXPORT_TARGET</span>=<span className="text-amber-300">sheets</span><br />
                        <span className="text-lime-400">GOOGLE_SHEETS_ID</span>=<span className="text-amber-300">1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms</span><br />
                        <span className="text-lime-400">GOOGLE_SERVICE_ACCOUNT_KEY_PATH</span>=<span className="text-amber-300">C:\keys\service-account.json</span>
                      </div>
                      <p className="text-slate-500">The Sheet ID is the long string in the URL: <code className="bg-slate-200 px-1 rounded">/spreadsheets/d/<strong>ID_HERE</strong>/edit</code></p>
                    </div>
                    <div className="space-y-1">
                      <p className="font-semibold text-slate-700">Step 4 — Test the connection</p>
                      <button
                        onClick={testSheets}
                        disabled={testingSheets || !sheetsOk}
                        title={!sheetsOk ? 'Configure GOOGLE_SHEETS_ID and GOOGLE_SERVICE_ACCOUNT_KEY_PATH first' : undefined}
                        className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-40 transition-all"
                      >
                        {testingSheets ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
                        Test Google Sheets connection
                      </button>
                    </div>
                  </div>
                </div>

              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── How it works ── */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 space-y-2">
        <p className="font-bold uppercase text-[10px] text-blue-500">How it works (fully automatic)</p>
        <div className="space-y-1.5">
          {[
            'A company finishes AI enrichment → status becomes scraped or db_matched.',
            'Server schedules a write within 10 seconds, batching all enrichments in that window.',
            'Deduplication by name + phone + domain — only truly new companies are added.',
            'Closed Google Maps companies are highlighted in red.',
            'Each company is stamped in the DB so it never gets exported twice.',
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="w-4 h-4 bg-blue-200 text-blue-700 rounded-full text-[9px] flex items-center justify-center shrink-0 mt-0.5 font-bold">{i + 1}</span>
              <span>{step}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
