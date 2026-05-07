import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Briefcase, Building2, Settings as SettingsIcon, LogOut, Layers, ChevronLeft, ChevronRight, MapPin, Bot, Mail, Route } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import logoImg from '../public/logo.jpg';

export const Sidebar: React.FC = () => {
  const location = useLocation();
  const { logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const menuItems = [
    { id: '/', label: 'Dashboard', icon: LayoutDashboard },
    { id: '/jobs', label: 'Job Board', icon: Briefcase },
    { id: '/services', label: 'Services', icon: Layers },
    { id: '/companies', label: 'Companies', icon: Building2 },
    { id: '/campaigns', label: 'Campaigns', icon: Mail },
    { id: '/visits', label: 'Visit Planner', icon: MapPin },
    { id: '/routes', label: 'Routes', icon: Route },
    { id: '/agent', label: 'AI Agent', icon: Bot },
  ];

  return (
    <motion.aside 
      initial={false}
      animate={{ width: collapsed ? 80 : 256 }}
      className="bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0 z-20"
    >
      <div className="p-6 flex items-center justify-between">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="w-8 h-8 shrink-0 overflow-hidden">
            <img src={logoImg} alt="Logo" className="w-full h-full object-cover" />
          </div>
          {!collapsed && (
            <motion.h1 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-lg font-black text-slate-900 tracking-tight uppercase whitespace-nowrap"
            >
              VSM Services
            </motion.h1>
          )}
        </div>
      </div>

      <button 
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-8 w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-400 hover:text-lime-600 hover:border-lime-200 shadow-sm transition-colors z-30"
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>

      <div className="px-4 flex-1 overflow-y-auto">
        <nav className="space-y-1">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.id;
            return (
              <Link
                key={item.id}
                to={item.id}
                title={collapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-lime-50 text-lime-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                } ${collapsed ? 'justify-center' : ''}`}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto p-4 border-t border-slate-100 space-y-1">
        <Link 
          to="/settings"
          title={collapsed ? "Settings" : undefined}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            location.pathname === '/settings' ? 'bg-lime-50 text-lime-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          } ${collapsed ? 'justify-center' : ''}`}
        >
          <SettingsIcon className="w-5 h-5 shrink-0" />
          {!collapsed && <span>Settings</span>}
        </Link>
        <button 
          onClick={logout}
          title={collapsed ? "Logout" : undefined}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-rose-600 hover:bg-rose-50 transition-colors mt-2 ${collapsed ? 'justify-center' : ''}`}
        >
          <LogOut className="w-5 h-5 shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </motion.aside>
  );
};
