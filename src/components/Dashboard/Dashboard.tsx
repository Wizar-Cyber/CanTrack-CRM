import React from 'react';
import { Briefcase, CheckCircle, Calendar, Users, TrendingUp, Database, Zap, AlertTriangle, Building } from 'lucide-react';
import { DashboardStats, Job, ImportStats } from '../../types';
import { StatusBadge } from '../UI/Badges';

interface DashboardProps {
  stats: DashboardStats;
  recentJobs: Job[];
  onSelectCompany?: (name: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ stats, recentJobs, onSelectCompany }) => {
  const statCards = [
    { label: 'Total Scraped Jobs', value: 1245, icon: Briefcase, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Enriched Companies', value: 342, icon: Building, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Active Applications', value: stats.totalApplications, icon: Calendar, color: 'text-lime-600', bg: 'bg-lime-50' },
    { label: 'Placements', value: stats.placements, icon: CheckCircle, color: 'text-rose-600', bg: 'bg-rose-50' },
  ];

  // Mock import stats based on the backend pipeline
  const lastImport: ImportStats = {
    total: 245,
    jobsNew: 210,
    jobsDuplicate: 35,
    companiesExact: 42,
    companiesFuzzy: 5,
    companiesNew: 18,
    companiesSkipped: 4,
    apiCallsGemini: 18,
    apiCallsPlaces: 18,
    estimatedCostUSD: 0.017,
    errors: [],
    duration: 12500
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Welcome back, Reiber</h2>
          <p className="text-slate-500">Here's an overview of your operations.</p>
        </div>
        <button className="px-4 py-2 bg-lime-600 text-white rounded-lg text-sm font-medium hover:bg-lime-700 transition-colors shadow-sm flex items-center gap-2">
          <Database className="w-4 h-4" />
          Run Scraper Import
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat) => (
          <div key={stat.label} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className={`p-2 rounded-lg ${stat.bg}`}>
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <span className="flex items-center gap-1 text-xs font-medium text-lime-600 bg-lime-50 px-2 py-0.5 rounded-full">
                <TrendingUp className="w-3 h-3" />
                +12%
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
            <h3 className="text-lg font-bold text-slate-900">Recently Scraped Jobs</h3>
            <button className="text-sm font-medium text-lime-600 hover:text-lime-700">View all</button>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="divide-y divide-slate-100">
              {recentJobs.slice(0, 5).map((job) => (
                <div key={job.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center border border-slate-200">
                      <Briefcase className="w-5 h-5 text-slate-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">{job.title}</p>
                        {job.isEasyApply && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded uppercase tracking-wider">
                            <Zap className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-slate-500">
                        <button 
                          onClick={() => onSelectCompany?.(job.companyName)}
                          className="hover:text-lime-600 transition-colors"
                        >
                          {job.companyName}
                        </button>
                        <span>• {job.location}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <StatusBadge status={job.status} />
                    <p className="text-xs text-slate-400">{job.appliedDate || 'Just now'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-bold text-slate-900">Pipeline Status</h3>
          
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-500" />
                <h4 className="font-bold text-slate-900">Last Import Run</h4>
              </div>
              <span className="text-xs font-medium text-slate-500">Today, 08:30 AM</span>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <p className="text-xs text-slate-500 mb-1">New Jobs</p>
                  <p className="text-xl font-bold text-slate-900">{lastImport.jobsNew}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <p className="text-xs text-slate-500 mb-1">New Companies</p>
                  <p className="text-xl font-bold text-slate-900">{lastImport.companiesNew}</p>
                </div>
              </div>
              
              <div className="pt-4 border-t border-slate-100">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-500">Deduplication (Exact/Fuzzy)</span>
                  <span className="font-medium text-slate-900">{lastImport.companiesExact} / {lastImport.companiesFuzzy}</span>
                </div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-500">Skipped (Confidential)</span>
                  <span className="font-medium text-slate-900">{lastImport.companiesSkipped}</span>
                </div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-500">API Calls (Gemini/Places)</span>
                  <span className="font-medium text-slate-900">{lastImport.apiCallsGemini} / {lastImport.apiCallsPlaces}</span>
                </div>
                <div className="flex justify-between text-sm font-medium pt-2 border-t border-slate-100">
                  <span className="text-slate-700">Estimated Cost</span>
                  <span className="text-emerald-600">${lastImport.estimatedCostUSD.toFixed(3)} USD</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-amber-900">Manual Review Needed</h4>
              <p className="text-xs text-amber-700 mt-1">
                2 companies from the last import have a confidence score below 60%.
              </p>
              <button className="text-xs font-bold text-amber-800 mt-2 hover:underline">
                Review Companies →
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
