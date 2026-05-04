import React, { useEffect, useMemo, useState } from 'react';
import { Building2, ChevronLeft, ChevronRight, Eye, Search, Trash2, X } from 'lucide-react';
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

interface Stats {
  active: number;
  duplicates: number;
  pending: number;
  processed: number;
  total: number;
}

const PROVINCES: Record<ProvinceKey, { label: string; description: string }> = {
  ontario: {
    label: 'Ontario',
    description: 'Empresas importadas desde la base de Ontario',
  },
  quebec: {
    label: 'Quebec',
    description: 'Empresas importadas desde la base de Quebec',
  },
};

const pageSize = 50;

export const ImportedCompaniesPanel: React.FC<{ province: ProvinceKey }> = ({ province }) => {
  const config = PROVINCES[province];
  const [companies, setCompanies] = useState<ImportedCompany[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedCompany, setSelectedCompany] = useState<ImportedCompany | null>(null);

  useEffect(() => {
    setPage(1);
  }, [province]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(pageSize),
          search,
        });
        const [companiesResponse, statsResponse] = await Promise.all([
          apiJson<CompaniesResponse>(`/api/${province}/companies?${params.toString()}`),
          apiJson<Stats>(`/api/${province}/stats`),
        ]);
        if (cancelled) return;
        setCompanies(companiesResponse.data);
        setStats(statsResponse);
        setTotalPages(Math.max(1, companiesResponse.pagination.pages || 1));
      } catch (error) {
        console.error(`Error loading ${province} companies:`, error);
        if (!cancelled) {
          setCompanies([]);
          setStats(null);
          setTotalPages(1);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const interval = window.setInterval(load, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [page, province, search]);

  async function handleDelete(id: string) {
    if (!confirm('¿Marcar esta empresa como duplicada?')) return;
    try {
      await apiJson(`/api/${province}/companies/${id}`, { method: 'DELETE' });
      setCompanies(prev => prev.filter(company => company.id !== id));
      setStats(prev => prev ? {
        ...prev,
        active: Math.max(0, prev.active - 1),
        duplicates: prev.duplicates + 1,
      } : prev);
    } catch (error) {
      console.error('Error marking duplicate:', error);
      alert('No se pudo marcar como duplicada.');
    }
  }

  const statItems = useMemo(() => [
    ['Total', stats?.total ?? 0],
    ['Activas', stats?.active ?? 0],
    ['Duplicadas', stats?.duplicates ?? 0],
    ['Pendientes', stats?.pending ?? 0],
    ['Procesadas', stats?.processed ?? 0],
  ], [stats]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-slate-500">
            <Building2 className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Base importada</span>
          </div>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">{config.label} Companies</h2>
          <p className="text-sm text-slate-500">{config.description}</p>
        </div>

        <div className="relative w-full lg:w-96">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="search"
            placeholder="Buscar por nombre, email o ciudad"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-lime-400 focus:ring-2 focus:ring-lime-100"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {statItems.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-slate-600">Nombre</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-slate-600">Email</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-slate-600">Telefono</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-slate-600">Ciudad</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-slate-600">Work</th>
                <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">Cargando empresas...</td>
                </tr>
              ) : companies.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">No hay empresas para mostrar.</td>
                </tr>
              ) : companies.map(company => (
                <tr key={company.id} className="hover:bg-slate-50">
                  <td className="max-w-xs px-4 py-3 text-sm font-semibold text-slate-900">
                    <span className="block truncate" title={company.nombre}>{company.nombre}</span>
                    <span className="text-xs font-normal text-slate-500">{company.provincia || config.label}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{company.correo || '-'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{company.telefono || '-'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{company.ciudad || company.pueblo || '-'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{company.work || '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => setSelectedCompany(company)}
                        className="rounded-md p-2 text-slate-500 hover:bg-lime-50 hover:text-lime-700"
                        title="Ver detalle"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(company.id)}
                        className="rounded-md p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700"
                        title="Marcar duplicada"
                      >
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

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Pagina {page} de {totalPages}</p>
        <div className="flex gap-2">
          <button
            onClick={() => setPage(current => Math.max(1, current - 1))}
            disabled={page === 1}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </button>
          <button
            onClick={() => setPage(current => Math.min(totalPages, current + 1))}
            disabled={page >= totalPages}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            Siguiente
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {selectedCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[86vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-slate-900">{selectedCompany.nombre}</h3>
                <p className="text-sm text-slate-500">{selectedCompany.ciudad || selectedCompany.pueblo || config.label}</p>
              </div>
              <button
                onClick={() => setSelectedCompany(null)}
                className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                title="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[
                ['Email', selectedCompany.correo],
                ['Telefono', selectedCompany.telefono],
                ['Provincia', selectedCompany.provincia],
                ['Region', selectedCompany.region],
                ['Ciudad', selectedCompany.ciudad],
                ['Pueblo', selectedCompany.pueblo],
                ['Work', selectedCompany.work],
                ['Dominio', selectedCompany.dominio_de_pagina],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs font-bold uppercase text-slate-500">{label}</dt>
                  <dd className="mt-1 break-words text-sm text-slate-900">{value || '-'}</dd>
                </div>
              ))}
            </dl>

            {selectedCompany.direccion && (
              <div className="mt-4">
                <p className="text-xs font-bold uppercase text-slate-500">Direccion</p>
                <p className="mt-1 text-sm text-slate-900">{selectedCompany.direccion}</p>
              </div>
            )}

            {selectedCompany.descripcion && (
              <div className="mt-4">
                <p className="text-xs font-bold uppercase text-slate-500">Descripcion</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-900">{selectedCompany.descripcion}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const OntarioCompanies: React.FC = () => {
  const [activeProvince, setActiveProvince] = useState<ProvinceKey>('ontario');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        {(Object.keys(PROVINCES) as ProvinceKey[]).map(key => (
          <button
            key={key}
            onClick={() => setActiveProvince(key)}
            className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${
              activeProvince === key
                ? 'border-lime-500 text-lime-700'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            {PROVINCES[key].label}
          </button>
        ))}
      </div>

      <ImportedCompaniesPanel province={activeProvince} />
    </div>
  );
};
