import React, { useState, useMemo, useEffect } from 'react';
import { Building2, LayoutGrid, List, MapPin, Briefcase, Database, Globe, Loader2, AlertCircle, Zap } from 'lucide-react';
import { Company, Job } from '../../types';

interface CompanyListProps {
  companies: Company[];
  jobs: Job[];
  onSelectCompany: (company: Company) => void;
  onUpdateCompany?: (company: Company) => void;
  enrichingIds?: Set<string>;
}

export const CompanyList: React.FC<CompanyListProps> = ({ 
  companies, 
  jobs, 
  onSelectCompany, 
  onUpdateCompany,
  enrichingIds = new Set()
}) => {
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [filter, setFilter] = useState<'all' | 'with_vacancies' | 'pending'>('all');
  const [sizeFilter, setSizeFilter] = useState<'all' | 'Small' | 'Medium' | 'Large' | 'Enterprise'>('all');
  const [ownershipFilter, setOwnershipFilter] = useState<'all' | 'Public' | 'Private'>('all');

  const filteredCompanies = useMemo(() => {
    let result = companies;

    // Status Filter
    if (filter === 'pending') {
      result = result.filter(c => c.enrichmentStatus === 'pending');
    } else if (filter === 'with_vacancies') {
      result = result.filter(company => 
        jobs.some(job => job.companyId === company.id || job.companyName === company.name)
      );
    }

    // Size Filter
    if (sizeFilter !== 'all') {
      result = result.filter(c => {
        if (!c.size) return false;
        if (sizeFilter === 'Small') return c.size.includes('1-50') || c.size.includes('11-50');
        if (sizeFilter === 'Medium') return c.size.includes('51-200') || c.size.includes('201-500');
        if (sizeFilter === 'Large') return c.size.includes('501-1000') || c.size.includes('1001-5000');
        if (sizeFilter === 'Enterprise') return c.size.includes('5001-10000') || c.size.includes('10001+');
        return false;
      });
    }

    // Ownership Filter
    if (ownershipFilter !== 'all') {
      result = result.filter(c => {
        if (ownershipFilter === 'Public') return c.isPubliclyTraded === true;
        if (ownershipFilter === 'Private') return c.isPubliclyTraded === false;
        return true;
      });
    }

    return result;
  }, [companies, jobs, filter, sizeFilter, ownershipFilter]);

  const getCompanyJobs = (company: Company) => {
    return jobs.filter(job => job.companyId === company.id || job.companyName === company.name);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-slate-900">Enriched Companies</h2>
          {enrichingIds.size > 0 && (
            <div className="flex items-center gap-2 px-3 py-1 bg-lime-50 text-lime-700 rounded-full border border-lime-100 animate-pulse">
              <Zap className="w-3 h-3 fill-current" />
              <span className="text-xs font-bold uppercase tracking-wider">Auto-Enriching {enrichingIds.size}</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-4">
          {/* View Mode Toggle */}
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'grid' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'table' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
              title="Table View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center gap-6 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</p>
          <div className="flex bg-slate-100 p-1 rounded-lg">
            {(['all', 'with_vacancies', 'pending'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  filter === f ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {f === 'all' ? 'All' : f === 'with_vacancies' ? 'Vacancies' : 'Processing'}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Company Size</p>
          <div className="flex bg-slate-100 p-1 rounded-lg">
            {(['all', 'Small', 'Medium', 'Large', 'Enterprise'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSizeFilter(s)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  sizeFilter === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {s === 'all' ? 'All' : s}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ownership</p>
          <div className="flex bg-slate-100 p-1 rounded-lg">
            {(['all', 'Public', 'Private'] as const).map((o) => (
              <button
                key={o}
                onClick={() => setOwnershipFilter(o)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  ownershipFilter === o ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {o === 'all' ? 'All' : o}
              </button>
            ))}
          </div>
        </div>
      </div>

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCompanies.map(company => {
            const companyJobs = getCompanyJobs(company);
            const isPending = company.enrichmentStatus === 'pending';
            const isEnriching = enrichingIds.has(company.id);

            return (
              <div 
                key={company.id} 
                onClick={() => !isPending && onSelectCompany(company)}
                className={`bg-white p-6 rounded-xl border shadow-sm transition-all flex flex-col h-full ${
                  isPending ? 'border-dashed border-slate-300' : 'border-slate-200 hover:shadow-md hover:border-lime-500 cursor-pointer group'
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className={`text-lg font-bold transition-colors ${isPending ? 'text-slate-700' : 'text-slate-900 group-hover:text-lime-700'}`}>
                      {company.name}
                    </h3>
                    {!isPending && <p className="text-sm text-slate-500 mt-1">{company.industry}</p>}
                  </div>
                  {!isPending && company.isPubliclyTraded && (
                    <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-[10px] font-bold tracking-wider">
                      {company.stockTicker}
                    </span>
                  )}
                </div>
                
                <div className="space-y-3 flex-1">
                  {isPending ? (
                    <div className="flex flex-col items-center justify-center h-full py-8 space-y-4">
                      <div className="relative">
                        <div className="w-12 h-12 border-4 border-lime-100 border-t-lime-600 rounded-full animate-spin"></div>
                        <Database className="w-5 h-5 text-lime-600 absolute inset-0 m-auto" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-bold text-slate-900">Automatic Enrichment</p>
                        <p className="text-xs text-slate-500 mt-1">Matching DB & Scraping Web...</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="truncate" title={company.exactAddress || (company.hqCity ? `${company.hqCity}, ${company.hqProvince}` : 'Location unknown')}>
                          {company.hqCity ? `${company.hqCity}, ${company.hqProvince}` : 'Location unknown'}
                        </span>
                      </div>
                      
                      {companyJobs.length > 0 && (
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <Briefcase className="w-4 h-4 text-slate-400 shrink-0" />
                          <span>{companyJobs.length} active {companyJobs.length === 1 ? 'vacancy' : 'vacancies'}</span>
                        </div>
                      )}
                      
                      {company.techStack && company.techStack.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-2">
                          {company.techStack.slice(0, 3).map(tech => (
                            <span key={tech} className="px-2 py-0.5 bg-slate-50 border border-slate-100 text-slate-600 rounded text-[10px] font-medium">
                              {tech}
                            </span>
                          ))}
                          {company.techStack.length > 3 && (
                            <span className="px-2 py-0.5 bg-slate-50 border border-slate-100 text-slate-400 rounded text-[10px] font-medium">
                              +{company.techStack.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {!isPending && (
                  <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      company.confidenceScore && company.confidenceScore >= 90 ? 'bg-emerald-50 text-emerald-700' :
                      company.confidenceScore && company.confidenceScore >= 70 ? 'bg-amber-50 text-amber-700' :
                      'bg-rose-50 text-rose-700'
                    }`}>
                      {company.confidenceScore}% Match
                    </span>
                    {company.needsManualReview && (
                      <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">
                        Review Needed
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {filteredCompanies.length === 0 && (
            <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-200 rounded-xl">
              <Building2 className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-slate-900">No companies found</h3>
              <p className="text-slate-500">Try changing your filters.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Company</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Exact Address</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Requested Roles</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status / Match</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCompanies.map(company => {
                  const companyJobs = getCompanyJobs(company);
                  const isPending = company.enrichmentStatus === 'pending';
                  const isEnriching = enrichingIds.has(company.id);

                  return (
                    <tr 
                      key={company.id}
                      onClick={() => !isPending && onSelectCompany(company)}
                      className={`transition-colors ${isPending ? 'bg-slate-50/50' : 'hover:bg-slate-50 cursor-pointer group'}`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-md flex items-center justify-center border shrink-0 ${isPending ? 'bg-white border-dashed border-slate-300' : 'bg-slate-100 border-slate-200'}`}>
                            <Building2 className={`w-4 h-4 ${isPending ? 'text-slate-300' : 'text-slate-400'}`} />
                          </div>
                          <div>
                            <p className={`text-sm font-bold transition-colors ${isPending ? 'text-slate-700' : 'text-slate-900 group-hover:text-lime-700'}`}>{company.name}</p>
                            {!isPending && <p className="text-xs text-slate-500">{company.industry}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {isPending ? (
                          <div className="flex items-center gap-2 text-xs text-lime-600 font-medium">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Auto-Enriching...</span>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2 max-w-xs">
                            <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                            <span className="text-sm text-slate-600">
                              {company.exactAddress || 'Address not available'}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {companyJobs.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {companyJobs.map(job => (
                              <span key={job.id} className="px-2 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded text-[10px] font-medium whitespace-nowrap">
                                {job.title}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-sm text-slate-400 italic">No active vacancies</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {isPending ? (
                          <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                            <Database className="w-3 h-3" />
                            Matching DB
                          </div>
                        ) : (
                          <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                            company.confidenceScore && company.confidenceScore >= 90 ? 'bg-emerald-50 text-emerald-700' :
                            company.confidenceScore && company.confidenceScore >= 70 ? 'bg-amber-50 text-amber-700' :
                            'bg-rose-50 text-rose-700'
                          }`}>
                            {company.confidenceScore}%
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredCompanies.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                      No companies found matching the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
