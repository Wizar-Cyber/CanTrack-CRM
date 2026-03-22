import React from 'react';
import { Building2, Users, PhoneCall, Briefcase, TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const statCards = [
    { label: 'Empresas en CRM', value: '16,000', icon: Building2, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Perfiles Laborales', value: '52', icon: Briefcase, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Candidatos Activos', value: '1,200', icon: Users, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Llamadas Diarias (IA)', value: '65', icon: PhoneCall, color: 'text-amber-600', bg: 'bg-amber-50' },
  ];

  const recentActivity = [
    { id: '1', title: 'Nueva empresa registrada', desc: 'AutoRepair Pro (Garaje)', time: 'Hace 10 min', icon: Building2, color: 'text-blue-500' },
    { id: '2', title: 'Llamada exitosa (Agente de Voz)', desc: 'Textiles Elite - Interesado', time: 'Hace 25 min', icon: PhoneCall, color: 'text-emerald-500' },
    { id: '3', title: 'Alerta de asignación', desc: 'Intento de asignar Administrativo a Garaje bloqueado', time: 'Hace 1 hora', icon: AlertTriangle, color: 'text-amber-500' },
    { id: '4', title: 'Sincronización completada', desc: 'QuickBooks y Nextcloud actualizados', time: 'Hace 2 horas', icon: CheckCircle2, color: 'text-purple-500' },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Panel de Control - StaffingSync</h2>
          <p className="text-slate-500">Resumen operativo de la agencia de reclutamiento.</p>
        </div>
        <button className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors shadow-sm">
          Generar Reporte
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat) => (
          <div key={stat.label} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className={`p-2 rounded-lg ${stat.bg}`}>
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                <TrendingUp className="w-3 h-3" />
                Estable
              </span>
            </div>
            <p className="text-sm font-medium text-slate-500">{stat.label}</p>
            <p className="text-3xl font-bold text-slate-900 mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">Actividad Reciente</h3>
            <button className="text-sm font-medium text-emerald-600 hover:text-emerald-700">Ver todo</button>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="divide-y divide-slate-100">
              {recentActivity.map((activity) => (
                <div key={activity.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center border border-slate-200">
                      <activity.icon className={`w-5 h-5 ${activity.color}`} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{activity.title}</p>
                      <p className="text-xs text-slate-500">{activity.desc}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <p className="text-xs text-slate-400">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-bold text-slate-900">Estado del Sistema</h3>
          <div className="bg-slate-900 rounded-xl p-6 text-white shadow-lg relative overflow-hidden">
            <div className="relative z-10">
              <p className="text-emerald-400 text-xs font-bold uppercase tracking-widest mb-2">Motor de Asignación</p>
              <h4 className="text-xl font-bold mb-4">0 Errores de Asignación Detectados</h4>
              <p className="text-slate-300 text-sm leading-relaxed mb-6">
                El sistema está categorizando correctamente los 52 perfiles. Las reglas de negocio están previniendo asignaciones incorrectas (ej. Administrativo a Garaje).
              </p>
              <button className="w-full py-2 bg-white/10 text-white rounded-lg text-sm font-bold hover:bg-white/20 transition-colors">
                Ver Reglas de Asignación
              </button>
            </div>
            <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-emerald-500 rounded-full blur-3xl opacity-20"></div>
          </div>
        </div>
      </div>
    </div>
  );
};
