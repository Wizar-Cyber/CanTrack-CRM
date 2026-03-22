import React from 'react';
import { Search, User } from 'lucide-react';

export const Topbar: React.FC = () => {
  return (
    <header className="h-16 bg-white border-bottom border-slate-200 px-8 flex items-center justify-between sticky top-0 z-10">
      <div className="relative w-96">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search jobs, companies, or notes..."
          className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
        />
      </div>

      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm font-medium text-slate-900">Reiber Lozano</p>
          <p className="text-xs text-slate-500">Candidate • Canada</p>
        </div>
        <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center border border-slate-200">
          <User className="w-5 h-5 text-slate-600" />
        </div>
      </div>
    </header>
  );
};
