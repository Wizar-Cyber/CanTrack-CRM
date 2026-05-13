import React, { useState } from 'react';
import { Users, Search, Filter, AlertTriangle, CheckCircle2 } from 'lucide-react';

export const ProfilesList = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all');

  const profiles = [
    { id: '1', title: 'Automotive Mechanic', category: 'Garage', active: 145, matchingRules: ['Garage', 'Workshop'], risk: 'low' },
    { id: '2', title: 'Industrial Seamstress', category: 'Textile', active: 89, matchingRules: ['Textile', 'Garment'], risk: 'low' },
    { id: '3', title: 'Line Worker', category: 'Manufacturing', active: 320, matchingRules: ['Manufacturing', 'Production'], risk: 'low' },
    { id: '4', title: 'Administrative', category: 'Office', active: 56, matchingRules: ['Office', 'Corporate'], risk: 'high' },
    { id: '5', title: 'Bodywork Technician', category: 'Garage', active: 42, matchingRules: ['Garage', 'Body Shop'], risk: 'low' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Job Profiles (52)</h2>
          <p className="text-sm text-slate-500">Category and smart assignment rule management</p>
        </div>
        <button className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors shadow-sm">
          + New Profile
        </button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3 items-start">
        <AlertTriangle className="w-5 h-5 text-blue-600 mt-0.5" />
        <div>
          <h4 className="text-sm font-bold text-blue-900">Smart Assignment Engine Active</h4>
          <p className="text-xs text-blue-700 mt-1">
            The system automatically prevents assignment errors. For example: an "Administrative" profile will never be offered to a company categorized as "Garage".
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input type="text" placeholder="Search profile…"
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-lime-500/30 focus:border-lime-500 shadow-sm" />
          </div>
          <button onClick={() => setShowFilters(s => !s)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border shadow-sm transition-colors ${
              showFilters ? 'bg-lime-600 text-white border-lime-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}>
            <Filter className="w-4 h-4" />
            Filters
            {categoryFilter !== 'all' && (
              <span className={`text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center ${
                showFilters ? 'bg-white text-lime-600' : 'bg-lime-600 text-white'
              }`}>1</span>
            )}
          </button>
        </div>
        {showFilters && (
          <div className="flex flex-wrap items-center gap-6 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Category</p>
              <div className="flex bg-slate-100 p-1 rounded-lg gap-1">
                {['all', 'Garage', 'Textile', 'Manufacturing', 'Office'].map(c => (
                  <button key={c} onClick={() => setCategoryFilter(c)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      categoryFilter === c ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}>
                    {c === 'all' ? 'All' : c}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
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
                <p className="text-xs font-medium text-slate-500 mb-2">Assignment Rules (Match):</p>
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
                  <span className="text-slate-500 ml-1">active candidates</span>
                </div>
                <button className="text-emerald-600 hover:text-emerald-700 text-sm font-medium">
                  Edit Rules
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
