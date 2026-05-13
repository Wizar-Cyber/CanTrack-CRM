import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, Search, Trash2, X } from 'lucide-react';
import { apiJson } from '../../services/apiClient';

type ProvinceKey = 'ontario' | 'quebec';

interface ImportedCompany {
  id: string;
  nombre: string;
  telefono?: string;
  correo?: string;
  ciudad?: string;
  provincia?: string;
  region?: string;
  direccion?: string;
  pueblo?: string;
  work?: string;
  descripcion?: string;
  dominio_de_pagina?: string;
  lista_de_llamadas?: string;
  status: string;
  created_at: string;
  is_duplicate: boolean;
  // Enriched fields
  industry?: string;
  company_size?: string;
  website?: string;
  enrichment_status?: string;
  enrichment_provider?: string;
  enriched_at?: string;
  suggested_services?: any;
  tipo?: string;
}

interface CompaniesResponse {
  data: ImportedCompany[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

const PROVINCES: Record<ProvinceKey, { label: string }> = {
  ontario: { label: 'Ontario' },
  quebec: { label: 'Quebec' },
};

const pageSize = 50;

export const ImportedCompaniesPanel: React.FC<{ province: ProvinceKey }> = ({ province }) => {
  const config = PROVINCES[province];
  const [companies, setCompanies] = useState<ImportedCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [workFilter, setWorkFilter] = useState('');
  const [workOptions, setWorkOptions] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedCompany, setSelectedCompany] = useState<ImportedCompany | null>(null);

  useEffect(() => {
    setPage(1);
    setSearch('');
    setWorkFilter('');
  }, [province]);

  // Load distinct work values for the filter dropdown
  useEffect(() => {
    apiJson<string[]>(`/api/${province}/distinct-work`).then(setWorkOptions).catch(() => {});
  }, [province]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(page), limit: String(pageSize), search });
        if (workFilter) params.set('work', workFilter);

        const companiesResponse = await apiJson<CompaniesResponse>(`/api/${province}/companies?${params.toString()}`);
        if (cancelled) return;
        setCompanies(companiesResponse.data);
        setTotal(companiesResponse.pagination.total);
        setTotalPages(Math.max(1, companiesResponse.pagination.pages || 1));
      } catch (error) {
        console.error(`Error loading ${province} companies:`, error);
        if (!cancelled) { setCompanies([]); setTotalPages(1); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const interval = window.setInterval(load, 30000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [page, province, search, workFilter]);

  async function handleDelete(id: string) {
    if (!confirm('Mark this company as duplicate?')) return;
    try {
      await apiJson(`/api/${province}/companies/${id}`, { method: 'DELETE' });
      setCompanies(prev => prev.filter(company => company.id !== id));
    } catch {
      alert('Could not mark as duplicate.');
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters row */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="search"
              placeholder="Search name, email, city…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-lime-400 focus:ring-2 focus:ring-lime-100"
            />
          </div>
          <select
            value={workFilter}
            onChange={e => { setWorkFilter(e.target.value); setPage(1); }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 outline-none focus:border-lime-400 focus:ring-2 focus:ring-lime-100"
          >
            <option value="">All sectors</option>
            {workOptions.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
        <p className="text-sm text-slate-500 whitespace-nowrap">{total.toLocaleString()} companies</p>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-slate-600">Name</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-slate-600">Email</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-slate-600">City</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-slate-600">Sector</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-slate-600">Web</th>
                <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">Loading companies...</td></tr>
              ) : companies.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">No companies to display.</td></tr>
              ) : companies.map(company => (
                <tr key={company.id} className="hover:bg-slate-50">
                  <td className="max-w-xs px-4 py-3 text-sm font-semibold text-slate-900">
                    <span className="block truncate" title={company.nombre}>{company.nombre}</span>
                    <span className="text-xs font-normal text-slate-500">{company.pueblo || company.ciudad || config.label}</span>
                    {company.enrichment_status === 'scraped' && (
                      <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" title="AI Enriched" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{company.correo || '-'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{company.ciudad || company.pueblo || '-'}</td>
                  <td className="px-4 py-3">
                    {company.work ? (
                      <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        {company.work}
                      </span>
                    ) : <span className="text-slate-400 text-sm">-</span>}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {(company.dominio_de_pagina || company.website) ? (
                      <a href={company.dominio_de_pagina || company.website} target="_blank" rel="noreferrer"
                        className="text-blue-600 hover:underline text-xs truncate block max-w-[120px]"
                        title={company.dominio_de_pagina || company.website}>
                        {company.dominio_de_pagina || company.website}
                      </a>
                    ) : <span className="text-slate-400 text-sm">-</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setSelectedCompany(company)} className="rounded-md p-2 text-slate-500 hover:bg-lime-50 hover:text-lime-700" title="View details">
                        <Eye className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(company.id)} className="rounded-md p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700" title="Mark duplicate">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Page {page} of {totalPages}</p>
        <div className="flex gap-2">
          <button onClick={() => setPage(c => Math.max(1, c - 1))} disabled={page === 1}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">
            <ChevronLeft className="h-4 w-4" />Previous
          </button>
          <button onClick={() => setPage(c => Math.min(totalPages, c + 1))} disabled={page >= totalPages}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">
            Next<ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Detail modal */}
      {selectedCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onClick={() => setSelectedCompany(null)}>
          <div className="max-h-[86vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-2xl border border-slate-200" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-slate-100 p-5 flex items-start justify-between rounded-t-2xl">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {selectedCompany.enrichment_status === 'scraped' && (
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                  )}
                  <h3 className="text-lg font-bold text-slate-900 truncate">{selectedCompany.nombre}</h3>
                </div>
                <p className="text-sm text-slate-500">{selectedCompany.ciudad || selectedCompany.pueblo || config.label}{selectedCompany.provincia && `, ${selectedCompany.provincia}`}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-4">
                {selectedCompany.tipo && (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                    selectedCompany.tipo === 'verde' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' :
                    selectedCompany.tipo === 'naranja' ? 'bg-orange-50 text-orange-700 ring-1 ring-orange-200' :
                    selectedCompany.tipo === 'morado' ? 'bg-purple-50 text-purple-700 ring-1 ring-purple-200' :
                    selectedCompany.tipo === 'rojo' ? 'bg-red-50 text-red-700 ring-1 ring-red-200' :
                    'bg-slate-50 text-slate-500 ring-1 ring-slate-200'
                  }`}>{selectedCompany.tipo}</span>
                )}
                <button onClick={() => setSelectedCompany(null)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="p-5 space-y-6">

              {/* Enrichment status */}
              {selectedCompany.enrichment_status && (
                <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                    selectedCompany.enrichment_status === 'scraped' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' :
                    selectedCompany.enrichment_status === 'db_matched' ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' :
                    selectedCompany.enrichment_status === 'pending' ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' :
                    'bg-slate-50 text-slate-500 ring-1 ring-slate-200'
                  }`}>
                    {selectedCompany.enrichment_status === 'scraped' ? 'Enriquecida por IA' :
                     selectedCompany.enrichment_status === 'db_matched' ? 'Datos precargados' :
                     selectedCompany.enrichment_status === 'pending' ? 'Pendiente de enriquecer' : selectedCompany.enrichment_status}
                  </span>
                  {selectedCompany.enrichment_provider && <span>via {selectedCompany.enrichment_provider}</span>}
                  {selectedCompany.enriched_at && <span>· {new Date(selectedCompany.enriched_at).toLocaleDateString()}</span>}
                </div>
              )}

              {/* Contact info */}
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Contact</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Email</p>
                    <p className="mt-0.5 text-sm text-slate-900 truncate">{selectedCompany.correo || '-'}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Phone</p>
                    <p className="mt-0.5 text-sm text-slate-900">{selectedCompany.telefono || '-'}</p>
                  </div>
                </div>
              </div>

              {/* AI Enriched data */}
              {(selectedCompany.industry || selectedCompany.company_size || selectedCompany.dominio_de_pagina || selectedCompany.website) && (
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">AI Enriched Data</h4>
                  <div className="grid grid-cols-2 gap-3">
                    {selectedCompany.industry && (
                      <div className="bg-lime-50 rounded-xl p-3 border border-lime-100">
                        <p className="text-[10px] font-bold text-lime-600 uppercase">Industry</p>
                        <p className="mt-0.5 text-sm font-semibold text-lime-900">{selectedCompany.industry}</p>
                      </div>
                    )}
                    {selectedCompany.company_size && (
                      <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                        <p className="text-[10px] font-bold text-blue-600 uppercase">Size</p>
                        <p className="mt-0.5 text-sm font-semibold text-blue-900">{selectedCompany.company_size} employees</p>
                      </div>
                    )}
                    {(selectedCompany.dominio_de_pagina || selectedCompany.website) && (
                      <div className="bg-slate-50 rounded-xl p-3 col-span-2">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Website</p>
                        <a href={selectedCompany.dominio_de_pagina || selectedCompany.website} target="_blank" rel="noreferrer"
                          className="mt-0.5 text-sm text-blue-600 hover:underline block truncate">
                          {selectedCompany.dominio_de_pagina || selectedCompany.website}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Location */}
              {(selectedCompany.direccion || selectedCompany.region || selectedCompany.ciudad || selectedCompany.pueblo) && (
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Location</h4>
                  <div className="bg-slate-50 rounded-xl p-3 space-y-1.5">
                    {selectedCompany.direccion && <p className="text-sm text-slate-900">{selectedCompany.direccion}</p>}
                    <p className="text-xs text-slate-500">
                      {[selectedCompany.ciudad, selectedCompany.pueblo, selectedCompany.region, selectedCompany.provincia].filter(Boolean).join(', ') || '-'}
                    </p>
                  </div>
                </div>
              )}

              {/* Work/Sector */}
              {selectedCompany.work && (
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Sector</h4>
                  <span className="inline-block rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                    {selectedCompany.work}
                  </span>
                </div>
              )}

              {/* Description */}
              {selectedCompany.descripcion && (
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Description</h4>
                  <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 rounded-xl p-3">{selectedCompany.descripcion}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const OntarioCompanies: React.FC = () => {
  const [activeProvince, setActiveProvince] = useState<ProvinceKey>('ontario');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Companies</h1>
          <p className="text-sm text-slate-500 mt-0.5">Imported companies database</p>
        </div>

        {/* Toggle switch Ontario / Quebec */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
          <button
            onClick={() => setActiveProvince('ontario')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
              activeProvince === 'ontario' ? 'bg-white text-lime-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Ontario
          </button>
          <button
            onClick={() => setActiveProvince('quebec')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
              activeProvince === 'quebec' ? 'bg-white text-lime-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Quebec
          </button>
        </div>
      </div>

      <ImportedCompaniesPanel province={activeProvince} />
    </div>
  );
};
