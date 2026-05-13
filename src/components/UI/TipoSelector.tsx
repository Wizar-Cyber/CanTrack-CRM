import React, { useState } from 'react';
import { CompanyTipo } from '../../types';
import { TIPO_CONFIG } from '../../utils/tipo';
import { apiJson } from '../../services/apiClient';
import { Loader2 } from 'lucide-react';

interface TipoSelectorProps {
  companyId: string;
  current: CompanyTipo;
  onUpdate?: (tipo: CompanyTipo) => void;
  /** Si compact=true muestra solo el punto de color sin texto */
  compact?: boolean;
}

export const TipoSelector: React.FC<TipoSelectorProps> = ({
  companyId, current, onUpdate, compact = false,
}) => {
  const [saving, setSaving] = useState(false);
  const [open, setOpen]     = useState(false);

  const select = async (tipo: CompanyTipo) => {
    setOpen(false);
    if (tipo === current) return;
    setSaving(true);
    try {
      await apiJson(`/api/companies/${companyId}/tipo`, {
        method: 'PATCH',
        body: JSON.stringify({ tipo }),
      });
      onUpdate?.(tipo);
    } catch (e) {
      console.error('[TipoSelector]', e);
    } finally {
      setSaving(false);
    }
  };

  const cfg = current ? TIPO_CONFIG[current] : null;

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={saving}
        className={`flex items-center gap-1.5 rounded-full text-xs font-medium transition-all border ${
          cfg ? cfg.badge : 'bg-gray-100 text-gray-400 border-gray-200'
        } ${compact ? 'p-1' : 'px-2.5 py-1'} hover:opacity-80`}
        title={cfg ? cfg.action : 'Unclassified — click to assign'}
      >
        {saving
          ? <Loader2 className="w-3 h-3 animate-spin" />
          : cfg
            ? <><span>{cfg.emoji}</span>{!compact && <span>{cfg.label}</span>}</>
            : <span className={compact ? '' : 'italic'}>{compact ? '○' : 'No type'}</span>
        }
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {/* Dropdown */}
          <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden w-52">
            <div className="p-1.5 space-y-0.5">
              {(Object.entries(TIPO_CONFIG) as [NonNullable<CompanyTipo>, typeof TIPO_CONFIG[NonNullable<CompanyTipo>]][]).map(([key, c]) => (
                <button
                  key={key}
                  onClick={() => select(key)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                    current === key
                      ? `${c.badge} font-semibold`
                      : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <span className="text-base leading-none">{c.emoji}</span>
                  <div>
                    <p className="font-medium text-xs">{c.label}</p>
                    <p className="text-[10px] text-gray-400 leading-tight">{c.action}</p>
                  </div>
                </button>
              ))}
              {/* Limpiar */}
              {current && (
                <button
                  onClick={() => select(null)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:bg-gray-50 transition-colors border-t border-gray-100 mt-1"
                >
                  ✕ Remove classification
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
