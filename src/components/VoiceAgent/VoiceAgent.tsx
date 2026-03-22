import React, { useState } from 'react';
import { Mic, PhoneCall, Play, Square, Clock, DollarSign, Globe, Settings2 } from 'lucide-react';

export const VoiceAgent = () => {
  const [isActive, setIsActive] = useState(false);

  const stats = [
    { label: 'Llamadas Hoy', value: '42/65', icon: PhoneCall, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Minutos Consumidos', value: '128 min', icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Costo Estimado', value: '$15.36', icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Tasa de Éxito', value: '68%', icon: Globe, color: 'text-purple-600', bg: 'bg-purple-50' },
  ];

  const recentCalls = [
    { id: '1', company: 'AutoRepair Pro', duration: '2m 15s', status: 'Interesado', lang: 'FR', cost: '$0.27', time: '10:45 AM' },
    { id: '2', company: 'Textiles Elite', duration: '1m 30s', status: 'No contesta', lang: 'FR', cost: '$0.18', time: '10:30 AM' },
    { id: '3', company: 'Logistics Hub', duration: '4m 10s', status: 'Reunión Agendada', lang: 'EN', cost: '$0.50', time: '09:15 AM' },
    { id: '4', company: 'City Mechanics', duration: '3m 05s', status: 'Interesado', lang: 'FR', cost: '$0.37', time: '08:50 AM' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Agente de Voz Bilingüe</h2>
          <p className="text-sm text-slate-500">Automatización de 65 llamadas diarias (FR/EN)</p>
        </div>
        <div className="flex gap-3">
          <button className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors flex items-center gap-2">
            <Settings2 className="w-4 h-4" />
            Configurar Guiones
          </button>
          <button
            onClick={() => setIsActive(!isActive)}
            className={`px-4 py-2 text-white rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2 ${
              isActive ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {isActive ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
            {isActive ? 'Detener Agente' : 'Iniciar Campaña'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, idx) => (
          <div key={idx} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${stat.bg}`}>
              <stat.icon className={`w-6 h-6 ${stat.color}`} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">{stat.label}</p>
              <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center">
          <h3 className="font-bold text-slate-900">Registro de Llamadas Recientes</h3>
          <span className="text-xs font-medium text-slate-500">Cobro por minuto activo</span>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
            <tr>
              <th className="px-6 py-4 font-medium">Empresa</th>
              <th className="px-6 py-4 font-medium">Idioma</th>
              <th className="px-6 py-4 font-medium">Duración</th>
              <th className="px-6 py-4 font-medium">Costo</th>
              <th className="px-6 py-4 font-medium">Resultado</th>
              <th className="px-6 py-4 font-medium text-right">Hora</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {recentCalls.map((call) => (
              <tr key={call.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 font-medium text-slate-900">{call.company}</td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center px-2 py-1 rounded text-xs font-bold bg-slate-100 text-slate-600">
                    {call.lang}
                  </span>
                </td>
                <td className="px-6 py-4 text-slate-600">{call.duration}</td>
                <td className="px-6 py-4 text-slate-600">{call.cost}</td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                    call.status === 'Reunión Agendada' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                    call.status === 'Interesado' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                    'bg-slate-100 text-slate-700 border border-slate-200'
                  }`}>
                    {call.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-right text-slate-500">{call.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
