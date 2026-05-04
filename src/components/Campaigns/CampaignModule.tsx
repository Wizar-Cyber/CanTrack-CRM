import React, { useState, useEffect, useCallback } from 'react';
import { apiJson } from '../../services/apiClient';
import {
  Mail, Send, Eye, Settings, Clock, CheckCircle, XCircle,
  AlertTriangle, RefreshCw, ChevronDown, ChevronUp, Building2,
  Calendar, BarChart3, Loader2, Filter, Phone, MapPin, Globe,
} from 'lucide-react';

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface SheetCompany {
  empresa:         string;
  work:            string;
  tipo:            string | null;
  email:           string | null;
  hasEmail:        boolean;
  phone:           string | null;
  exactAddress:    string | null;
  ciudad:          string | null;
  provincia:       string | null;
  pueblo:          string | null;
  dominio:         string | null;
  descripcion:     string | null;
  addedToSheetAt:  string | null;
  lastCampaignAt:  string | null;
  enrichmentStatus: string;
}

interface CampaignContact {
  companyId: string | null;
  companyName: string;
  email: string;
  work: string;
  templateId: string | null;
  direccion: string;
  isNew: boolean;
  lastSentAt: string | null;
  addedToSheetAt: string | null;
  tipo: string | null;
}

interface CampaignPreview {
  toSend: CampaignContact[];
  skipped: Array<{ name: string; reason: string }>;
  byWork: Record<string, number>;
  totalNew: number;
  totalOld: number;
}

interface CampaignConfig {
  newCompanyDays: number;
  resendIntervalDays: number;
  mdirectorConfigured: boolean;
  mdirectorFromEmail: string;
  mdirectorFromName: string;
  serviceTemplateMap: Record<string, string>;
}

interface HistoryEntry {
  id: string;
  company_name: string;
  company_email: string;
  work_label: string;
  mdirector_campaign_id: string;
  status: string;
  sent_at: string;
  sent_by_name: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysAgo(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = Math.round((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
  if (d === 0) return 'hoy';
  if (d === 1) return 'ayer';
  return `hace ${d}d`;
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    scraped: 'bg-blue-100 text-blue-700',
    db_matched: 'bg-purple-100 text-purple-700',
    verified: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    pending: 'bg-yellow-100 text-yellow-700',
    unknown: 'bg-gray-100 text-gray-500',
  };
  return map[status] ?? 'bg-gray-100 text-gray-500';
}

// Usa el cliente centralizado que lee el token via getStoredToken()
async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  return apiJson<T>(`/api${path}`, opts);
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function CampaignModule() {
  const [tab, setTab] = useState<'companies' | 'preview' | 'history' | 'config' | 'mdirector'>('mdirector');

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-blue-50 rounded-lg">
            <Mail className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Email Campaigns</h1>
            <p className="text-sm text-gray-500">Ontario &amp; Quebec → MDirector</p>
          </div>
        </div>

        {/* Tabs */}
        <nav className="flex gap-1 flex-wrap">
          {([
            { key: 'mdirector', label: 'Ontario / Quebec', icon: Globe },
            { key: 'companies', label: 'Sheet Companies',  icon: Building2 },
            { key: 'preview',   label: 'Preview',          icon: Eye },
            { key: 'history',   label: 'History',          icon: Clock },
            { key: 'config',    label: 'Settings',         icon: Settings },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === key
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {tab === 'mdirector' && <MDirectorTab />}
        {tab === 'companies' && <CompaniesTab />}
        {tab === 'preview'   && <PreviewTab onGoHistory={() => setTab('history')} />}
        {tab === 'history'   && <HistoryTab />}
        {tab === 'config'    && <ConfigTab />}
      </div>
    </div>
  );
}

// ── Tab: Empresas del Sheet ───────────────────────────────────────────────────

const TIPO_BADGES: Record<string, { emoji: string; label: string; cls: string }> = {
  verde:   { emoji: '🟢', label: 'Visita',   cls: 'bg-green-100 text-green-800 border-green-200' },
  naranja: { emoji: '🟠', label: 'Llamada',  cls: 'bg-orange-100 text-orange-800 border-orange-200' },
  morado:  { emoji: '🟣', label: 'Casa',     cls: 'bg-purple-100 text-purple-800 border-purple-200' },
  rojo:    { emoji: '🔴', label: 'Cerrada',  cls: 'bg-red-100 text-red-700 border-red-200' },
};

function CompaniesTab() {
  const [companies, setCompanies] = useState<SheetCompany[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [filter, setFilter]       = useState('');
  const [workFilter, setWorkFilter] = useState('');
  const [tipoFilter, setTipoFilter] = useState<string>('all');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const d = await apiFetch<{ total: number; companies: SheetCompany[] }>('/campaigns/sheet-companies');
      setCompanies(d.companies);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const works = Array.from(new Set(companies.map(c => c.work))).sort();
  const filtered = companies.filter(c => {
    const q = filter.toLowerCase();
    const matchSearch = !q || c.empresa.toLowerCase().includes(q) || (c.work || '').toLowerCase().includes(q);
    const matchWork   = !workFilter || c.work === workFilter;
    const matchTipo   = tipoFilter === 'all' || c.tipo === tipoFilter || (tipoFilter === 'sin' && !c.tipo);
    return matchSearch && matchWork && matchTipo;
  });

  const withEmail    = filtered.filter(c => c.hasEmail).length;
  const withCampaign = filtered.filter(c => c.lastCampaignAt).length;
  const rojoCount    = companies.filter(c => c.tipo === 'rojo').length;

  return (
    <div className="space-y-4">
      {/* Stats rápidas */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total en Sheet', value: companies.length, color: 'text-gray-900' },
          { label: 'Con email',      value: withEmail,        color: 'text-green-700' },
          { label: 'Sin email',      value: companies.length - withEmail, color: 'text-red-600' },
          { label: 'Ya enviado',     value: withCampaign,     color: 'text-blue-700' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tipo filter pills */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-gray-500 font-medium mr-1">Tipo:</span>
        {([
          { key: 'all',    label: 'Todos',    cls: tipoFilter === 'all'    ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200' },
          { key: 'verde',   label: '🟢 Visita',  cls: tipoFilter === 'verde'   ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100' },
          { key: 'naranja', label: '🟠 Llamadas', cls: tipoFilter === 'naranja' ? 'bg-orange-500 text-white' : 'bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100' },
          { key: 'morado',  label: '🟣 Casa',    cls: tipoFilter === 'morado'  ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100' },
          { key: 'rojo',    label: '🔴 Cerradas', cls: tipoFilter === 'rojo'    ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100' },
          { key: 'sin',     label: '○ Sin tipo',  cls: tipoFilter === 'sin'    ? 'bg-gray-500 text-white' : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100' },
        ]).map(({ key, label, cls }) => (
          <button
            key={key}
            onClick={() => setTipoFilter(key)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${cls}`}
          >
            {label}{key === 'rojo' && rojoCount > 0 ? ` (${rojoCount} excluidas)` : ''}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Buscar empresa..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={workFilter}
          onChange={e => setWorkFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos los servicios</option>
          {works.map(w => <option key={w} value={w}>{w}</option>)}
        </select>
        <button onClick={load} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50">
          <RefreshCw className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Empresa</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Servicio (WORK)</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Contacto</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Agregada</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Último envío</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">Sin resultados</td></tr>
              )}
              {filtered.map((c, i) => {
                const tipoCfg = c.tipo ? TIPO_BADGES[c.tipo] : null;
                const isRojo  = c.tipo === 'rojo';
                return (
                <tr key={i} className={`hover:bg-gray-50 ${isRojo ? 'bg-red-50/40 opacity-60' : ''}`}>
                  {/* Empresa + tipo + dirección */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-gray-900 truncate max-w-[180px]">{c.empresa}</p>
                      {tipoCfg && (
                        <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[10px] font-semibold ${tipoCfg.cls}`}>
                          {tipoCfg.emoji} {tipoCfg.label}
                        </span>
                      )}
                    </div>
                    {c.exactAddress && (
                      <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate max-w-[180px]">{c.exactAddress}</span>
                      </p>
                    )}
                    {c.phone && (
                      <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3 shrink-0" />
                        {c.phone}
                      </p>
                    )}
                  </td>
                  {/* Servicio WORK */}
                  <td className="px-4 py-3">
                    {c.work
                      ? <span className="px-2 py-0.5 bg-lime-50 text-lime-700 border border-lime-100 rounded text-xs font-medium">{c.work}</span>
                      : <span className="text-xs text-gray-300 italic">Sin categoría</span>
                    }
                  </td>
                  {/* Email */}
                  <td className="px-4 py-3">
                    {c.hasEmail ? (
                      <span className="text-xs text-green-700 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> {c.email}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300 flex items-center gap-1">
                        <XCircle className="w-3 h-3" /> Sin email
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{daysAgo(c.addedToSheetAt)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{daysAgo(c.lastCampaignAt)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusBadge(c.enrichmentStatus)}`}>
                      {c.enrichmentStatus}
                    </span>
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Tab: Vista previa + Enviar ────────────────────────────────────────────────

function PreviewTab({ onGoHistory }: { onGoHistory: () => void }) {
  const [preview, setPreview]       = useState<CampaignPreview | null>(null);
  const [loading, setLoading]       = useState(false);
  const [sending, setSending]       = useState(false);
  const [error, setError]           = useState('');
  const [result, setResult]         = useState<any>(null);
  const [showSkipped, setShowSkipped] = useState(false);

  const loadPreview = async () => {
    setLoading(true); setError(''); setResult(null);
    try {
      const d = await apiFetch<CampaignPreview>('/campaigns/preview');
      setPreview(d);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const send = async () => {
    if (!preview || preview.toSend.length === 0) return;
    if (!confirm(`¿Confirmas el envío a ${preview.toSend.length} empresas en MDirector?`)) return;
    setSending(true); setError('');
    try {
      const r = await apiFetch<any>('/campaigns/send', {
        method: 'POST',
        body: JSON.stringify({ contacts: preview.toSend }),
      });
      setResult(r);
      setPreview(null);
    } catch (e: any) { setError(e.message); }
    finally { setSending(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <button
          onClick={loadPreview}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
          Generar Vista Previa
        </button>
        {preview && preview.toSend.length > 0 && (
          <button
            onClick={send}
            disabled={sending}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Enviar a MDirector ({preview.toSend.length})
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Resultado del envío */}
      {result && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <h3 className="font-semibold text-green-800">Campaña enviada</h3>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-3">
            <div className="text-center"><p className="text-2xl font-bold text-green-700">{result.sent}</p><p className="text-xs text-green-600">Enviados</p></div>
            <div className="text-center"><p className="text-2xl font-bold text-red-600">{result.failed}</p><p className="text-xs text-red-500">Fallidos</p></div>
            <div className="text-center"><p className="text-2xl font-bold text-gray-500">{result.skipped}</p><p className="text-xs text-gray-400">Omitidos</p></div>
          </div>
          <button onClick={onGoHistory} className="text-sm text-green-700 underline">Ver historial →</button>
        </div>
      )}

      {/* Preview cards */}
      {preview && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500">A enviar</p>
              <p className="text-2xl font-bold text-gray-900">{preview.toSend.length}</p>
              <p className="text-xs text-gray-400">{preview.totalNew} nuevas · {preview.totalOld} antiguas</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500">Omitidas</p>
              <p className="text-2xl font-bold text-amber-600">{preview.skipped.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500">Servicios distintos</p>
              <p className="text-2xl font-bold text-blue-700">{Object.keys(preview.byWork).length}</p>
            </div>
          </div>

          {/* Por servicio */}
          {Object.keys(preview.byWork).length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <BarChart3 className="w-4 h-4" /> Por servicio WORK
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(preview.byWork).sort((a,b) => (b[1] as number)-(a[1] as number)).map(([work, n]) => (
                  <div key={work} className="flex justify-between items-center px-3 py-1.5 bg-gray-50 rounded-lg">
                    <span className="text-sm text-gray-700">{work}</span>
                    <span className="text-sm font-semibold text-blue-700">{n}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Lista a enviar */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Empresas a contactar</h3>
              <span className="text-xs text-gray-400">{preview.toSend.length} registros</span>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Empresa</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Email</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">WORK</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Tipo</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {preview.toSend.map((c, i) => {
                  const tc = c.tipo ? TIPO_BADGES[c.tipo] : null;
                  return (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-900 truncate max-w-[180px]">{c.companyName}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{c.email}</td>
                    <td className="px-4 py-2">
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">{c.work}</span>
                    </td>
                    <td className="px-4 py-2">
                      {tc
                        ? <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[10px] font-semibold ${tc.cls}`}>{tc.emoji} {tc.label}</span>
                        : <span className="text-xs text-gray-300">—</span>
                      }
                    </td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        c.isNew ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {c.isNew ? '🆕 Nueva' : '🔄 Reenvío'}
                      </span>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Omitidas */}
          {preview.skipped.length > 0 && (
            <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
              <button
                onClick={() => setShowSkipped(s => !s)}
                className="w-full px-4 py-3 flex items-center justify-between text-sm font-medium text-amber-700"
              >
                <span className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  {preview.skipped.length} empresas omitidas
                </span>
                {showSkipped ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {showSkipped && (
                <div className="border-t border-amber-100 divide-y divide-amber-50">
                  {preview.skipped.map((s, i) => (
                    <div key={i} className="px-4 py-2 flex justify-between text-xs">
                      <span className="text-gray-700">{s.name}</span>
                      <span className="text-amber-600">{s.reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!preview && !loading && !result && (
        <div className="text-center py-16 text-gray-400">
          <Eye className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Haz clic en "Generar Vista Previa" para ver qué empresas recibirían email</p>
        </div>
      )}
    </div>
  );
}

// ── Tab: Historial ────────────────────────────────────────────────────────────

function HistoryTab() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    apiFetch<HistoryEntry[]>('/campaigns/history')
      .then(setHistory)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-4">{error}</div>}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
      ) : history.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Clock className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Sin envíos registrados</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Empresa</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Email</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">WORK</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Campaña ID</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Enviado</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Por</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {history.map(h => (
                <tr key={h.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{h.company_name}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{h.company_email}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">{h.work_label}</span>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-gray-400">{h.mdirector_campaign_id || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {new Date(h.sent_at).toLocaleDateString('es-CA', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{h.sent_by_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Tab: Configuración ────────────────────────────────────────────────────────

function ConfigTab() {
  const [cfg, setCfg]       = useState<Partial<CampaignConfig>>({});
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [error, setError]         = useState('');

  useEffect(() => {
    apiFetch<CampaignConfig>('/campaigns/config')
      .then(d => { setCfg(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const save = async () => {
    setSaving(true); setError(''); setSaved(false);
    try {
      await apiFetch('/campaigns/config', {
        method: 'PATCH',
        body: JSON.stringify({
          ...cfg,
          ...(apiKey    ? { mdirectorApiKey:    apiKey }    : {}),
          ...(apiSecret ? { mdirectorApiSecret: apiSecret } : {}),
        }),
      });
      setSaved(true);
      setApiKey(''); setApiSecret('');
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>;

  return (
    <div className="max-w-2xl space-y-6">
      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}

      {/* Intervalos */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-blue-500" /> Intervalos de envío
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Empresa "nueva" si llegó en los últimos</span>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="number" min={1} max={365}
                value={cfg.newCompanyDays ?? 15}
                onChange={e => setCfg(c => ({ ...c, newCompanyDays: +e.target.value }))}
                className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-500">días</span>
            </div>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Reenviar a antiguas cada</span>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="number" min={1} max={365}
                value={cfg.resendIntervalDays ?? 90}
                onChange={e => setCfg(c => ({ ...c, resendIntervalDays: +e.target.value }))}
                className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-500">días</span>
            </div>
          </label>
        </div>
      </div>

      {/* MDirector */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-800 mb-1 flex items-center gap-2">
          <Mail className="w-4 h-4 text-blue-500" /> MDirector
        </h2>
        <p className="text-xs text-gray-400 mb-4">
          Estado: {cfg.mdirectorConfigured
            ? <span className="text-green-600 font-medium">✓ Configurado ({cfg.mdirectorFromEmail})</span>
            : <span className="text-red-500 font-medium">No configurado</span>}
        </p>
        <div className="space-y-3">
          <input
            type="password" placeholder="API Key (dejar vacío para no cambiar)"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="password" placeholder="API Secret"
            value={apiSecret}
            onChange={e => setApiSecret(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="email" placeholder="Email remitente"
            value={cfg.mdirectorFromEmail ?? ''}
            onChange={e => setCfg(c => ({ ...c, mdirectorFromEmail: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="text" placeholder="Nombre remitente"
            value={cfg.mdirectorFromName ?? ''}
            onChange={e => setCfg(c => ({ ...c, mdirectorFromName: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Mapeo plantillas */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-800 mb-1 flex items-center gap-2">
          <Filter className="w-4 h-4 text-blue-500" /> Plantillas MDirector por servicio
        </h2>
        <p className="text-xs text-gray-400 mb-4">
          Ingresa el ID numérico de la plantilla de MDirector para cada servicio.
          Puedes obtenerlos en MDirector → Campañas.
        </p>
        <TemplateMapEditor
          value={cfg.serviceTemplateMap ?? {}}
          onChange={m => setCfg(c => ({ ...c, serviceTemplateMap: m }))}
        />
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium text-sm"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {saved ? '✓ Guardado' : 'Guardar cambios'}
      </button>
    </div>
  );
}

// ── Sub-componente: editor de mapeo plantillas ────────────────────────────────
// Los 52 servicios exactamente como aparecen en el campo WORK del Sheet
// y como se nombran las cartas PDF (en el mismo orden que los PDFs)

const SERVICE_NAMES: string[] = [
  'EMPACADORES',
  'OPERADORES DE MONTEACARGA',
  'CONDUCTORES DE VEHICULOS DE CARGA',
  'RECEPCIONISTA',
  'ELECTRICISTA',
  'MESEROS',
  'CARGA Y DESCARGA',
  'RECOLECTORES DE FRUTAS Y VEGETALES',
  'TRABAJADORES DE INVERNADEROS',
  'OPERARIO AGRICOLA',
  'PERSONAL DE SEGURIDAD',
  'EMPLEADA DOMESTICA',
  'REPARADORES DE REFRIGERADORAS',
  'MECANICO FORK LIFT',
  'TECNICO EN REPARACION DE ELEVADORES',
  'BARTENDERS',
  'CARNICERIA',
  'ALMACEN',
  'CARROCERIA',
  'EBANISTA',
  'TIENDA DE COMESTIBLES',
  'SUPERMERCADO',
  'SOLDADOR',
  'RESTAURANTE',
  'REMOCION DE NIEVE',
  'PLOMERO',
  'PINTOR',
  'PANADERIA',
  'PAISAJISMO',
  'OPERARIO DE PRODUCCION',
  'OPERARIO DE MAQUINARIA',
  'MUDANZAS',
  'MECANICO',
  'MANTENIMIENTO',
  'LAVANDERIA',
  'HOTEL',
  'EXCAVACION',
  'CONSTRUCCION',
  'DISEÑADOR DE INTERIORES',
  'DOMICILIARIO',
  'MECANICO INDUSTRIAL',
  'OPERADOR LASER',
  'LIMPIEZA INDUSTRIAL',
  'LIMPIEZA',
  'MUCAMA',
  'AGRICULTOR',
  'MATADERO',
  'ASISTENTE DE COCINA',
  'CHEF',
  'PIZZERO',
  'GENERAL',
  'CARPINTERO',
];

function TemplateMapEditor({
  value, onChange,
}: { value: Record<string, string>; onChange: (m: Record<string, string>) => void }) {
  const [local, setLocal] = useState<Record<string, string>>(value);

  useEffect(() => { setLocal(value); }, [value]);

  const update = (serviceName: string, templateId: string) => {
    const next = { ...local, [serviceName]: templateId };
    if (!templateId) delete next[serviceName];
    setLocal(next);
    onChange(next);
  };

  const configured = SERVICE_NAMES.filter(s => local[s]).length;

  return (
    <div>
      <p className="text-xs text-gray-400 mb-3">
        {configured}/{SERVICE_NAMES.length} plantillas configuradas
      </p>
      <div className="grid grid-cols-2 gap-2 max-h-96 overflow-y-auto pr-1">
        {SERVICE_NAMES.map((name, i) => (
          <div key={name} className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-4 shrink-0 text-right">{i + 1}.</span>
            <span className="text-xs text-gray-700 w-40 shrink-0 truncate font-medium" title={name}>{name}</span>
            <input
              type="text"
              placeholder="Template ID"
              value={local[name] ?? ''}
              onChange={e => update(name, e.target.value)}
              className={`flex-1 min-w-0 px-2 py-1 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 ${
                local[name] ? 'border-green-300 bg-green-50' : 'border-gray-200'
              }`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── MDirector Tab (Ontario / Quebec bulk campaigns) ───────────────────────────

interface MDPreviewRow {
  id: string;
  nombre: string;
  email: string;
  work: string;
  segmentId: string;
  listId: string;
  ciudad: string | null;
  provincia: string | null;
  lastCampaignAt: string | null;
}

interface MDPreviewResult {
  toSend: MDPreviewRow[];
  skipped: Array<{ name: string; reason: string }>;
  byWork: Record<string, number>;
  total: number;
  listId: string;
}

interface MDSendResult {
  totalSubscribed: number;
  totalCampaigns: number;
  results: Array<{ work: string; segmentId: string; campaignId: string; subscribed: number; errors: string[] }>;
  noSegment: string[];
}

function MDirectorTab() {
  const [source, setSource]           = useState<'ontario' | 'quebec'>('ontario');
  const [preview, setPreview]         = useState<MDPreviewResult | null>(null);
  const [loadingPrev, setLdPrev]      = useState(false);
  const [sending, setSending]         = useState(false);
  const [sendResult, setSendResult]   = useState<MDSendResult | null>(null);
  const [error, setError]             = useState('');
  const [subject, setSubject]         = useState('');
  const [scheduleDate, setSched]      = useState('');
  const [showSkipped, setShowSkipped] = useState(false);

  const loadPreview = useCallback(async () => {
    setLdPrev(true); setError(''); setPreview(null); setSendResult(null);
    try {
      const d = await apiFetch<MDPreviewResult>(`/campaign/preview/${source}`);
      setPreview(d);
    } catch (e: any) { setError(e.message); }
    finally { setLdPrev(false); }
  }, [source]);

  const sendCampaign = async () => {
    if (!preview || preview.total === 0) return;
    setSending(true); setError(''); setSendResult(null);
    try {
      const body: Record<string, string> = {};
      if (subject)      body.subject      = subject;
      if (scheduleDate) body.scheduleDate = scheduleDate.replace('T', ' ') + ':00';
      const d = await apiFetch<MDSendResult>(`/campaign/send/${source}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      setSendResult(d);
    } catch (e: any) { setError(e.message); }
    finally { setSending(false); }
  };

  const byWork: [string, number][] = preview
    ? (Object.entries(preview.byWork) as [string, number][]).sort((a, b) => b[1] - a[1])
    : [];

  return (
    <div className="space-y-5 max-w-4xl">

      {/* Source selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <Globe className="w-4 h-4 text-blue-500" /> Target database
        </h2>
        <div className="flex gap-3 mb-4">
          {(['ontario', 'quebec'] as const).map(s => (
            <button
              key={s}
              onClick={() => { setSource(s); setPreview(null); setSendResult(null); }}
              className={`px-5 py-2.5 rounded-lg font-medium text-sm transition-all ${
                source === s
                  ? 'bg-blue-600 text-white shadow'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s === 'ontario' ? '🍁 Ontario' : '❄️ Quebec'}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400">
          {source === 'ontario'
            ? 'Ontario companies → French template · MDirector list 28'
            : 'Quebec companies → English template · MDirector list 30'}
        </p>

        <div className="grid grid-cols-2 gap-3 mt-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Subject (optional — auto if blank)</label>
            <input
              type="text"
              placeholder={source === 'ontario' ? 'Services de personnel — …' : 'Staffing services — …'}
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Schedule date (optional — send immediately if blank)</label>
            <input
              type="datetime-local"
              value={scheduleDate}
              onChange={e => setSched(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-4">
          <button
            onClick={loadPreview}
            disabled={loadingPrev}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {loadingPrev ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
            Preview
          </button>
          <button
            onClick={sendCampaign}
            disabled={sending || !preview || preview.total === 0}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? 'Sending…' : `Send ${preview ? preview.total : ''} campaigns`}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          <XCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Preview */}
      {preview && !sendResult && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-500" /> {preview.total} companies ready to receive campaigns
            </h2>
            <span className="text-xs text-gray-400">{preview.skipped.length} skipped</span>
          </div>

          {byWork.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {byWork.map(([work, count]) => (
                <div key={work} className="flex items-center justify-between bg-blue-50 rounded-lg px-3 py-2">
                  <span className="text-xs font-medium text-blue-800 truncate">{work}</span>
                  <span className="text-xs text-blue-600 font-bold ml-2 shrink-0">{count}</span>
                </div>
              ))}
            </div>
          )}

          <div className="overflow-auto max-h-64 rounded-lg border border-gray-100">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Company</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Email</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Work type</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Seg.</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Last campaign</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {preview.toSend.slice(0, 100).map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-3 py-1.5 font-medium text-gray-800 max-w-[170px] truncate">{r.nombre}</td>
                    <td className="px-3 py-1.5 text-gray-500 max-w-[150px] truncate">{r.email}</td>
                    <td className="px-3 py-1.5 text-gray-600 max-w-[120px] truncate">{r.work}</td>
                    <td className="px-3 py-1.5 text-gray-400">{r.segmentId}</td>
                    <td className="px-3 py-1.5 text-gray-400">{daysAgo(r.lastCampaignAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.total > 100 && (
              <p className="text-center text-xs text-gray-400 py-2">… and {preview.total - 100} more</p>
            )}
          </div>

          {preview.skipped.length > 0 && (
            <div>
              <button
                onClick={() => setShowSkipped(s => !s)}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
              >
                {showSkipped ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {preview.skipped.length} companies skipped (no email)
              </button>
              {showSkipped && (
                <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto pl-1">
                  {preview.skipped.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-gray-500">
                      <AlertTriangle className="w-3 h-3 text-yellow-500 mt-0.5 shrink-0" />
                      <span><strong>{s.name}</strong> — {s.reason}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* Send result */}
      {sendResult && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <h2 className="font-semibold text-gray-800">
              Done — {sendResult.totalSubscribed} contacts subscribed · {sendResult.totalCampaigns} campaigns created
            </h2>
          </div>

          {sendResult.noSegment.length > 0 && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              ⚠️ No segment mapped for: {sendResult.noSegment.join(', ')}
            </div>
          )}

          <div className="space-y-2">
            {sendResult.results.map((r, i) => (
              <div
                key={i}
                className={`rounded-lg border px-4 py-3 ${
                  r.campaignId ? 'border-green-200 bg-green-50' : 'border-red-100 bg-red-50'
                }`}
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-800">{r.work}</span>
                  <div className="flex gap-4 text-xs">
                    <span className="text-green-700">{r.subscribed} subscribed</span>
                    {r.campaignId
                      ? <span className="text-blue-600 font-medium">Campaign #{r.campaignId}</span>
                      : <span className="text-red-500">Campaign failed</span>}
                  </div>
                </div>
                {r.errors.length > 0 && (
                  <ul className="mt-1.5 text-xs text-red-600 space-y-0.5">
                    {r.errors.slice(0, 5).map((e, j) => <li key={j}>• {e}</li>)}
                    {r.errors.length > 5 && <li>… and {r.errors.length - 5} more</li>}
                  </ul>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={() => { setPreview(null); setSendResult(null); }}
            className="text-sm text-blue-600 hover:underline"
          >
            ← Send another campaign
          </button>
        </div>
      )}
    </div>
  );
}
