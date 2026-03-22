import React, { useState } from 'react';
import { Users, Search, Filter, AlertTriangle, CheckCircle2 } from 'lucide-react';

export const ProfilesList = () => {
  const [searchTerm, setSearchTerm] = useState('');

  const profiles = [
    { id: '1', title: 'Mecánico Automotriz', category: 'Garaje', active: 145, matchingRules: ['Garaje', 'Taller'], risk: 'low' },
    { id: '2', title: 'Costurera Industrial', category: 'Textil', active: 89, matchingRules: ['Textil', 'Confección'], risk: 'low' },
    { id: '3', title: 'Trabajador de Línea', category: 'Manufactura', active: 320, matchingRules: ['Manufactura', 'Producción'], risk: 'low' },
    { id: '4', title: 'Administrativo', category: 'Oficina', active: 56, matchingRules: ['Oficina', 'Corporativo'], risk: 'high' },
    { id: '5', title: 'Carrocero', category: 'Garaje', active: 42, matchingRules: ['Garaje', 'Taller de Carrocería'], risk: 'low' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Perfiles Laborales (52)</h2>
          <p className="text-sm text-slate-500">Gestión de categorías y reglas de asignación inteligente</p>
        </div>
        <button className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors shadow-sm">
          + Nuevo Perfil
        </button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3 items-start">
        <AlertTriangle className="w-5 h-5 text-blue-600 mt-0.5" />
        <div>
          <h4 className="text-sm font-bold text-blue-900">Motor de Asignación Inteligente Activo</h4>
          <p className="text-xs text-blue-700 mt-1">
            El sistema previene automáticamente errores de asignación. Por ejemplo: un perfil "Administrativo" nunca será ofrecido a una empresa categorizada como "Garaje".
          </p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar perfil..."
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">
          <Filter className="w-4 h-4" />
          Categorías
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {profiles.map((profile) => (
          <div key={profile.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">{profile.title}</h3>
                  <p className="text-xs text-slate-500">{profile.category}</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-slate-500 mb-2">Reglas de Asignación (Match):</p>
                <div className="flex flex-wrap gap-2">
                  {profile.matchingRules.map((rule, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs font-medium">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      {rule}
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
                <div className="text-sm">
                  <span className="font-bold text-slate-900">{profile.active}</span>
                  <span className="text-slate-500 ml-1">candidatos activos</span>
                </div>
                <button className="text-emerald-600 hover:text-emerald-700 text-sm font-medium">
                  Editar Reglas
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
