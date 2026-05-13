import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { apiJson } from '../../services/apiClient';
import {
  Mail, Send, Zap, Clock, CheckCircle, AlertCircle,
  Loader2, Calendar, Users, Eye, Search, Filter,
  Play, Square, Settings, RotateCcw, BarChart3,
  Globe, MapPin, ChevronDown, ChevronUp,
} from 'lucide-react';

interface MDSendResult {
  success: boolean; region: string;
  template: { id: string; name: string };
  scheduleDate: string;
  totalCompanies: number; totalSubscribed: number; totalCampaigns: number;
  skipped: Array<{ name: string; email: string; reason: string }>;
  results: Array<{
    work: string; segmentId: string; contactCount: number;
    subscribed: number; campaignId?: string; envId?: string;
    status: 'success' | 'failed'; errors: string[];
  }>;
}

interface HistoryEntry {
  id: string; company_name: string; company_email: string;
  work_label: string; mdirector_campaign_id: string;
  mdirector_list_id: string; status: string;
  sent_at: string; sent_by_name: string;
}

interface MDTemplateMapping {
  id: string; region: string; work_label: string;
  template_id: string; template_name: string;
}

interface AutoConfig {
  auto_enabled: boolean; auto_ontario: boolean; auto_quebec: boolean;
  auto_new_days: number; auto_resend_days: number;
  auto_min_gap_days: number; auto_schedule_hour: number;
  auto_last_run_at: string | null;
  new_company_days: number; resend_interval_days: number;
}

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  return apiJson<T>(`/api${path}`, opts);
}

type Tab = 'mass' | 'schedule' | 'history';

export default function CampaignModule() {
  const [tab, setTab] = useState<Tab>('mass');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-lime-50 rounded-lg border border-lime-200">
              <Mail className="w-5 h-5 text-lime-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Email Campaigns</h2>
          </div>
          <p className="text-sm text-slate-500">Ontario & Quebec — MDirector</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex border-b border-slate-200">
          {([
            { key: 'mass' as Tab,    label: 'Mass Send',       icon: Send,    desc: 'Send to all or filtered companies' },
            { key: 'schedule' as Tab, label: 'Auto Schedule',  icon: Zap,     desc: 'Configure recurring automated campaigns' },
            { key: 'history' as Tab, label: 'Campaign Log',    icon: BarChart3, desc: 'View send history and stats' },
          ]).map(({ key, label, icon: Icon, desc }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex-1 px-6 py-4 border-b-2 transition-colors text-sm font-medium ${
                tab === key
                  ? 'border-lime-600 text-lime-700 bg-lime-50/50'
                  : 'border-transparent text-slate-600 hover:bg-slate-50'
              }`} title={desc}>
              <div className="flex items-center gap-2 justify-center">
                <Icon className="w-4 h-4" /><span>{label}</span>
              </div>
            </button>
          ))}
        </div>
        <div className="p-6 bg-slate-50/50">
          {tab === 'mass'     && <MassSendTab />}
          {tab === 'schedule' && <AutoScheduleTab />}
          {tab === 'history'  && <CampaignHistoryTab />}
        </div>
      </div>
    </div>
  );
}

// ── Mass Send Tab ────────────────────────────────────────────────────────────────

function MassSendTab() {
  const [region, setRegion] = useState<'ontario' | 'quebec'>('ontario');
  const [work, setWork] = useState('');
  const [city, setCity] = useState('');
  const [mappings, setMappings] = useState<MDTemplateMapping[]>([]);
  const [workOptions, setWorkOptions] = useState<string[]>([]);
  const [cityOptions, setCityOptions] = useState<string[]>([]);
  const [loadingMap, setLoadingMap] = useState(true);
  const [searching, setSearching] = useState(false);
  const [preview, setPreview] = useState<{ total: number; emails: string[] } | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<MDSendResult | null>(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);

  const loadData = useCallback(async (r: 'ontario' | 'quebec') => {
    setLoadingMap(true); setWork(''); setCity(''); setError(''); setPreview(null); setResult(null);
    try {
      const [mapData, workData, cityData] = await Promise.all([
        apiFetch<{ mappings: MDTemplateMapping[] }>(`/campaign/template-map?region=${r}`),
        apiFetch<string[]>(`/campaign/distinct-work?region=${r}`).catch(() => []),
        apiFetch<string[]>(`/campaign/distinct-city?region=${r}`).catch(() => []),
      ]);
      setMappings(mapData.mappings ?? []);
      setWorkOptions(Array.isArray(workData) ? workData.sort() : []);
      setCityOptions(Array.isArray(cityData) ? cityData.sort() : []);
    } catch (e: any) {
      setError(e.message);
    } finally { setLoadingMap(false); }
  }, []);

  useEffect(() => { loadData(region); }, [region, loadData]);

  const selectedMapping = work ? mappings.find(m => m.work_label === work) ?? null : null;

  const loadPreview = async () => {
    setSearching(true); setError('');
    try {
      const body: Record<string, unknown> = { region };
      if (work) body.work = work;
      if (city) body.city = city;
      const d = await apiFetch<{ total: number; emails: string[] }>('/campaign/preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      setPreview(d);
    } catch (e: any) { setError(e.message); }
    finally { setSearching(false); }
  };

  const sendCampaign = async () => {
    setSending(true); setError(''); setResult(null); setConfirming(false);
    try {
      const body: Record<string, unknown> = { region };
      if (work) body.work = work;
      if (city) body.city = city;
      const d = await apiFetch<MDSendResult>('/campaign/send-template', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      setResult(d);
    } catch (e: any) { setError(e.message); }
    finally { setSending(false); }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(['ontario', 'quebec'] as const).map(r => (
          <button key={r} onClick={() => { setRegion(r); setPreview(null); }}
            className={`p-4 rounded-lg border-2 text-center transition-all ${
              region === r ? 'border-lime-500 bg-lime-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'
            }`}>
            <p className="text-lg font-bold text-slate-900">{r === 'ontario' ? 'Ontario' : 'Quebec'}</p>
            <p className="text-xs text-slate-500 mt-1">List {r === 'ontario' ? '28' : '30'}</p>
          </button>
        ))}
      </div>

      {!loadingMap && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <Send className="w-4 h-4 text-lime-600" /> Campaign Filters
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Work Type</label>
              <select value={work} onChange={e => setWork(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-lime-400 focus:border-lime-400 outline-none transition bg-white">
                <option value="">All work types</option>
                {workOptions.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">City</label>
              <select value={city} onChange={e => setCity(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-lime-400 focus:border-lime-400 outline-none transition bg-white">
                <option value="">All cities</option>
                {cityOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {selectedMapping && (
            <p className="text-xs text-lime-700 bg-lime-50 p-2.5 rounded-lg flex items-center gap-2">
              <CheckCircle className="w-3.5 h-3.5" />
              Template: <strong>{selectedMapping.template_name}</strong>
            </p>
          )}

          {/* Preview */}
          <div className="flex gap-3">
            <button onClick={loadPreview} disabled={searching}
              className="flex-1 px-4 py-2.5 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-300 transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
              Preview Recipients
            </button>
            <button onClick={() => setConfirming(true)} disabled={!selectedMapping || sending}
              className="flex-1 px-4 py-2.5 bg-lime-600 text-white rounded-lg text-sm font-medium hover:bg-lime-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
              <Send className="w-4 h-4" /> Send Campaign
            </button>
          </div>

          {preview && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-blue-900">
                  <Users className="w-4 h-4 inline mr-1" />
                  {preview.total.toLocaleString()} companies match your filters
                </p>
                <button onClick={() => setPreview(null)} className="text-xs text-blue-600 hover:underline">Clear</button>
              </div>
              {preview.emails.length > 0 && (
                <details>
                  <summary className="text-xs text-blue-700 cursor-pointer hover:text-blue-900">
                    Show sample emails ({preview.emails.length} shown)
                  </summary>
                  <div className="mt-2 space-y-0.5 max-h-24 overflow-y-auto">
                    {preview.emails.map((e, i) => (
                      <p key={i} className="text-xs text-blue-700">{e}</p>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 flex gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <p className="text-sm text-rose-700">{error}</p>
            </div>
          )}

          {confirming && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium text-amber-900">Confirm mass send?</p>
              <p className="text-sm text-amber-800">
                {work ? `Work: ${work}` : 'All work types'} · {city || 'All cities'} · {region}
              </p>
              <div className="flex gap-2">
                <button onClick={sendCampaign} disabled={sending}
                  className="flex-1 px-4 py-2 bg-lime-600 text-white rounded-lg text-sm font-medium hover:bg-lime-700 flex items-center justify-center gap-2 disabled:opacity-50">
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Confirm
                </button>
                <button onClick={() => setConfirming(false)}
                  className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-300">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {loadingMap && (
        <div className="bg-white rounded-lg border border-slate-200 p-8 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      )}

      {result && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="bg-lime-50 border-b border-lime-200 p-4">
            <h3 className="font-bold text-lime-900 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-lime-600" /> Campaign Sent
            </h3>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 p-3 rounded-lg">
                <p className="text-xs text-slate-500">Recipients</p>
                <p className="text-xl font-bold text-slate-900">{result.totalCompanies}</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg">
                <p className="text-xs text-slate-500">Subscribed</p>
                <p className="text-xl font-bold text-lime-600">{result.totalSubscribed}</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg">
                <p className="text-xs text-slate-500">Campaigns Created</p>
                <p className="text-xl font-bold text-slate-900">{result.totalCampaigns}</p>
              </div>
            </div>
            {result.skipped.length > 0 && (
              <details>
                <summary className="text-sm font-medium text-amber-700 cursor-pointer">
                  {result.skipped.length} skipped
                </summary>
                <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                  {result.skipped.map((s, i) => (
                    <p key={i} className="text-xs p-1.5 bg-amber-50 text-amber-800 rounded">
                      <strong>{s.name}</strong> ({s.email}): {s.reason}
                    </p>
                  ))}
                </div>
              </details>
            )}
            <button onClick={() => setResult(null)} className="w-full px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-300">Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Auto Schedule Tab ────────────────────────────────────────────────────────────

function AutoScheduleTab() {
  const [config, setConfig] = useState<AutoConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Editable fields
  const [enabled, setEnabled] = useState(false);
  const [ontario, setOntario] = useState(true);
  const [quebec, setQuebec] = useState(true);
  const [hour, setHour] = useState('8');
  const [newDays, setNewDays] = useState('15');
  const [resendDays, setResendDays] = useState('90');
  const [minGapDays, setMinGapDays] = useState('60');

  useEffect(() => {
    const load = async () => {
      try {
        const d = await apiFetch<AutoConfig>('/campaign/auto-config');
        setConfig(d);
        setEnabled(d.auto_enabled ?? false);
        setOntario(d.auto_ontario ?? true);
        setQuebec(d.auto_quebec ?? true);
        setHour(String(d.auto_schedule_hour ?? 8));
        setNewDays(String(d.auto_new_days ?? 15));
        setResendDays(String(d.auto_resend_days ?? 90));
        setMinGapDays(String(d.auto_min_gap_days ?? 60));
      } catch (e: any) { setError(e.message); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const save = async () => {
    setSaving(true); setError(''); setSuccess('');
    try {
      await apiFetch('/campaign/auto-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auto_enabled: enabled, auto_ontario: ontario, auto_quebec: quebec,
          auto_schedule_hour: Number(hour), auto_new_days: Number(newDays),
          auto_resend_days: Number(resendDays), auto_min_gap_days: Number(minGapDays),
        }),
      });
      setConfig(prev => prev ? { ...prev, auto_enabled: enabled, auto_schedule_hour: Number(hour) } : prev);
      setSuccess('Settings saved successfully.');
      setTimeout(() => setSuccess(''), 4000);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const triggerRun = async () => {
    setRunning(true); setError('');
    try {
      await apiFetch('/campaign/auto-run', { method: 'POST' });
      setSuccess('Campaign automation triggered!');
      setTimeout(() => setSuccess(''), 4000);
    } catch (e: any) { setError(e.message); }
    finally { setRunning(false); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Status card */}
      <div className={`rounded-xl border-2 p-5 ${enabled ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${enabled ? 'bg-emerald-100' : 'bg-slate-100'}`}>
              <Zap className={`w-6 h-6 ${enabled ? 'text-emerald-600' : 'text-slate-400'}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900">Automated Campaigns</h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  enabled ? 'bg-emerald-200 text-emerald-800' : 'bg-slate-200 text-slate-600'
                }`}>{enabled ? 'ACTIVE' : 'INACTIVE'}</span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {enabled
                  ? `Runs daily at ${String(hour).padStart(2, '0')}:00 UTC · New: ${newDays}d · Resend: ${resendDays}d · Min gap: ${minGapDays}d`
                  : 'Automation is disabled. Enable it to send campaigns automatically.'}
              </p>
            </div>
          </div>
          <button onClick={() => setEnabled(!enabled)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              enabled ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-lime-600 text-white hover:bg-lime-700'
            }`}>
            {enabled ? <><Square className="w-3.5 h-3.5 inline mr-1" />Disable</> : <><Play className="w-3.5 h-3.5 inline mr-1" />Enable</>}
          </button>
        </div>
      </div>

      {/* Configuration */}
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {/* Schedule */}
        <div className="p-5 space-y-4">
          <h4 className="font-semibold text-slate-900 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-lime-600" /> Schedule
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Daily Run Time (UTC)</label>
              <select value={hour} onChange={e => setHour(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-lime-400 outline-none bg-white">
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={String(i)}>{String(i).padStart(2, '0')}:00 UTC</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">New Company Window</label>
              <div className="flex items-center gap-2">
                <input type="number" min={1} value={newDays} onChange={e => setNewDays(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-lime-400 outline-none" />
                <span className="text-xs text-slate-500">days</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Resend Interval</label>
              <div className="flex items-center gap-2">
                <input type="number" min={1} value={resendDays} onChange={e => setResendDays(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-lime-400 outline-none" />
                <span className="text-xs text-slate-500">days</span>
              </div>
            </div>
          </div>
        </div>

        {/* Regions */}
        <div className="p-5 space-y-4">
          <h4 className="font-semibold text-slate-900 flex items-center gap-2">
            <Globe className="w-4 h-4 text-lime-600" /> Regions
          </h4>
          <div className="flex gap-4">
            {(['ontario', 'quebec'] as const).map(r => {
              const checked = r === 'ontario' ? ontario : quebec;
              const toggle = r === 'ontario' ? () => setOntario(!ontario) : () => setQuebec(!quebec);
              return (
                <label key={r} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={checked} onChange={toggle}
                    className="w-4 h-4 rounded border-slate-300 text-lime-600 focus:ring-lime-500" />
                  <span className="text-sm font-medium text-slate-700 capitalize">{r}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Advanced */}
        <div className="p-5 space-y-4">
          <button onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
            <Settings className="w-4 h-4" /> Advanced Settings
            {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {showAdvanced && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Minimum Gap Between Sends</label>
                <div className="flex items-center gap-2">
                  <input type="number" min={1} value={minGapDays} onChange={e => setMinGapDays(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-lime-400 outline-none" />
                  <span className="text-xs text-slate-500">days</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Prevents sending to the same company more than once within this period</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Last Automated Run</label>
                <p className="text-sm text-slate-900 py-2">
                  {config?.auto_last_run_at
                    ? new Date(config.auto_last_run_at).toLocaleString()
                    : 'Never run'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 flex gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <p className="text-sm text-rose-700">{error}</p>
        </div>
      )}
      {success && (
        <div className="bg-lime-50 border border-lime-200 rounded-lg p-3 flex gap-2">
          <CheckCircle className="w-4 h-4 text-lime-600 shrink-0 mt-0.5" />
          <p className="text-sm text-lime-700">{success}</p>
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={save} disabled={saving}
          className="flex-1 px-4 py-2.5 bg-lime-600 text-white rounded-lg text-sm font-medium hover:bg-lime-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
          Save Settings
        </button>
        <button onClick={triggerRun} disabled={running}
          className="px-4 py-2.5 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-300 transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Run Now
        </button>
      </div>

      {/* Info box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-1.5">
        <p className="text-sm font-medium text-blue-900">How automation works</p>
        <ul className="text-xs text-blue-800 space-y-1">
          <li>• Runs daily at the configured UTC hour</li>
          <li>• Sends to companies marked as <strong>new</strong> (created within the new window)</li>
          <li>• Re-sends to companies after the <strong>resend interval</strong> has passed</li>
          <li>• <strong>Min gap</strong> ensures no company receives more than one email within that period</li>
          <li>• Bounced, unsubscribed, and invalid emails are automatically suppressed</li>
          <li>• Use <strong>Run Now</strong> to trigger an immediate campaign outside the schedule</li>
        </ul>
      </div>
    </div>
  );
}

// ── Campaign History Tab ─────────────────────────────────────────────────────────

function CampaignHistoryTab() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'sent' | 'pending' | 'failed'>('all');

  useEffect(() => {
    const load = async () => {
      try {
        const d = await apiFetch<HistoryEntry[]>('/campaign/history');
        setHistory(Array.isArray(d) ? d : []);
      } catch { setHistory([]); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const stats = useMemo(() => ({
    total: history.length,
    sent: history.filter(h => h.status === 'sent').length,
    pending: history.filter(h => h.status === 'pending').length,
    failed: history.filter(h => h.status === 'failed').length,
  }), [history]);

  const filtered = useMemo(() => {
    let result = history;
    const q = search.toLowerCase();
    if (q) result = result.filter(h =>
      h.company_name.toLowerCase().includes(q) ||
      h.company_email.toLowerCase().includes(q) ||
      h.work_label.toLowerCase().includes(q)
    );
    if (filter !== 'all') result = result.filter(h => h.status === filter);
    return result;
  }, [history, search, filter]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total', value: stats.total, color: 'text-slate-900 bg-slate-50' },
          { label: 'Sent', value: stats.sent, color: 'text-emerald-600 bg-emerald-50' },
          { label: 'Pending', value: stats.pending, color: 'text-amber-600 bg-amber-50' },
          { label: 'Failed', value: stats.failed, color: 'text-red-600 bg-red-50' },
        ].map(s => (
          <div key={s.label} className={`rounded-lg p-3 ${s.color}`}>
            <p className="text-2xl font-black">{s.value}</p>
            <p className="text-xs font-medium opacity-75">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="Search by company, email, or work..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-lime-400 outline-none transition" />
        </div>
        <div className="flex gap-2">
          {(['all', 'sent', 'pending', 'failed'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === f ? 'bg-lime-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
              }`}>
              <Filter className="w-3.5 h-3.5 inline mr-1" />
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded-lg border border-slate-200">
          <Mail className="w-10 h-10 mx-auto text-slate-300 mb-2" />
          <p className="text-slate-500 font-medium">No campaigns found</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                <tr className="text-xs font-semibold text-slate-700 text-left">
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Work</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Sent At</th>
                  <th className="px-4 py-3">Campaign ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(h => (
                  <tr key={h.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-slate-900">{h.company_name}</p>
                      <p className="text-xs text-slate-500">{h.company_email}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">{h.work_label}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                        h.status === 'sent' ? 'bg-lime-50 text-lime-700' :
                        h.status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'
                      }`}>
                        {h.status === 'sent' && <CheckCircle className="w-3 h-3" />}
                        {h.status === 'pending' && <Clock className="w-3 h-3" />}
                        {h.status === 'failed' && <AlertCircle className="w-3 h-3" />}
                        {h.status.charAt(0).toUpperCase() + h.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{new Date(h.sent_at).toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs text-slate-400 font-mono">{h.mdirector_campaign_id?.slice(0, 12)}...</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
