import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search, Loader2, Layers, Tag, FileText,
  Package, UtensilsCrossed, Utensils, ChefHat, Scissors, Factory,
  Flame, GlassWater, Truck, PackageOpen, PackagePlus, Bike, Warehouse,
  Snowflake, Wrench, PaintBucket, Hammer, TreePine, Car,
  Settings, Zap, AirVent, ArrowUpDown, Sparkles, Shirt,
  Leaf, Sprout, Tractor, Wheat, Home, BedDouble,
  Building2, PhoneCall, ShoppingBag, ShoppingCart, Shield, Palette, UserCog,
  Shovel, LucideIcon,
} from 'lucide-react';
import { api } from '../../services/apiClient';
import { LetterTemplateModal } from './LetterTemplateModal';

interface ServiceType {
  id: string;
  number: number;
  name: string;
  category: string;
  description: string;
  icon?: string;
  keywords: string[];
}

// ── Íconos por servicio ──────────────────────────────────────────────────────
const SERVICE_ICONS: Record<string, LucideIcon> = {
  'ga-empacadores':              Package,
  'ga-meseros':                  UtensilsCrossed,
  'ga-restaurante':              Utensils,
  'ga-panaderia':                ChefHat,
  'ga-carniceria':               Scissors,
  'ga-matadero':                 Factory,
  'ga-asistente-cocina':         ChefHat,
  'ga-chef':                     ChefHat,
  'ga-pizzero':                  Flame,
  'ga-bartenders':               GlassWater,
  'lg-montacargas':              Truck,
  'lg-conductores':              Truck,
  'lg-carga-descarga':           PackageOpen,
  'lg-mudanzas':                 PackagePlus,
  'lg-domiciliario':             Bike,
  'lg-almacen':                  Warehouse,
  'co-soldador':                 Flame,
  'co-remocion-nieve':           Snowflake,
  'co-plomero':                  Wrench,
  'co-pintor':                   PaintBucket,
  'co-excavacion':               Shovel,
  'co-construccion':             Hammer,
  'co-carpintero':               Hammer,
  'co-ebanista':                 TreePine,
  'co-carroceria':               Car,
  'in-operario-produccion':      Factory,
  'in-operario-maquinaria':      Settings,
  'in-operador-laser':           Zap,
  'mt-electricista':             Zap,
  'mt-reparadores-refrigeradoras': AirVent,
  'mt-mecanico-forklift':        Wrench,
  'mt-tecnico-elevadores':       ArrowUpDown,
  'mt-mecanico':                 Wrench,
  'mt-mecanico-industrial':      Settings,
  'lm-limpieza-industrial':      Sparkles,
  'lm-limpieza':                 Sparkles,
  'lm-mantenimiento':            Wrench,
  'lm-lavanderia':               Shirt,
  'ag-recolectores':             Leaf,
  'ag-invernaderos':             Sprout,
  'ag-operario-agricola':        Tractor,
  'ag-paisajismo':               Leaf,
  'ag-agricultor':               Wheat,
  'sh-empleada-domestica':       Home,
  'sh-mucama':                   BedDouble,
  'ht-hotel':                    Building2,
  'ht-recepcionista':            PhoneCall,
  'cr-tienda-comestibles':       ShoppingBag,
  'cr-supermercado':             ShoppingCart,
  'se-seguridad':                Shield,
  'ds-disenador-interiores':     Palette,
  'gn-general':                  UserCog,
};

// ── Paleta por categoría ─────────────────────────────────────────────────────
interface CategoryStyle {
  icon: string;     // clase Tailwind para el color del ícono
  iconBg: string;   // clase Tailwind para el fondo del ícono
  badge: string;    // clases para el chip de categoría
  dot: string;      // clase para el punto de color
  accent: string;   // hex para el borde izquierdo (inline style)
}

const CAT: Record<string, CategoryStyle> = {
  'Gastronomía & Alimentos':  { icon: 'text-orange-600',  iconBg: 'bg-orange-50',  badge: 'bg-orange-50 text-orange-700 ring-orange-200',    dot: 'bg-orange-400',  accent: '#fb923c' },
  'Logística & Transporte':   { icon: 'text-blue-600',    iconBg: 'bg-blue-50',    badge: 'bg-blue-50 text-blue-700 ring-blue-200',           dot: 'bg-blue-400',    accent: '#60a5fa' },
  'Construcción & Oficios':   { icon: 'text-amber-600',   iconBg: 'bg-amber-50',   badge: 'bg-amber-50 text-amber-700 ring-amber-200',        dot: 'bg-amber-400',   accent: '#fbbf24' },
  'Industria & Producción':   { icon: 'text-slate-600',   iconBg: 'bg-slate-100',  badge: 'bg-slate-100 text-slate-700 ring-slate-200',       dot: 'bg-slate-400',   accent: '#94a3b8' },
  'Mecánica & Técnica':       { icon: 'text-cyan-600',    iconBg: 'bg-cyan-50',    badge: 'bg-cyan-50 text-cyan-700 ring-cyan-200',           dot: 'bg-cyan-400',    accent: '#22d3ee' },
  'Limpieza & Mantenimiento': { icon: 'text-teal-600',    iconBg: 'bg-teal-50',    badge: 'bg-teal-50 text-teal-700 ring-teal-200',           dot: 'bg-teal-400',    accent: '#2dd4bf' },
  'Agricultura & Campo':      { icon: 'text-green-600',   iconBg: 'bg-green-50',   badge: 'bg-green-50 text-green-700 ring-green-200',        dot: 'bg-green-400',   accent: '#4ade80' },
  'Servicios al Hogar':       { icon: 'text-pink-600',    iconBg: 'bg-pink-50',    badge: 'bg-pink-50 text-pink-700 ring-pink-200',           dot: 'bg-pink-400',    accent: '#f472b6' },
  'Hostelería & Turismo':     { icon: 'text-violet-600',  iconBg: 'bg-violet-50',  badge: 'bg-violet-50 text-violet-700 ring-violet-200',     dot: 'bg-violet-400',  accent: '#a78bfa' },
  'Comercio & Retail':        { icon: 'text-indigo-600',  iconBg: 'bg-indigo-50',  badge: 'bg-indigo-50 text-indigo-700 ring-indigo-200',     dot: 'bg-indigo-400',  accent: '#818cf8' },
  'Seguridad':                { icon: 'text-red-600',     iconBg: 'bg-red-50',     badge: 'bg-red-50 text-red-700 ring-red-200',             dot: 'bg-red-400',     accent: '#f87171' },
  'Diseño':                   { icon: 'text-fuchsia-600', iconBg: 'bg-fuchsia-50', badge: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200',  dot: 'bg-fuchsia-400', accent: '#e879f9' },
  'General':                  { icon: 'text-slate-500',   iconBg: 'bg-slate-100',  badge: 'bg-slate-100 text-slate-600 ring-slate-200',       dot: 'bg-slate-300',   accent: '#cbd5e1' },
};

const defaultStyle: CategoryStyle = {
  icon: 'text-lime-600', iconBg: 'bg-lime-50',
  badge: 'bg-lime-50 text-lime-700 ring-lime-200',
  dot: 'bg-lime-400', accent: '#84cc16',
};

function getStyle(cat: string): CategoryStyle {
  return CAT[cat] ?? defaultStyle;
}

// ── Componente ───────────────────────────────────────────────────────────────
export const ServicesList: React.FC = () => {
  const [services, setServices] = useState<ServiceType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [templateModal, setTemplateModal] = useState<ServiceType | null>(null);

  useEffect(() => {
    api('/api/service-types')
      .then(r => r.json())
      .then(d => setServices(d.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const categories = ['all', ...Array.from(new Set(services.map(s => s.category)))];

  const filtered = services.filter(s => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      s.name.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q) ||
      s.keywords.some(k => k.toLowerCase().includes(q));
    const matchCat = categoryFilter === 'all' || s.category === categoryFilter;
    return matchSearch && matchCat;
  });

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Our Services</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Catalog of the {services.length} labor profiles we offer
          </p>
        </div>

        {/* Stat pills */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-lime-50 border border-lime-200 rounded-lg">
            <Layers className="w-3.5 h-3.5 text-lime-600" />
            <span className="text-xs font-semibold text-lime-700">{services.length} services</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg">
            <Tag className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-xs font-semibold text-slate-600">{categories.length - 1} categories</span>
          </div>
        </div>
      </div>

      {/* ── Search + Filtros ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, category or keyword…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm
              focus:outline-none focus:ring-2 focus:ring-lime-500/30 focus:border-lime-500 transition-colors"
          />
        </div>

        <div className="flex gap-1.5 flex-wrap">
          {categories.map(cat => {
            const s = getStyle(cat);
            const count = cat === 'all'
              ? services.length
              : services.filter(x => x.category === cat).length;
            const isActive = categoryFilter === cat;
            return (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-lime-600 text-white shadow-sm ring-2 ring-lime-600/20'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {cat !== 'all' && (
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? 'bg-white/70' : s.dot}`} />
                )}
                {cat === 'all' ? 'All' : cat}
                <span className={`text-[10px] font-medium ${isActive ? 'opacity-70' : 'text-slate-400'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Grid de servicios ───────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-lime-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 bg-white rounded-xl border-2 border-dashed border-slate-200">
          <Layers className="w-12 h-12 text-slate-200 mb-3" />
          <p className="text-slate-500 font-medium">No services found</p>
        </div>
      ) : (
        <>
          {/* Cantidad de resultados cuando hay búsqueda */}
          {search && (
            <p className="text-sm text-slate-500">
              {filtered.length} result{filtered.length !== 1 ? 's' : ''} for
              <span className="font-semibold text-slate-700"> "{search}"</span>
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <AnimatePresence mode="popLayout">
              {filtered.map(svc => {
                const style = getStyle(svc.category);
                const Icon = SERVICE_ICONS[svc.id] ?? Layers;

                return (
                  <motion.div
                    key={svc.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="group relative bg-white rounded-xl border border-slate-200 border-l-4 p-4 shadow-sm hover:shadow-md transition-all duration-200 cursor-default"
                    style={{ borderLeftColor: style.accent }}
                  >
                    {/* Número del servicio — badge flotante */}
                    <span className="absolute top-3 right-3 text-[10px] font-bold text-slate-300 tabular-nums">
                      #{svc.number}
                    </span>

                    {/* Ícono + nombre */}
                    <div className="flex items-start gap-3 mb-3">
                      <div className={`w-10 h-10 rounded-xl ${style.iconBg} flex items-center justify-center shrink-0 ring-1 ring-inset ring-black/5`}>
                        <Icon className={`w-5 h-5 ${style.icon}`} strokeWidth={1.75} />
                      </div>
                      <div className="min-w-0 pr-5">
                        <h3 className="font-bold text-slate-900 text-sm leading-tight truncate">
                          {svc.name}
                        </h3>
                        {/* Badge categoría */}
                        <span className={`inline-flex items-center gap-1 mt-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full ring-1 ${style.badge}`}>
                          <span className={`w-1 h-1 rounded-full ${style.dot}`} />
                          {svc.category}
                        </span>
                      </div>
                    </div>

                    {/* Descripción */}
                    <p className="text-[11px] leading-relaxed text-slate-500 mb-3 line-clamp-2">
                      {svc.description}
                    </p>

                    {/* Keywords */}
                    <div className="flex flex-wrap gap-1">
                      {svc.keywords.slice(0, 3).map(kw => (
                        <span
                          key={kw}
                          className="px-1.5 py-0.5 bg-slate-50 border border-slate-100 text-slate-400 rounded text-[9px] font-medium leading-none"
                        >
                          {kw}
                        </span>
                      ))}
                      {svc.keywords.length > 3 && (
                        <span className="px-1.5 py-0.5 text-[9px] text-slate-300">
                          +{svc.keywords.length - 3}
                        </span>
                      )}
                    </div>
                    {/* Template button */}
                    <button
                      onClick={e => { e.stopPropagation(); setTemplateModal(svc); }}
                      className="mt-3 flex items-center gap-1 text-[10px] font-semibold text-slate-400 hover:text-lime-600 transition-colors"
                    >
                      <FileText className="w-3 h-3" />
                      Letter template
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </>
      )}
      {/* Template Modal */}
      {templateModal && (
        <LetterTemplateModal
          service={templateModal}
          onClose={() => setTemplateModal(null)}
        />
      )}
    </div>
  );
};
