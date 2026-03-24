import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Search, ChevronLeft, ChevronRight, Loader2, ExternalLink, MapPin, Zap, Building2, Filter, Globe, Calendar, LayoutGrid, List, Linkedin } from 'lucide-react';
import { Job } from '../../types';
import { api } from '../../services/apiClient';
import { StatusBadge, SourceBadge } from '../UI/Badges';

const LIMIT = 50;

function formatJob(j: any): Job {
  return {
    id: j.id,
    title: j.title,
    companyId: j.company_id,
    companyName: j.company_name,
    source: j.source,
    url: j.url,
    location: j.location || 'Remote',
    category: j.category || 'Full-time',
    isFavorite: false,
    applicationType: j.application_type || 'External',
    isEasyApply: j.is_easy_apply,
    country: j.country,
    postedAt: j.created_at,
    companyEnrichmentStatus: j.company_enrichment_status,
    companyIndustry: j.company_industry,
    companyHqCity: j.company_hq_city,
    companyHqCountry: j.company_hq_country,
    companyWebsite: j.company_website,
    companyConfidenceScore: j.company_confidence_score,
  };
}

type DateFilter = 'all' | 'today' | 'week' | 'month';
type SourceFilter = 'all' | 'linkedin' | 'indeed';
type ViewMode = 'list' | 'grid';

const DATE_LABELS: Record<DateFilter, string> = { all: 'All', today: 'Today', week: 'This Week', month: 'This Month' };

function passesDateFilter(postedAt: string | undefined, filter: DateFilter): boolean {
  if (filter === 'all' || !postedAt) return true;
  const d = new Date(postedAt);
  const now = new Date();
  if (filter === 'today') {
    return d.toDateString() === now.toDateString();
  }
  if (filter === 'week') {
    const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
    return d >= weekAgo;
  }
  if (filter === 'month') {
    const monthAgo = new Date(now); monthAgo.setMonth(now.getMonth() - 1);
    return d >= monthAgo;
  }
  return true;
}

interface JobsViewProps {
  onViewJob: (job: Job) => void;
  onSelectCompany?: (name: string) => void;
}

export const JobsView: React.FC<JobsViewProps> = ({ onViewJob, onSelectCompany }) => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setPage(1); setSearch(searchInput); }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [searchInput]);

  const fetchJobs = useCallback(async (p: number, s: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(LIMIT) });
      if (s) params.set('search', s);
      const res = await api(`/api/jobs?${params}`);
      if (!res.ok) return;
      const json = await res.json();
      const raw = Array.isArray(json) ? json : (json.data ?? []);
      setJobs(raw.map(formatJob));
      setTotal(json.total ?? raw.length);
      setTotalPages(json.totalPages ?? 1);
    } catch (e) {
      console.error('Error fetching jobs:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchJobs(page, search); }, [page, search, fetchJobs]);

  const filteredJobs = useMemo(() => {
    let result = jobs;
    if (sourceFilter !== 'all') result = result.filter(j => j.source === sourceFilter);
    result = result.filter(j => passesDateFilter(j.postedAt, dateFilter));
    return result;
  }, [jobs, sourceFilter, dateFilter]);

  const activeFilters = (sourceFilter !== 'all' ? 1 : 0) + (dateFilter !== 'all' ? 1 : 0);

  const pagePills = () => {
    if (totalPages <= 1) return [];
    const count = Math.min(5, totalPages);
    let start: number;
    if (page <= 3 || totalPages <= 5) start = 1;
    else if (page >= totalPages - 2) start = totalPages - 4;
    else start = page - 2;
    return Array.from({ length: count }, (_, i) => start + i);
  };

  return (
    <div className="space-y-6">
      {/* Header — same as CompanyList */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-slate-900">Job Board</h2>
          <span className="text-sm text-slate-400 font-normal">
            {loading ? '…' : `${filteredJobs.length.toLocaleString('en')} of ${total.toLocaleString('en')}`}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* View Mode Toggle — matches CompanyList exactly */}
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button onClick={() => setViewMode('list')} title="List"
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <List className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode('grid')} title="Grid"
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Search + Filter row — same layout as CompanyList filters bar */}
      <div className="flex flex-col gap-3">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input type="text" placeholder="Search by title, company or location…"
              value={searchInput} onChange={e => setSearchInput(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-lime-500/30 focus:border-lime-500 shadow-sm" />
          </div>
          <button onClick={() => setShowFilters(s => !s)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border shadow-sm transition-colors ${showFilters ? 'bg-lime-600 text-white border-lime-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            <Filter className="w-4 h-4" />
            Filters
            {activeFilters > 0 && (
              <span className={`text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center ${showFilters ? 'bg-white text-lime-600' : 'bg-lime-600 text-white'}`}>{activeFilters}</span>
            )}
          </button>
        </div>

        {/* Filters bar — same style as CompanyList */}
        {showFilters && (
          <div className="flex flex-wrap items-center gap-6 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Source</p>
              <div className="flex bg-slate-100 p-1 rounded-lg gap-1">
                {(['all', 'linkedin', 'indeed'] as SourceFilter[]).map(s => (
                  <button key={s} onClick={() => setSourceFilter(s)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${sourceFilter === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                    {s === 'all' ? 'All' : s === 'linkedin' ? 'LinkedIn' : 'Indeed'}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Date Posted</p>
              <div className="flex bg-slate-100 p-1 rounded-lg gap-1">
                {(Object.keys(DATE_LABELS) as DateFilter[]).map(d => (
                  <button key={d} onClick={() => setDateFilter(d)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${dateFilter === d ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                    {DATE_LABELS[d]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20 bg-white rounded-xl border border-slate-200 shadow-sm">
          <Loader2 className="w-8 h-8 animate-spin text-lime-600" />
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="py-20 text-center bg-white rounded-xl border border-slate-200 shadow-sm">
          <p className="text-slate-400 font-medium">No positions found.</p>
        </div>
      ) : viewMode === 'grid' ? (
        /* ── GRID VIEW (same 3-col layout as CompanyList) ── */
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredJobs.map(job => {
            const isEnriched = job.companyEnrichmentStatus && job.companyEnrichmentStatus !== 'pending';
            return (
              <div key={job.id} onClick={() => onViewJob(job)}
                className="bg-white p-5 rounded-xl border border-slate-200 hover:shadow-md hover:border-lime-500 cursor-pointer group transition-all flex flex-col">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 group-hover:text-lime-700 transition-colors leading-snug line-clamp-2">{job.title}</p>
                    <button onClick={e => { e.stopPropagation(); onSelectCompany?.(job.companyName); }}
                      className="text-xs text-slate-500 hover:text-lime-600 transition-colors mt-0.5 font-medium">{job.companyName}</button>
                  </div>
                  <SourceBadge source={job.source} />
                </div>

                <div className="space-y-1.5 flex-1">
                  {job.isEasyApply && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded uppercase tracking-wide">
                      <Zap className="w-2.5 h-2.5" />Easy Apply
                    </span>
                  )}
                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span className="truncate">{job.location}{job.country ? `, ${job.country}` : ''}</span>
                  </div>
                  {isEnriched && job.companyIndustry && (
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <Building2 className="w-3 h-3 shrink-0" />{job.companyIndustry}
                    </div>
                  )}
                  {isEnriched && job.companyHqCity && (
                    <div className="flex items-center gap-1 text-xs text-lime-600 font-medium">
                      <Building2 className="w-3 h-3 shrink-0" />{job.companyHqCity}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100">
                  {job.postedAt ? (
                    <span className="flex items-center gap-1 text-[11px] text-slate-400">
                      <Calendar className="w-3 h-3" />{new Date(job.postedAt).toLocaleDateString('es', { day: '2-digit', month: 'short' })}
                    </span>
                  ) : <span />}
                  <div className="flex items-center gap-1">
                    {job.status && <StatusBadge status={job.status} />}
                    <a href={job.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                      className="p-1.5 text-slate-300 hover:text-lime-600 hover:bg-lime-50 rounded-lg transition-all" title="Abrir vacante">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

          {/* Pagination — grid view */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 bg-white border border-slate-200 rounded-xl shadow-sm">
              <p className="text-sm text-slate-500 hidden sm:block">
                Showing {((page - 1) * LIMIT) + 1}–{Math.min(page * LIMIT, total)} of {total.toLocaleString('en')}
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {pagePills().map(n => (
                  <button key={n} onClick={() => setPage(n)}
                    className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${n === page ? 'bg-lime-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                    {n}
                  </button>
                ))}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        /* ── LIST VIEW ── */
        <>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
            {filteredJobs.map(job => {
              const isEnriched = job.companyEnrichmentStatus && job.companyEnrichmentStatus !== 'pending';
              return (
                <div key={job.id} onClick={() => onViewJob(job)}
                  className="flex items-start gap-4 p-4 hover:bg-slate-50 transition-colors cursor-pointer group">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${isEnriched ? 'bg-lime-50' : 'bg-slate-100'}`}>
                    <Building2 className={`w-4 h-4 ${isEnriched ? 'text-lime-600' : 'text-slate-400'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-slate-900 group-hover:text-lime-700 transition-colors">{job.title}</p>
                          {job.isEasyApply && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded uppercase tracking-wide shrink-0">
                              <Zap className="w-2.5 h-2.5" />Easy Apply
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <button onClick={e => { e.stopPropagation(); onSelectCompany?.(job.companyName); }}
                            className="text-xs text-slate-500 hover:text-lime-600 transition-colors font-medium">{job.companyName}</button>
                          {isEnriched && job.companyIndustry && (
                            <span className="text-[10px] text-slate-400">· {job.companyIndustry}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <SourceBadge source={job.source} />
                        {job.status && <StatusBadge status={job.status} />}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      <span className="flex items-center gap-1 text-[11px] text-slate-400"><MapPin className="w-3 h-3" />{job.location}{job.country && `, ${job.country}`}</span>
                      {isEnriched && job.companyHqCity && (
                        <span className="flex items-center gap-1 text-[11px] text-lime-600 font-medium"><Building2 className="w-3 h-3" />{job.companyHqCity}</span>
                      )}
                      {job.postedAt && (
                        <span className="flex items-center gap-1 text-[11px] text-slate-400"><Calendar className="w-3 h-3" />{new Date(job.postedAt).toLocaleDateString('es', { day: '2-digit', month: 'short' })}</span>
                      )}
                      {isEnriched && job.companyWebsite && (
                        <a href={job.companyWebsite} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                          className="flex items-center gap-1 text-[11px] text-blue-500 hover:underline"><Globe className="w-3 h-3" />Web</a>
                      )}
                    </div>
                  </div>
                  <a href={job.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                    className="p-2 text-slate-300 hover:text-lime-600 hover:bg-lime-50 rounded-lg transition-all shrink-0 mt-0.5 opacity-0 group-hover:opacity-100" title="Abrir">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 bg-white border border-slate-200 rounded-xl shadow-sm">
              <p className="text-sm text-slate-500 hidden sm:block">
                Mostrando {((page - 1) * LIMIT) + 1}–{Math.min(page * LIMIT, total)} de {total.toLocaleString('es')}
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {pagePills().map(n => (
                  <button key={n} onClick={() => setPage(n)}
                    className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${n === page ? 'bg-lime-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                    {n}
                  </button>
                ))}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
