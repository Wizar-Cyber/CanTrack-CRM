import React from 'react';
import { Blocks, Database, Cloud, Smartphone, Link2, CheckCircle2, AlertCircle } from 'lucide-react';

export const Integrations = () => {
  const integrations = [
    {
      id: 'app',
      name: 'Aplicativo Propio (Escritorio/Móvil)',
      description: 'Sincronización en tiempo real sin afectar tiempos de entrega.',
      status: 'connected',
      icon: Smartphone,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      id: 'nextcloud',
      name: 'Nextcloud',
      description: 'Almacenamiento centralizado de documentos y contratos.',
      status: 'connected',
      icon: Cloud,
      color: 'text-sky-600',
      bg: 'bg-sky-50',
    },
    {
      id: 'quickbooks',
      name: 'QuickBooks',
      description: 'Sincronización de facturación y pagos de clientes.',
      status: 'connected',
      icon: Database,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      id: 'crm',
      name: 'Futuro CRM (API)',
      description: 'Preparado para conexión con el CRM de los ingenieros.',
      status: 'pending',
      icon: Blocks,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    },
    {
      id: 'scraper-indeed',
      name: 'Indeed Web Scraper',
      description: 'Extracción automática de datos de candidatos y empresas.',
      status: 'connected',
      icon: Link2,
      color: 'text-indigo-600',
      bg: 'bg-indigo-50',
    },
    {
      id: 'scraper-linkedin',
      name: 'LinkedIn Web Scraper',
      description: 'Extracción automática de perfiles profesionales.',
      status: 'connected',
      icon: Link2,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Integraciones y APIs</h2>
          <p className="text-sm text-slate-500">Conectando todas las herramientas en una sola plataforma</p>
        </div>
        <button className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors shadow-sm">
          + Nueva Conexión
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {integrations.map((integration) => (
          <div key={integration.id} className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
            <div className="flex items-start justify-between mb-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${integration.bg}`}>
                <integration.icon className={`w-6 h-6 ${integration.color}`} />
              </div>
              {integration.status === 'connected' ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Conectado
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-xs font-bold">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Pendiente
                </span>
              )}
            </div>
            <h3 className="font-bold text-slate-900 mb-2">{integration.name}</h3>
            <p className="text-sm text-slate-500 mb-6">{integration.description}</p>
            
            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
                Configurar API
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
