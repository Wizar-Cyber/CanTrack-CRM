import React, { useEffect, useState } from 'react';
import {
  Building2, Mail, MapPin, Users, Send, ShieldOff,
  Zap, TrendingUp, Clock, CheckCircle, AlertCircle, Loader2,
} from 'lucide-react';
import { apiJson } from '../../services/apiClient';
import { TIPO_CONFIG } from '../../utils/tipo';
import { DashboardStats } from '../../types';

interface DashboardProps {
  stats: DashboardStats;
}

interface DashboardData {
  companies: {
    ontario_total: number; quebec_total: number;
    ontario_active: number; quebec_active: number;
    ontario_with_email: number; quebec_with_email: number;
    ontario_geocoded: number; quebec_geocoded: number;
    ontario_blocked: number; quebec_blocked: number;
    ontario_pending_geo: number; quebec_pending_geo: number;
  };
  campaigns: {
    total_sent: number;
    sent_last_30d: number;
    sent_last_7d: number;
    unique_companies: number;
    last_sent_at: string | null;
  };
  recent: Array<{
    id: string; nombre: string; correo: string | null;
    work: string | null; ciudad: string | null; region: string; created_at: string;
  }>;
  suppression: { total: number };
  automation: { auto_enabled: boolean; auto_last_run_at: string | null };
  enrichment: { pending: number; done: number };
}

function pct(n: number, total: number) {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-CA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtRelative(d: string | null) {
  if (!d) return '—';
  const diff = Math.round((Date.now() - new Date(d).getTime()) / 86_400_000);
  if (diff === 0) return 'hoy';
  if (diff === 1) return 'ayer';
  return `hace ${diff}d`;
}

export const Dashboard: React.FC<DashboardProps> = ({ stats }) => {
  const [data, setData]       = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    apiJson<DashboardData>('/api/dashboard')
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const totalCompanies  = (data?.companies.ontario_total  ?? 0) + (data?.companies.quebec_total  ?? 0);
  const totalActive     = (data?.companies.ontario_active ?? 0) + (data?.companies.quebec_active ?? 0);
  const totalWithEmail  = (data?.companies.ontario_with_email ?? 0) + (data?.companies.quebec_with_email ?? 0);
  const totalGeocoded   = (data?.companies.ontario_geocoded ?? 0) + (data?.companies.quebec_geocoded ?? 0);
  const totalBlocked    = (data?.companies.ontario_blocked  ?? 0) + (data?.companies.quebec_blocked  ?? 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Dashboard</h2>
        <p className="text-slate-500 text-sm mt-0.5">Operational overview in real time</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      ) : data && (
        <>
          {/* ── Fila 1: métricas principales ─────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total companies */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 bg-blue-50 rounded-lg"><Building2 className="w-4 h-4 text-blue-600" /></div>
                <span className="text-xs font-medium text-slate-500">Database</span>
              </div>
              <p className="text-3xl font-bold text-slate-900">{totalCompanies.toLocaleString()}</p>
              <p className="text-xs text-slate-400 mt-1">total companies</p>
              <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between text-xs text-slate-500">
                <span>🍁 Ontario <strong className="text-slate-800">{data.companies.ontario_total.toLocaleString()}</strong></span>
                <span>❄️ Quebec <strong className="text-slate-800">{data.companies.quebec_total.toLocaleString()}</strong></span>
              </div>
            </div>

            {/* Reachable emails */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 bg-green-50 rounded-lg"><Mail className="w-4 h-4 text-green-600" /></div>
                <span className="text-xs font-medium text-slate-500">With valid email</span>
              </div>
              <p className="text-3xl font-bold text-slate-900">{totalWithEmail.toLocaleString()}</p>
              <p className="text-xs text-slate-400 mt-1">{pct(totalWithEmail, totalCompanies)}% of total reachable</p>
              <div className="mt-3 pt-3 border-t border-slate-100">
                <div className="w-full bg-slate-100 rounded-full h-1.5">
                  <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${pct(totalWithEmail, totalCompanies)}%` }} />
                </div>
                <p className="text-xs text-red-400 mt-1.5">{totalBlocked} bounced / blocked</p>
              </div>
            </div>

            {/* Geocoded */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 bg-amber-50 rounded-lg"><MapPin className="w-4 h-4 text-amber-600" /></div>
                <span className="text-xs font-medium text-slate-500">Geocoded</span>
              </div>
              <p className="text-3xl font-bold text-slate-900">{totalGeocoded.toLocaleString()}</p>
              <p className="text-xs text-slate-400 mt-1">{pct(totalGeocoded, totalCompanies)}% with GPS coordinates</p>
              <div className="mt-3 pt-3 border-t border-slate-100">
                <div className="w-full bg-slate-100 rounded-full h-1.5">
                  <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: `${pct(totalGeocoded, totalCompanies)}%` }} />
                </div>
                <p className="text-xs text-slate-400 mt-1.5">
                  {(data.companies.ontario_pending_geo + data.companies.quebec_pending_geo)} pending geocoding
                </p>
              </div>
            </div>

            {/* Campaigns sent */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 bg-purple-50 rounded-lg"><Send className="w-4 h-4 text-purple-600" /></div>
                <span className="text-xs font-medium text-slate-500">Campaigns sent</span>
              </div>
              <p className="text-3xl font-bold text-slate-900">{(data.campaigns.total_sent ?? 0).toLocaleString()}</p>
              <p className="text-xs text-slate-400 mt-1">{data.campaigns.sent_last_30d} in the last 30 days</p>
              <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between text-xs text-slate-500">
                <span>Last: <strong className="text-slate-700">{fmtRelative(data.campaigns.last_sent_at)}</strong></span>
                <span><strong className="text-slate-700">{data.campaigns.sent_last_7d}</strong> this week</span>
              </div>
            </div>
          </div>

          {/* ── Row 2: detailed status ────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Ontario vs Quebec breakdown */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Companies by region</h3>
              {[
                { label: '🍁 Ontario', total: data.companies.ontario_total, active: data.companies.ontario_active, email: data.companies.ontario_with_email, geo: data.companies.ontario_geocoded },
                { label: '❄️ Quebec',  total: data.companies.quebec_total,  active: data.companies.quebec_active,  email: data.companies.quebec_with_email,  geo: data.companies.quebec_geocoded  },
              ].map(r => (
                <div key={r.label} className="mb-4 last:mb-0">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-slate-700">{r.label}</span>
                    <span className="text-sm font-bold text-slate-900">{r.total.toLocaleString()}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                      { l: 'Active',    v: r.active, c: 'text-green-600' },
                      { l: 'With email', v: r.email, c: 'text-blue-600' },
                      { l: 'GPS',       v: r.geo,   c: 'text-amber-600' },
                    ].map(({ l, v, c }) => (
                      <div key={l} className="bg-slate-50 rounded-lg py-2">
                        <p className={`text-base font-bold ${c}`}>{v.toLocaleString()}</p>
                        <p className="text-[10px] text-slate-400">{l}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Automatización estado */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-500" /> Campaign automation
              </h3>
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-4 ${
                data.automation.auto_enabled
                  ? 'bg-green-50 border border-green-200'
                  : 'bg-gray-50 border border-gray-200'
              }`}>
                <div className={`w-2 h-2 rounded-full ${data.automation.auto_enabled ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                <span className={`text-sm font-medium ${data.automation.auto_enabled ? 'text-green-700' : 'text-gray-500'}`}>
                  {data.automation.auto_enabled ? 'Active — sending automatically' : 'Disabled'}
                </span>
              </div>
              {data.automation.auto_last_run_at && (
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
                  <Clock className="w-3 h-3" />
                  Last cycle: <strong className="text-slate-700">{fmtDate(data.automation.auto_last_run_at)}</strong>
                </div>
              )}
              <div className="space-y-2 pt-3 border-t border-slate-100">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Sent (30 days)</span>
                  <span className="font-semibold text-slate-800">{data.campaigns.sent_last_30d}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Unique companies contacted</span>
                  <span className="font-semibold text-slate-800">{data.campaigns.unique_companies.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500 flex items-center gap-1"><ShieldOff className="w-3 h-3" /> Suppressed emails</span>
                  <span className="font-semibold text-red-500">{data.suppression.total}</span>
                </div>
              </div>
            </div>

            {/* CRM enrichment */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-purple-500" /> CRM Enrichment
              </h3>
              <div className="space-y-3">
                {[
                  { label: 'Enriched companies', value: data.enrichment.done, color: 'bg-purple-500', total: data.enrichment.done + data.enrichment.pending },
                  { label: 'Pending enrichment',  value: data.enrichment.pending, color: 'bg-amber-400', total: data.enrichment.done + data.enrichment.pending },
                ].map(({ label, value, color, total }) => (
                  <div key={label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-500">{label}</span>
                      <span className="font-semibold text-slate-800">{value.toLocaleString()}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5">
                      <div className={`${color} h-1.5 rounded-full`} style={{ width: `${pct(value, total)}%` }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Tipo breakdown from props (real, computed in App.tsx) */}
              {stats.tipoStats && stats.tipoStats.total > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <p className="text-xs font-medium text-slate-500 mb-2">TIPO Classification</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(Object.entries(TIPO_CONFIG) as [string, typeof TIPO_CONFIG[keyof typeof TIPO_CONFIG]][]).map(([key, cfg]) => {
                      const count = stats.tipoStats![key as keyof typeof stats.tipoStats] as number;
                      return (
                        <div key={key} className={`rounded-lg px-2 py-1.5 border ${cfg.badge} flex items-center justify-between`}>
                          <span className="text-[10px] font-semibold flex items-center gap-1">
                            <span>{cfg.emoji}</span>{cfg.label}
                          </span>
                          <span className="text-sm font-bold">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Row 3: latest companies added ────────────────────────────── */}
          {data.recent.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Users className="w-4 h-4 text-slate-400" /> Latest companies added
                </h3>
                <span className="text-xs text-slate-400">Ontario + Quebec</span>
              </div>
              <div className="divide-y divide-slate-50">
                {data.recent.map(c => (
                  <div key={c.id} className="px-5 py-3 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                      c.region === 'ontario' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
                    }`}>
                      {c.region === 'ontario' ? '🍁' : '❄️'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{c.nombre}</p>
                      <p className="text-xs text-slate-400 truncate">
                        {c.work || 'No service'}{c.ciudad ? ` · ${c.ciudad}` : ''}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {c.correo
                        ? <p className="text-xs text-green-600 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> With email</p>
                        : <p className="text-xs text-slate-300">No email</p>}
                      <p className="text-[10px] text-slate-400 mt-0.5">{fmtRelative(c.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
