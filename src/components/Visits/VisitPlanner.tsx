/**
 * VisitPlanner — Vista de planificación de visitas
 * - Lista de empresas con checkboxes para seleccionar
 * - Filtros: tamaño, industria, ciudad, con / sin dirección
 * - Búsqueda en tiempo real
 * - Exportar seleccionadas (o todas) a Excel
 */
import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, Building2, Phone, Globe, Download, Search,
  CheckSquare, Square, Filter, X, ChevronDown, ExternalLink,
  SlidersHorizontal, Map,
} from 'lucide-react';
import { Company } from '../../types';
import { api } from '../../services/apiClient';

interface Props {
  companies: Company[];
  onSelectCompany?: (company: Company) => void;
}

const SIZE_ORDER: Record<string, number> = {
  '1-10': 1, '11-50': 2, '51-200': 3, '201-500': 4,
  '501-1000': 5, '1001-5000': 6, '5001-10000': 7, '10001+': 8,
};

const SIZE_COLORS: Record<string, string> = {
  '1-10':     'bg-slate-100 text-slate-600',
  '11-50':    'bg-blue-50 text-blue-700',
  '51-200':   'bg-indigo-50 text-indigo-700',
  '201-500':  'bg-violet-50 text-violet-700',
  '501-1000': 'bg-purple-50 text-purple-700',
  '1001-5000':'bg-fuchsia-50 text-fuchsia-700',
  '5001-10000':'bg-pink-50 text-pink-700',
  '10001+':   'bg-rose-50 text-rose-700',
};

export const VisitPlanner: React.FC<Props> = ({ companies, onSelectCompany }) => {
  const [search, setSearch]         = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterSize, setFilterSize]   = useState('');
  const [filterIndustry, setFilterIndustry] = useState('');
  const [filterCity, setFilterCity]   = useState('');
  const [filterAddress, setFilterAddress] = useState<'all' | 'with' | 'without'>('all');
  const [exporting, setExporting]     = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // ── Opciones únicas para los filtros ──────────────────────────────────────
  const sizes = useMemo(() =>
    [...new Set(companies.map(c => c.size).filter(Boolean))].sort(
      (a, b) => (SIZE_ORDER[a as string] ?? 99) - (SIZE_ORDER[b as string] ?? 99)
    ) as string[], [companies]);

  const industries = useMemo(() =>
    [...new Set(companies.map(c => c.industry).filter(Boolean))].sort() as string[], [companies]);

  const cities = useMemo(() =>
    [...new Set(companies.map(c => c.hqCity).filter(Boolean))].sort() as string[], [companies]);

  // ── Filtrado ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return companies.filter(c => {
      if (q && !(
        c.name.toLowerCase().includes(q) ||
        (c.exactAddress ?? '').toLowerCase().includes(q) ||
        (c.hqCity ?? '').toLowerCase().includes(q) ||
        (c.industry ?? '').toLowerCase().includes(q)
      )) return false;
      if (filterSize && c.size !== filterSize) return false;
      if (filterIndustry && c.industry !== filterIndustry) return false;
      if (filterCity && c.hqCity !== filterCity) return false;
      if (filterAddress === 'with'    && !c.exactAddress) return false;
      if (filterAddress === 'without' && c.exactAddress)  return false;
      return true;
    });
  }, [companies, search, filterSize, filterIndustry, filterCity, filterAddress]);

  // ── Selección ─────────────────────────────────────────────────────────────
  const allFilteredSelected = filtered.length > 0 && filtered.every(c => selectedIds.has(c.id));

  const toggleAll = useCallback(() => {
    if (allFilteredSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filtered.forEach(c => next.delete(c.id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filtered.forEach(c => next.add(c.id));
        return next;
      });
    }
  }, [allFilteredSelected, filtered]);

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Exportar ──────────────────────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true);
    try {
      const ids = selectedIds.size > 0 ? [...selectedIds] : filtered.map(c => c.id);
      const res = await api('/api/companies/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `companies-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('[Export]', e);
    } finally {
      setExporting(false);
    }
  };

  // ── Google Maps ───────────────────────────────────────────────────────────
  const openMaps = (company: Company) => {
    const query = company.exactAddress || `${company.name} ${company.hqCity ?? ''} ${company.hqCountry ?? ''}`;
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, '_blank');
  };

  const activeFilters = [filterSize, filterIndustry, filterCity, filterAddress !== 'all' ? filterAddress : ''].filter(Boolean).length;

  return (
    <div className="space-y-5">
      {/* ── Cabecera ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Map className="w-6 h-6 text-lime-600" />
            Visit Planner
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {filtered.length} company{filtered.length !== 1 ? 'ies' : ''} · {selectedIds.size} selected
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-2 px-4 py-2 bg-lime-600 text-white rounded-lg hover:bg-lime-700 font-medium text-sm shadow-sm disabled:opacity-60 transition-all"
        >
          <Download className="w-4 h-4" />
          {exporting ? 'Exporting…' : selectedIds.size > 0
            ? `Export ${selectedIds.size} selected`
            : `Export all (${filtered.length})`}
        </button>
      </div>

      {/* ── Barra de búsqueda + filtros ── */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex gap-3 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, address, city, industry…"
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-lime-500/30 focus:border-lime-400 bg-slate-50"
            />
          </div>
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${showFilters || activeFilters > 0 ? 'bg-lime-50 border-lime-300 text-lime-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filters
            {activeFilters > 0 && (
              <span className="bg-lime-600 text-white rounded-full text-xs w-5 h-5 flex items-center justify-center">{activeFilters}</span>
            )}
          </button>
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
                <FilterSelect label="Size" value={filterSize} onChange={setFilterSize}
                  options={sizes.map(s => ({ value: s, label: s }))} />
                <FilterSelect label="Industry" value={filterIndustry} onChange={setFilterIndustry}
                  options={industries.map(i => ({ value: i, label: i }))} />
                <FilterSelect label="City" value={filterCity} onChange={setFilterCity}
                  options={cities.map(c => ({ value: c, label: c }))} />
                <FilterSelect label="Address" value={filterAddress} onChange={v => setFilterAddress(v as any)}
                  options={[
                    { value: 'with',    label: 'With address' },
                    { value: 'without', label: 'Without address' },
                  ]} />
              </div>
              {activeFilters > 0 && (
                <button
                  onClick={() => { setFilterSize(''); setFilterIndustry(''); setFilterCity(''); setFilterAddress('all'); }}
                  className="mt-2 text-xs text-slate-500 hover:text-rose-600 flex items-center gap-1"
                >
                  <X className="w-3 h-3" /> Clear filters
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Tabla ── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {/* Cabecera tabla */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-slate-50">
          <button onClick={toggleAll} className="text-slate-400 hover:text-lime-600 transition-colors flex-shrink-0">
            {allFilteredSelected
              ? <CheckSquare className="w-5 h-5 text-lime-600" />
              : <Square className="w-5 h-5" />}
          </button>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex-1">Company</span>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide w-32 hidden md:block">Size</span>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide w-48 hidden lg:block">Industry</span>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex-1 hidden xl:block">Address</span>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide w-28 text-right">Actions</span>
        </div>

        {filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No results</p>
            <p className="text-sm mt-1">Try adjusting the search filters</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map(company => (
              <CompanyRow
                key={company.id}
                company={company}
                selected={selectedIds.has(company.id)}
                onToggle={() => toggleOne(company.id)}
                onOpenDetail={() => onSelectCompany?.(company)}
                onOpenMaps={() => openMaps(company)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Fila de empresa ──────────────────────────────────────────────────────────
const CompanyRow: React.FC<{
  company: Company;
  selected: boolean;
  onToggle: () => void;
  onOpenDetail: () => void;
  onOpenMaps: () => void;
}> = ({ company, selected, onToggle, onOpenDetail, onOpenMaps }) => {
  const sizeClass = SIZE_COLORS[company.size ?? ''] ?? 'bg-slate-100 text-slate-500';

  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors group ${selected ? 'bg-lime-50/60' : ''}`}
    >
      {/* Checkbox */}
      <button onClick={onToggle} className="text-slate-300 hover:text-lime-600 transition-colors flex-shrink-0">
        {selected
          ? <CheckSquare className="w-5 h-5 text-lime-600" />
          : <Square className="w-5 h-5" />}
      </button>

      {/* Nombre + ciudad */}
      <div className="flex-1 min-w-0">
        <button
          onClick={onOpenDetail}
          className="font-medium text-slate-800 hover:text-lime-700 text-sm truncate block max-w-full text-left"
        >
          {company.name}
        </button>
        {(company.hqCity || company.hqCountry) && (
          <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
            <MapPin className="w-3 h-3" />
            {[company.hqCity, company.hqProvince, company.hqCountry].filter(Boolean).join(', ')}
          </p>
        )}
        {company.phone && (
          <p className="text-xs text-slate-400 flex items-center gap-1">
            <Phone className="w-3 h-3" />{company.phone}
          </p>
        )}
      </div>

      {/* Tamaño */}
      <div className="w-32 hidden md:block">
        {company.size
          ? <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${sizeClass}`}>{company.size}</span>
          : <span className="text-xs text-slate-300">—</span>}
      </div>

      {/* Industria */}
      <div className="w-48 hidden lg:block">
        <span className="text-xs text-slate-600 truncate block">{company.industry ?? <span className="text-slate-300">—</span>}</span>
        {company.sector && <span className="text-xs text-slate-400 truncate block">{company.sector}</span>}
      </div>

      {/* Dirección */}
      <div className="flex-1 hidden xl:block min-w-0">
        {company.exactAddress
          ? <span className="text-xs text-slate-600 line-clamp-2">{company.exactAddress}</span>
          : <span className="text-xs text-slate-300 italic">No address</span>}
      </div>

      {/* Acciones */}
      <div className="w-28 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <ActionBtn onClick={onOpenMaps} title="View on Google Maps" icon={<MapPin className="w-3.5 h-3.5" />} />
        {company.website && (
          <ActionBtn
            onClick={() => window.open(company.website, '_blank')}
            title="Website"
            icon={<Globe className="w-3.5 h-3.5" />}
          />
        )}
        <ActionBtn onClick={onOpenDetail} title="View details" icon={<ExternalLink className="w-3.5 h-3.5" />} />
      </div>
    </motion.div>
  );
};

const ActionBtn: React.FC<{ onClick: () => void; title: string; icon: React.ReactNode }> = ({ onClick, title, icon }) => (
  <button
    onClick={onClick}
    title={title}
    className="p-1.5 rounded-md hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors"
  >
    {icon}
  </button>
);

const FilterSelect: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}> = ({ label, value, onChange, options }) => (
  <div className="relative">
    <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`w-full text-sm border rounded-lg px-3 py-1.5 pr-7 appearance-none focus:outline-none focus:ring-2 focus:ring-lime-500/30 focus:border-lime-400 ${value ? 'border-lime-300 bg-lime-50 text-lime-800' : 'border-slate-200 bg-white text-slate-700'}`}
      >
        <option value="">Todos</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
    </div>
  </div>
);
