import React, { useState, useMemo } from 'react';
import {
  Building2, LayoutGrid, List, MapPin, Briefcase, Database,
  Loader2, Zap, Search, Filter, RotateCcw, CheckSquare, Square,
  Navigation, X, Route, FileDown,
} from 'lucide-react';
import { Company, Job, CompanyTipo } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { api, apiJson } from '../../services/apiClient';
import { EMPLOYEE_TYPES } from '../../data/employeeTypes';
import { TipoSelector } from '../UI/TipoSelector';
import { TIPO_CONFIG, tipoBadgeClass } from '../../utils/tipo';

interface CompanyListProps {
  companies: Company[];
  jobs: Job[];
  onSelectCompany: (company: Company) => void;
  onUpdateCompany?: (company: Company) => void;
  enrichingIds?: Set<string>;
  onEnrichmentReset?: () => void;
}

export const CompanyList: React.FC<CompanyListProps> = ({
  companies,
  jobs,
  onSelectCompany,
  onUpdateCompany,
  enrichingIds = new Set(),
  onEnrichmentReset,
}) => {
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [filter, setFilter] = useState<'all' | 'with_vacancies' | 'pending'>('all');
  const [tipoFilter, setTipoFilter] = useState<CompanyTipo | 'all'>('all');
  const [sizeFilter, setSizeFilter] = useState<'all' | 'Small' | 'Medium' | 'Large' | 'Enterprise'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [enrichLimit, setEnrichLimit] = useState<string>('20');

  // ── Multi-select for route planning ────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [serviceFilter, setServiceFilter] = useState<string>('');   // service_id opcional para filtrar/exportar
  const [downloading, setDownloading] = useState(false);

  const filteredCompanies = useMemo(() => {
    let result = companies;

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.industry || '').toLowerCase().includes(q) ||
        (c.hqCity || '').toLowerCase().includes(q)
      );
    }

    if (filter === 'pending') {
      result = result.filter(c => c.enrichmentStatus === 'pending');
    } else if (filter === 'with_vacancies') {
      result = result.filter(company =>
        jobs.some(job => job.companyId === company.id || job.companyName === company.name)
      );
    }

    if (sizeFilter !== 'all') {
      result = result.filter(c => {
        if (!c.size) return false;
        if (sizeFilter === 'Small') return c.size.includes('1-50') || c.size.includes('11-50');
        if (sizeFilter === 'Medium') return c.size.includes('51-200') || c.size.includes('201-500');
        if (sizeFilter === 'Large') return c.size.includes('501-1000') || c.size.includes('1001-5000');
        if (sizeFilter === 'Enterprise') return c.size.includes('5001-10000') || c.size.includes('10001+');
        return false;
      });
    }

    if (tipoFilter !== 'all') {
      result = result.filter(c => c.tipo === tipoFilter);
    }

    return result;
  }, [companies, jobs, filter, sizeFilter, searchTerm, tipoFilter]);

  // ── Route planning helpers ──────────────────────────────────────────────────
  function toggleSelect(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const selectable = filteredCompanies.filter(c => c.enrichmentStatus !== 'pending');
    const allSelected = selectable.every(c => selectedIds.has(c.id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectable.map(c => c.id)));
    }
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setSelectMode(false);
  }

  function openScopeRoute() {
    const selected = filteredCompanies.filter(c => selectedIds.has(c.id));
    // Build addresses array — prefer exact address, fall back to city+province
    const addresses = selected
      .map(c => c.exactAddress || (c.hqCity ? `${c.hqCity}, ${c.hqProvince || ''}, Canada` : null))
      .filter(Boolean) as string[];

    if (addresses.length === 0) {
      alert('No addresses found for the selected companies.');
      return;
    }

    // Google Maps multi-stop directions URL
    const encoded = addresses.map(a => encodeURIComponent(a));
    const url = `https://www.google.com/maps/dir/${encoded.join('/')}`;
    window.open(url, '_blank');
  }

  async function downloadExcel(onlySelected: boolean) {
    setDownloading(true);
    try {
      const body: any = {};
      if (onlySelected && selectedIds.size > 0) {
        body.ids = Array.from(selectedIds);
      }
      if (serviceFilter) {
        body.serviceId = serviceFilter;
      }
      const res = await api('/api/companies/export', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Best-effort filename — server sends its own via Content-Disposition
      const cd = res.headers.get('Content-Disposition') || '';
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match ? match[1] : `cantrack-empresas-${new Date().toISOString().slice(0,10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[Export Excel]', err);
      alert('Could not download the Excel. Check the console.');
    } finally {
      setDownloading(false);
    }
  }

  async function handleResetEnrichment() {
    const limit = parseInt(enrichLimit, 10);
    const isLimited = !isNaN(limit) && limit > 0;
    const msg = isLimited
      ? `Reset enrichment? Only the first ${limit} companies will be processed, the rest will be marked as 'skipped'.`
      : "Reset ALL enrichment data? All companies will be re-processed.";
    if (!confirm(msg)) return;
    setResetting(true);
    try {
      const url = isLimited ? `/api/companies/all?limit=${limit}` : '/api/companies/all';
      await apiJson(url, { method: 'DELETE' });
      onEnrichmentReset?.();
    } catch (e) {
      console.error('Error resetting enrichment:', e);
      alert('Error resetting enrichment. Make sure you have admin role.');
    } finally {
      setResetting(false);
    }
  }

  const getCompanyJobs = (company: Company) =>
    jobs.filter(job => job.companyId === company.id || job.companyName === company.name);

  const selectableCount = filteredCompanies.filter(c => c.enrichmentStatus !== 'pending').length;
  const allSelected = selectableCount > 0 && filteredCompanies.filter(c => c.enrichmentStatus !== 'pending').every(c => selectedIds.has(c.id));

  return (
    <div className="space-y-6 pb-24">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-slate-900">Companies</h2>
          {enrichingIds.size > 0 && (
            <div className="flex items-center gap-2 px-3 py-1 bg-lime-50 text-lime-700 rounded-full border border-lime-100 animate-pulse">
              <Zap className="w-3 h-3 fill-current" />
              <span className="text-xs font-bold uppercase tracking-wider">Auto-Enriching {enrichingIds.size}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          {/* Select mode toggle */}
          <button
            onClick={() => {
              setSelectMode(s => !s);
              if (selectMode) clearSelection();
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
              selectMode
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
            title="Select companies to plan a route"
          >
            <Route className="w-3.5 h-3.5" />
            {selectMode ? 'Selecting…' : 'Plan Route'}
          </button>

          {/* Reset Enrichment — admin only */}
          {user?.role === 'admin' && (
            <div className="flex items-center gap-1">
              <input
                type="number" min="0" placeholder="all"
                value={enrichLimit}
                onChange={e => setEnrichLimit(e.target.value)}
                className="w-14 px-2 py-1.5 text-xs border border-slate-200 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-rose-300"
                title="Number of companies to enrich (leave empty = all)"
              />
              <button onClick={handleResetEnrichment} disabled={resetting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 text-rose-600 bg-rose-50 hover:bg-rose-100 text-xs font-medium transition-colors disabled:opacity-50">
                {resetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                Reset &amp; Enrich
              </button>
            </div>
          )}

          {/* View Mode Toggle */}
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'grid' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'table' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
              title="Table View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Search + Filter row */}
      <div className="flex flex-col gap-3">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input type="text" placeholder="Search company, industry or city…"
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-lime-500/30 focus:border-lime-500 shadow-sm" />
          </div>
          <button onClick={() => setShowFilters(s => !s)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border shadow-sm transition-colors ${
              showFilters ? 'bg-lime-600 text-white border-lime-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}>
            <Filter className="w-4 h-4" />
            Filters
            {(filter !== 'all' || sizeFilter !== 'all' || tipoFilter !== 'all') && (
              <span className={`text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center ${
                showFilters ? 'bg-white text-lime-600' : 'bg-lime-600 text-white'
              }`}>
                {(filter !== 'all' ? 1 : 0) + (sizeFilter !== 'all' ? 1 : 0) + (tipoFilter !== 'all' ? 1 : 0)}
              </span>
            )}
          </button>
        </div>

        {showFilters && (
          <div className="flex flex-wrap items-end gap-6 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</p>
              <div className="flex bg-slate-100 p-1 rounded-lg gap-1">
                {(['all', 'with_vacancies', 'pending'] as const).map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      filter === f ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}>
                    {f === 'all' ? 'All' : f === 'with_vacancies' ? 'With Vacancies' : 'Processing'}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Size</p>
              <div className="flex bg-slate-100 p-1 rounded-lg gap-1">
                {(['all', 'Small', 'Medium', 'Large', 'Enterprise'] as const).map(s => (
                  <button key={s} onClick={() => setSizeFilter(s)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      sizeFilter === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}>
                    {s === 'all' ? 'All' : s}
                  </button>
                ))}
              </div>
            </div>

            {/* Filtro TIPO — clasificación comercial */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tipo</p>
              <div className="flex flex-wrap gap-1">
                <button onClick={() => setTipoFilter('all')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors border ${
                    tipoFilter === 'all' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}>All</button>
                {(Object.entries(TIPO_CONFIG) as [NonNullable<CompanyTipo>, typeof TIPO_CONFIG[NonNullable<CompanyTipo>]][]).map(([key, cfg]) => (
                  <button key={key} onClick={() => setTipoFilter(key)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors border ${
                      tipoFilter === key ? cfg.badge + ' font-bold' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}>
                    {cfg.emoji} {cfg.label}
                  </button>
                ))}
                <button onClick={() => setTipoFilter(null)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors border ${
                    tipoFilter === null ? 'bg-slate-800 text-white border-slate-800' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}>○ No type</button>
              </div>
            </div>

            {/* Service filter — filtra empresas que ya tienen ese servicio clasificado o sugerido */}
            <div className="space-y-2 min-w-[230px]">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">CanTrack Service</p>
              <select
                value={serviceFilter}
                onChange={(e) => setServiceFilter(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-lime-500/30"
              >
                <option value="">All services</option>
                {EMPLOYEE_TYPES.slice()
                  .sort((a, b) => a.number - b.number)
                  .map(s => (
                    <option key={s.id} value={s.id}>
                      #{s.number} {s.name} · {s.category}
                    </option>
                  ))}
              </select>
            </div>

            {/* Descargar Excel formato Acton Vale (Empresa | DIRECCION | WORK) */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Exportar</p>
              <button
                onClick={() => downloadExcel(false)}
                disabled={downloading}
                className="flex items-center gap-2 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm"
                title="Download Excel in Acton Vale format (Company, ADDRESS, WORK). If a service is filtered, only exports companies offering that service."
              >
                {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                Download Excel{serviceFilter ? ' (filtered)' : ''}
              </button>
            </div>
          </div>
        )}

        {/* Select-all bar — only visible in select mode */}
        {selectMode && (
          <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-2.5">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-2 text-xs font-medium text-indigo-700 hover:text-indigo-900"
            >
              {allSelected
                ? <CheckSquare className="w-4 h-4" />
                : <Square className="w-4 h-4" />
              }
              {allSelected ? 'Deselect all' : `Select all (${selectableCount})`}
            </button>
            {selectedIds.size > 0 && (
              <span className="ml-auto text-xs text-indigo-600 font-semibold">
                {selectedIds.size} selected
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Grid View ── */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCompanies.map(company => {
            const companyJobs = getCompanyJobs(company);
            const isPending = company.enrichmentStatus === 'pending';
            const isSelected = selectedIds.has(company.id);

            return (
              <div
                key={company.id}
                onClick={() => {
                  if (selectMode && !isPending) {
                    setSelectedIds(prev => {
                      const next = new Set(prev);
                      next.has(company.id) ? next.delete(company.id) : next.add(company.id);
                      return next;
                    });
                  } else if (!isPending) {
                    onSelectCompany(company);
                  }
                }}
                className={`bg-white p-6 rounded-xl border shadow-sm transition-all flex flex-col h-full relative ${
                  isPending
                    ? 'border-dashed border-slate-300'
                    : selectMode
                      ? `cursor-pointer ${isSelected ? 'border-indigo-400 ring-2 ring-indigo-300/50 bg-indigo-50/30' : 'border-slate-200 hover:border-indigo-300'}`
                      : 'border-slate-200 hover:shadow-md hover:border-lime-500 cursor-pointer group'
                }`}
              >
                {/* Checkbox overlay in select mode */}
                {selectMode && !isPending && (
                  <div className={`absolute top-3 right-3 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                    isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white'
                  }`}>
                    {isSelected && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                )}

                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className={`text-base font-bold transition-colors truncate ${isPending ? 'text-slate-700' : 'text-slate-900 group-hover:text-lime-700'}`}>
                      {company.name}
                    </h3>
                    {!isPending && <p className="text-xs text-slate-500 mt-0.5 truncate">{company.industry || company.knownATSPortal || ''}</p>}
                  </div>
                  {/* TipoSelector inline — click sin abrir detalle */}
                  {!isPending && company.id && !company.id.startsWith('temp') && (
                    <div onClick={e => e.stopPropagation()} className="ml-2 shrink-0">
                      <TipoSelector
                        companyId={company.id}
                        current={company.tipo ?? null}
                        compact
                        onUpdate={tipo => onUpdateCompany?.({ ...company, tipo })}
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-2 flex-1">
                  {isPending ? (
                    <div className="flex flex-col items-center justify-center py-6 space-y-3">
                      <div className="relative">
                        <div className="w-10 h-10 border-4 border-lime-100 border-t-lime-600 rounded-full animate-spin"></div>
                        <Database className="w-4 h-4 text-lime-600 absolute inset-0 m-auto" />
                      </div>
                      <div className="text-center">
                        <p className="text-xs font-bold text-slate-700">Enriching data…</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Address — exactAddress from Sheet or hqCity from enrichment */}
                      <div className="flex items-start gap-2 text-sm text-slate-600">
                        <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                        <span className="truncate text-xs" title={company.exactAddress || ''}>
                          {company.exactAddress
                            ? company.exactAddress
                            : company.hqCity
                              ? `${company.hqCity}, ${company.hqProvince || 'QC'}`
                              : <span className="text-slate-300 italic">No address</span>}
                        </span>
                      </div>

                      {/* Service WORK from Sheet */}
                      {company.knownATSPortal && (
                        <div className="flex items-center gap-2">
                          <Briefcase className="w-4 h-4 text-slate-400 shrink-0" />
                          <span className="px-2 py-0.5 bg-lime-50 text-lime-700 border border-lime-100 rounded text-xs font-medium truncate">
                            {company.knownATSPortal}
                          </span>
                        </div>
                      )}

                      {/* Email si está disponible */}
                      {company.contactEmail && (
                        <p className="text-xs text-slate-400 truncate pl-6" title={company.contactEmail}>
                          {company.contactEmail}
                        </p>
                      )}

                      {/* Vacantes activas */}
                      {companyJobs.length > 0 && (
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span className="w-4 h-4 shrink-0" />
                          {companyJobs.length} {companyJobs.length === 1 ? 'vacancy' : 'vacancies'}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {!isPending && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      company.enrichmentStatus === 'scraped' || company.enrichmentStatus === 'db_matched' || company.enrichmentStatus === 'verified'
                        ? 'bg-lime-50 text-lime-700'
                        : company.enrichmentStatus === 'failed'
                          ? 'bg-red-50 text-red-600'
                          : 'bg-slate-50 text-slate-400'
                    }`}>
                      {company.enrichmentStatus ?? 'en sheet'}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
          {filteredCompanies.length === 0 && (
            <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-200 rounded-xl">
              <Building2 className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-slate-900">No companies found</h3>
              <p className="text-slate-500">Try changing your filters.</p>
            </div>
          )}
        </div>
      ) : (
        /* ── Table View ── */
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {selectMode && (
                    <th className="px-4 py-4 w-10">
                      <button onClick={toggleSelectAll} className="text-indigo-600">
                        {allSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                      </button>
                    </th>
                  )}
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Company</th>
                  <th className="px-4 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Address</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Service</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCompanies.map(company => {
                  const companyJobs = getCompanyJobs(company);
                  const isPending = company.enrichmentStatus === 'pending';
                  const isSelected = selectedIds.has(company.id);

                  return (
                    <tr
                      key={company.id}
                      onClick={() => {
                        if (selectMode && !isPending) {
                          setSelectedIds(prev => {
                            const next = new Set(prev);
                            next.has(company.id) ? next.delete(company.id) : next.add(company.id);
                            return next;
                          });
                        } else if (!isPending) {
                          onSelectCompany(company);
                        }
                      }}
                      className={`transition-colors ${
                        isPending
                          ? 'bg-slate-50/50'
                          : selectMode
                            ? `cursor-pointer ${isSelected ? 'bg-indigo-50/60' : 'hover:bg-indigo-50/30'}`
                            : 'hover:bg-slate-50 cursor-pointer group'
                      }`}
                    >
                      {selectMode && (
                        <td className="px-4 py-4">
                          {!isPending && (
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                              isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'
                            }`}>
                              {isSelected && (
                                <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>
                          )}
                        </td>
                      )}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-md flex items-center justify-center border shrink-0 ${isPending ? 'bg-white border-dashed border-slate-300' : 'bg-slate-100 border-slate-200'}`}>
                            <Building2 className={`w-4 h-4 ${isPending ? 'text-slate-300' : 'text-slate-400'}`} />
                          </div>
                          <div>
                            <p className={`text-sm font-bold transition-colors ${isPending ? 'text-slate-700' : 'text-slate-900 group-hover:text-lime-700'}`}>{company.name}</p>
                            {!isPending && <p className="text-xs text-slate-500">{company.industry}</p>}
                          </div>
                        </div>
                      </td>
                      {/* Tipo */}
                      <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                        {!isPending && company.id && !company.id.startsWith('temp') ? (
                          <TipoSelector
                            companyId={company.id}
                            current={company.tipo ?? null}
                            onUpdate={tipo => onUpdateCompany?.({ ...company, tipo })}
                          />
                        ) : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      {/* Dirección */}
                      <td className="px-6 py-4">
                        {isPending ? (
                          <div className="flex items-center gap-2 text-xs text-lime-600 font-medium">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Enriching...</span>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2 max-w-xs">
                            <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                            <span className="text-xs text-slate-600">
                              {company.exactAddress
                                ? company.exactAddress
                                : company.hqCity
                                  ? `${company.hqCity}, ${company.hqProvince || 'QC'}`
                                  : <span className="italic text-slate-300">No address</span>}
                            </span>
                          </div>
                        )}
                      </td>
                      {/* Servicio WORK */}
                      <td className="px-6 py-4">
                        {company.knownATSPortal ? (
                          <span className="px-2 py-1 bg-lime-50 text-lime-700 border border-lime-100 rounded text-xs font-medium whitespace-nowrap">
                            {company.knownATSPortal}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs italic">—</span>
                        )}
                      </td>
                      {/* Email */}
                      <td className="px-6 py-4 text-xs text-slate-500">
                        {company.contactEmail || <span className="text-slate-300 italic">—</span>}
                      </td>
                      {/* Estado */}
                      <td className="px-6 py-4">
                        {isPending ? (
                          <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                            <Database className="w-3 h-3" />
                            Pending
                          </div>
                        ) : (
                          <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                            company.enrichmentStatus === 'scraped' || company.enrichmentStatus === 'db_matched' || company.enrichmentStatus === 'verified'
                              ? 'bg-lime-50 text-lime-700'
                              : company.enrichmentStatus === 'failed'
                                ? 'bg-red-50 text-red-600'
                                : 'bg-slate-50 text-slate-400'
                          }`}>
                            {company.enrichmentStatus ?? 'en sheet'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredCompanies.length === 0 && (
                  <tr>
                    <td colSpan={selectMode ? 7 : 6} className="px-6 py-12 text-center text-slate-500">
                      No companies found matching the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Floating action bar (route planning) ── */}
      {selectMode && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-white/10 animate-in slide-in-from-bottom-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-indigo-500 rounded-full flex items-center justify-center text-xs font-bold">
              {selectedIds.size}
            </div>
            <span className="text-sm font-medium">
              {selectedIds.size === 1 ? '1 company selected' : `${selectedIds.size} companies selected`}
            </span>
          </div>

          <div className="h-4 w-px bg-white/20" />

          <button
            onClick={openScopeRoute}
            className="flex items-center gap-2 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <Navigation className="w-4 h-4" />
            Open Route in Maps
          </button>

          <button
            onClick={() => downloadExcel(true)}
            disabled={downloading}
            className="flex items-center gap-2 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors"
            title="Download an Excel with selected companies in Acton Vale format (Company, ADDRESS, WORK)"
          >
            {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            Download Excel
          </button>

          <button
            onClick={clearSelection}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
            title="Clear selection"
          >
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>
      )}
    </div>
  );
};
