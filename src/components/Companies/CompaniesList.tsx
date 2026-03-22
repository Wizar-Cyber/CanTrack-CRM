import React, { useState } from 'react';
import { Search, Filter, Building2, Phone, Mail, MapPin, AlertCircle } from 'lucide-react';

export const CompaniesList = () => {
  const [searchTerm, setSearchTerm] = useState('');

  // Mock data for 16k companies
  const companies = [
    { id: '1', name: 'AutoRepair Pro', industry: 'Garaje', size: 'green', employees: 15, location: 'Montreal, QC', lastContact: '2023-10-25' },
    { id: '2', name: 'Textiles Elite', industry: 'Textil', size: 'orange', employees: 45, location: 'Laval, QC', lastContact: '2023-10-20' },
    { id: '3', name: 'Logistics Hub', industry: 'Logística', size: 'red', employees: 120, location: 'Brossard, QC', lastContact: '2023-09-15' },
    { id: '4', name: 'City Mechanics', industry: 'Garaje', size: 'green', employees: 8, location: 'Montreal, QC', lastContact: '2023-10-26' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Directorio de Empresas</h2>
          <p className="text-sm text-slate-500">Gestionando 16,000 empresas centralizadas</p>
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
            Exportar a Excel
          </button>
          <button className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors shadow-sm">
            + Nueva Empresa
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nombre, industria o ubicación..."
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">
          <Filter className="w-4 h-4" />
          Filtros
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
            <tr>
              <th className="px-6 py-4 font-medium">Empresa</th>
              <th className="px-6 py-4 font-medium">Industria</th>
              <th className="px-6 py-4 font-medium">Clasificación</th>
              <th className="px-6 py-4 font-medium">Ubicación</th>
              <th className="px-6 py-4 font-medium">Último Contacto</th>
              <th className="px-6 py-4 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {companies.map((company) => (
              <tr key={company.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">{company.name}</p>
                      <p className="text-xs text-slate-500">{company.employees} empleados</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-slate-600">{company.industry}</td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                    company.size === 'green' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                    company.size === 'orange' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                    'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      company.size === 'green' ? 'bg-emerald-500' :
                      company.size === 'orange' ? 'bg-amber-500' :
                      'bg-rose-500'
                    }`}></span>
                    {company.size === 'green' ? 'Pequeña (Verde)' :
                     company.size === 'orange' ? 'Mediana (Naranja)' :
                     'Grande (Rojo)'}
                  </span>
                </td>
                <td className="px-6 py-4 text-slate-600">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-slate-400" />
                    {company.location}
                  </div>
                </td>
                <td className="px-6 py-4 text-slate-600">{company.lastContact}</td>
                <td className="px-6 py-4 text-right">
                  <button className="text-emerald-600 hover:text-emerald-700 font-medium text-sm">
                    Ver Detalles
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
