import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bot, Play, Square, Clock, CheckCircle2, XCircle, AlertTriangle,
  Loader2, Trash2, RotateCcw, Linkedin, Globe, ChevronRight,
  Timer, TrendingUp, ListChecks, AlertCircle, RefreshCw, Info,
} from 'lucide-react';
import { api } from '../../services/apiClient';

// ── Types ─────────────────────────────────────────────────────────────────────

type AgentStatus = 'idle' | 'running' | 'stopped';
type QueueStatus = 'queued' | 'processing' | 'applied' | 'failed' | 'skipped' | 'captcha';

interface AgentState {
  status: AgentStatus;
  startedAt: string | null;
  currentJobId: string | null;
  appliedLastHour: number;
  appliedToday: number;
  nextRunAt: string | null;
  lastError: string | null;
}

interface QueueItem {
  id: string;
  job_id: string;
  job_title: string;
  company_name: string;
  source: 'linkedin' | 'indeed';
  status: QueueStatus;
  priority: number;
  queued_at: string;
  applied_at: string | null;
  failed_at: string | null;
  error_message: string | null;
  notes: string | null;
}

interface QueueStats {
  appliedLastHour: number;
  appliedToday: number;
  byStatus: Record<string, number>;
}

// ── Status helpers ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<QueueStatus, { label: string; icon: React.FC<any>; cls: string }> = {
  queued:     { label: 'Queued',      icon: Clock,         cls: 'text-blue-600 bg-blue-50 ring-blue-200' },
  processing: { label: 'Processing',  icon: Loader2,       cls: 'text-amber-600 bg-amber-50 ring-amber-200' },
  applied:    { label: 'Applied',     icon: CheckCircle2,  cls: 'text-emerald-600 bg-emerald-50 ring-emerald-200' },
  failed:     { label: 'Failed',      icon: XCircle,       cls: 'text-red-600 bg-red-50 ring-red-200' },
  skipped:    { label: 'Skipped',     icon: AlertTriangle, cls: 'text-slate-500 bg-slate-100 ring-slate-200' },
  captcha:    { label: 'CAPTCHA',     icon: AlertCircle,   cls: 'text-orange-600 bg-orange-50 ring-orange-200' },
};

function StatusBadge({ status }: { status: QueueStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.skipped;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ring-1 ${cfg.cls}`}>
      <Icon className={`w-2.5 h-2.5 ${status === 'processing' ? 'animate-spin' : ''}`} />
      {cfg.label}
    </span>
  );
}

function PlatformBadge({ source }: { source: string }) {
  if (source === 'linkedin') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-600 text-white rounded text-[10px] font-bold">
        <Linkedin className="w-2.5 h-2.5" /> LinkedIn
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-600 text-white rounded text-[10px] font-bold">
      <Globe className="w-2.5 h-2.5" /> Indeed
    </span>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon: Icon, color,
}: {
  label: string; value: number | string; sub?: string;
  icon: React.FC<any>; color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-start gap-3">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-4.5 h-4.5" />
      </div>
      <div>
        <p className="text-xl font-black text-slate-900 leading-none">{value}</p>
        <p className="text-xs font-semibold text-slate-600 mt-0.5">{label}</p>
        {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export const ApplicationQueue: React.FC = () => {
  const [agent, setAgent]   = useState<AgentState | null>(null);
  const [queue, setQueue]   = useState<QueueItem[]>([]);
  const [stats, setStats]   = useState<QueueStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [agentLoading, setAgentLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<QueueStatus | 'all'>('all');
  const [confirmClear, setConfirmClear] = useState(false);

  // ── Fetch data ──────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    try {
      const [agentRes, queueRes, statsRes] = await Promise.all([
        api('/api/agent/status'),
        api('/api/application-queue'),
        api('/api/application-queue/stats'),
      ]);
      if (agentRes.ok)  setAgent(await agentRes.json());
      if (queueRes.ok)  setQueue(await queueRes.json());
      if (statsRes.ok)  setStats(await statsRes.json());
    } catch (err) {
      console.warn('[ApplicationQueue] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const iv = setInterval(fetchAll, 8000); // poll every 8s
    return () => clearInterval(iv);
  }, [fetchAll]);

  // ── Agent controls ──────────────────────────────────────────────────────────

  const startAgent = async () => {
    setAgentLoading(true);
    try {
      const r = await api('/api/agent/start', { method: 'POST' });
      if (r.ok) await fetchAll();
    } finally { setAgentLoading(false); }
  };

  const stopAgent = async () => {
    setAgentLoading(true);
    try {
      const r = await api('/api/agent/stop', { method: 'POST' });
      if (r.ok) await fetchAll();
    } finally { setAgentLoading(false); }
  };

  // ── Queue actions ──────────────────────────────────────────────────────────

  const removeItem = async (id: string) => {
    await api(`/api/application-queue/${id}`, { method: 'DELETE' });
    setQueue(prev => prev.filter(i => i.id !== id));
  };

  const retryItem = async (id: string) => {
    const r = await api(`/api/application-queue/${id}/retry`, { method: 'PATCH' });
    if (r.ok) await fetchAll();
  };

  const clearQueue = async () => {
    await api('/api/application-queue/clear', { method: 'DELETE' });
    setConfirmClear(false);
    await fetchAll();
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const isRunning  = agent?.status === 'running';
  const filtered   = statusFilter === 'all'
    ? queue
    : queue.filter(i => i.status === statusFilter);

  const isBusinessHours = (() => {
    const h = new Date().getHours();
    return h >= 9 && h < 17;
  })();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-lime-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Application Agent</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Automatically applies to LinkedIn and Indeed vacancies · max. {stats ? 8 : '—'}/hr
          </p>
        </div>
        <button
          onClick={fetchAll}
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-600"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* ── Agent control card ─────────────────────────────────────────────── */}
      <div className={`rounded-2xl border-2 p-5 ${
        isRunning
          ? 'bg-emerald-50 border-emerald-200'
          : 'bg-white border-slate-200'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Status dot */}
            <div className={`relative w-12 h-12 rounded-xl flex items-center justify-center ${
              isRunning ? 'bg-emerald-100' : 'bg-slate-100'
            }`}>
              <Bot className={`w-6 h-6 ${isRunning ? 'text-emerald-600' : 'text-slate-400'}`} />
              {isRunning && (
                <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white animate-pulse" />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900">
                  {isRunning ? 'Agent running' : agent?.status === 'stopped' ? 'Agent stopped' : 'Agent idle'}
                </h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  isRunning
                    ? 'bg-emerald-200 text-emerald-800'
                    : 'bg-slate-200 text-slate-600'
                }`}>
                  {isRunning ? 'RUNNING' : 'STOPPED'}
                </span>
              </div>

              <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                {/* Business hours */}
                <span className={`flex items-center gap-1 ${isBusinessHours ? 'text-emerald-600' : 'text-amber-600'}`}>
                  <Timer className="w-3 h-3" />
                  {isBusinessHours ? 'Business hours active (9am–5pm)' : 'Outside business hours'}
                </span>

                {/* Rate limit */}
                {stats && (
                  <span className="flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    {stats.appliedLastHour}/8 applications this hour
                  </span>
                )}

                {/* Next run */}
                {agent?.nextRunAt && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Next: {new Date(agent.nextRunAt).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>

              {/* Error message */}
              {agent?.lastError && (
                <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                  <XCircle className="w-3 h-3" />
                  {agent.lastError}
                </p>
              )}
            </div>
          </div>

          {/* Start / Stop button */}
          <button
            onClick={isRunning ? stopAgent : startAgent}
            disabled={agentLoading}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 ${
              isRunning
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-lime-600 hover:bg-lime-700 text-white'
            }`}
          >
            {agentLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isRunning ? (
              <><Square className="w-4 h-4" /> Stop</>
            ) : (
              <><Play className="w-4 h-4" /> Start Agent</>
            )}
          </button>
        </div>

        {/* Rules reminder */}
        <div className="mt-4 pt-4 border-t border-slate-200/60 flex items-start gap-2">
          <Info className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-slate-400 leading-relaxed">
            The agent only operates from <strong>9am to 5pm (Toronto)</strong>,
            applies to a max. of <strong>8 vacancies per hour</strong>,
            and waits <strong>2–8 random minutes</strong> between each application to simulate human behavior.
            LinkedIn and Indeed must have an active session in Chrome.
          </p>
        </div>
      </div>

      {/* ── Stats row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Applied today"
          value={stats?.appliedToday ?? 0}
          icon={CheckCircle2}
          color="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          label="This hour"
          value={`${stats?.appliedLastHour ?? 0}/8`}
          sub="Rate limit"
          icon={TrendingUp}
          color="bg-blue-50 text-blue-600"
        />
        <StatCard
          label="Queued"
          value={stats?.byStatus?.['queued'] ?? 0}
          icon={ListChecks}
          color="bg-lime-50 text-lime-600"
        />
        <StatCard
          label="Failed"
          value={(stats?.byStatus?.['failed'] ?? 0) + (stats?.byStatus?.['captcha'] ?? 0)}
          sub="Need attention"
          icon={AlertTriangle}
          color="bg-red-50 text-red-500"
        />
      </div>

      {/* ── Queue table ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {/* Table header + filters */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {(['all', 'queued', 'processing', 'applied', 'failed', 'captcha', 'skipped'] as const).map(s => {
              const count = s === 'all'
                ? queue.length
                : queue.filter(i => i.status === s).length;
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    statusFilter === s
                      ? 'bg-lime-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {s === 'all' ? 'All' : STATUS_CONFIG[s as QueueStatus]?.label ?? s}
                  <span className="ml-1 opacity-70">{count}</span>
                </button>
              );
            })}
          </div>

          {queue.some(i => ['applied', 'skipped', 'failed'].includes(i.status)) && (
            confirmClear ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Clear completed?</span>
                <button onClick={clearQueue} className="px-2.5 py-1 bg-red-600 text-white rounded-lg text-xs font-semibold">Yes</button>
                <button onClick={() => setConfirmClear(false)} className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-semibold">No</button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmClear(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" /> Clear completed
              </button>
            )
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <ListChecks className="w-12 h-12 mb-3 opacity-30" />
            <p className="font-medium text-sm">Queue empty</p>
            <p className="text-xs mt-1">
              {statusFilter === 'all'
                ? 'Open a vacancy and use "Add to queue" for the agent to apply.'
                : `No vacancies with status "${STATUS_CONFIG[statusFilter as QueueStatus]?.label}".`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <th className="px-5 py-3 text-left">Vacancy</th>
                  <th className="px-3 py-3 text-left">Platform</th>
                  <th className="px-3 py-3 text-left">Status</th>
                  <th className="px-3 py-3 text-left">Priority</th>
                  <th className="px-3 py-3 text-left">Date</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {filtered.map(item => (
                    <motion.tr
                      key={item.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="border-b border-slate-50 hover:bg-slate-50 transition-colors group"
                    >
                      <td className="px-5 py-3">
                        <p className="font-semibold text-slate-900 text-sm leading-tight truncate max-w-[220px]">
                          {item.job_title}
                        </p>
                        <p className="text-xs text-slate-400 truncate max-w-[220px]">{item.company_name}</p>
                        {item.notes && (
                          <p className="text-[10px] text-slate-400 mt-0.5 italic truncate max-w-[220px]">{item.notes}</p>
                        )}
                        {item.error_message && (
                          <p className="text-[10px] text-red-500 mt-0.5 truncate max-w-[220px]">{item.error_message}</p>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <PlatformBadge source={item.source} />
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={item.status} />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3].map(n => (
                            <div
                              key={n}
                              className={`w-1.5 h-3 rounded-sm ${
                                item.priority >= n * 3
                                  ? 'bg-lime-500'
                                  : item.priority >= n * 2
                                  ? 'bg-lime-300'
                                  : 'bg-slate-200'
                              }`}
                            />
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-400 whitespace-nowrap">
                        {item.applied_at
                          ? new Date(item.applied_at).toLocaleString('en', { dateStyle: 'short', timeStyle: 'short' })
                          : new Date(item.queued_at).toLocaleString('en', { dateStyle: 'short', timeStyle: 'short' })
                        }
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {['failed', 'captcha', 'skipped'].includes(item.status) && (
                            <button
                              onClick={() => retryItem(item.id)}
                              className="p-1.5 hover:bg-blue-50 text-blue-500 rounded-lg transition-colors"
                              title="Retry"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => removeItem(item.id)}
                            className="p-1.5 hover:bg-red-50 text-red-400 rounded-lg transition-colors"
                            title="Remove from queue"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Processed count */}
      {queue.length > 0 && (
        <p className="text-xs text-slate-400 text-center">
          {queue.length} total entries ·{' '}
          {queue.filter(i => i.status === 'applied').length} applied ·{' '}
          {queue.filter(i => i.status === 'queued').length} pending
        </p>
      )}
    </div>
  );
};
