import { CompanyTipo } from '../types';

export const TIPO_CONFIG: Record<NonNullable<CompanyTipo>, {
  label:   string;
  emoji:   string;
  badge:   string;   // Tailwind classes para badge
  dot:     string;   // color del punto
  ring:    string;   // ring para selección activa
  action:  string;   // descripción de acción comercial
}> = {
  verde: {
    label:  'Visita presencial',
    emoji:  '🟢',
    badge:  'bg-green-100 text-green-800 border border-green-200',
    dot:    'bg-green-500',
    ring:   'ring-green-400',
    action: 'Vale la pena visita presencial',
  },
  naranja: {
    label:  'Solo llamadas',
    emoji:  '🟠',
    badge:  'bg-orange-100 text-orange-800 border border-orange-200',
    dot:    'bg-orange-500',
    ring:   'ring-orange-400',
    action: 'Empresa pequeña — llamadas únicamente',
  },
  morado: {
    label:  'Casa / residencia',
    emoji:  '🟣',
    badge:  'bg-purple-100 text-purple-800 border border-purple-200',
    dot:    'bg-purple-500',
    ring:   'ring-purple-400',
    action: 'Residencia — llamadas únicamente',
  },
  rojo: {
    label:  'Cerrada / no existe',
    emoji:  '🔴',
    badge:  'bg-red-100 text-red-700 border border-red-200',
    dot:    'bg-red-500',
    ring:   'ring-red-400',
    action: 'Aparece cerrada o no existe',
  },
};

/** Badge pequeño para usar en tarjetas y tablas */
export function TipoBadge({ tipo, size = 'sm' }: { tipo: CompanyTipo; size?: 'xs' | 'sm' }) {
  if (!tipo) return null;
  const cfg = TIPO_CONFIG[tipo];
  const padding = size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs';
  return `${cfg.emoji} ${cfg.label}`;
}

/** Clases Tailwind del badge según tipo */
export function tipoBadgeClass(tipo: CompanyTipo): string {
  if (!tipo) return 'bg-gray-100 text-gray-400 border border-gray-200';
  return TIPO_CONFIG[tipo].badge;
}

/** Punto de color para listas compactas */
export function tipoDotClass(tipo: CompanyTipo): string {
  if (!tipo) return 'bg-gray-300';
  return TIPO_CONFIG[tipo].dot;
}
