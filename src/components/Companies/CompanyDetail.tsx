import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, Globe, MapPin, Building, ExternalLink, Mail, Phone, Users, Briefcase, Sparkles, Loader2, AlertTriangle, ShieldAlert, Code } from 'lucide-react';
import { Company, Job } from '../../types';
import { getCompanyIntelligence } from '../../services/geminiService';

interface CompanyDetailProps {
  company: Company;
  jobs: Job[];
  onClose: () => void;
  onViewJob: (job: Job) => void;
}

export const CompanyDetail: React.FC<CompanyDetailProps> = ({ company, jobs, onClose, onViewJob }) => {
  const [intelligence, setIntelligence] = useState<Partial<Company> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadIntelligence() {
      setLoading(true);
      // In a real app, this would fetch from the PostgreSQL DB where the pipeline saved it
      // For now, we simulate a small delay to show the skeleton loader
      setTimeout(() => {
        setIntelligence(company); // The mock data already has the enriched fields
        setLoading(false);
      }, 800);
    }
    loadIntelligence();
  }, [company]);

  const companyJobs = jobs.filter(j => j.companyId === company.id || j.companyName === company.name);

  const displayCompany = { ...company, ...intelligence };

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed inset-y-0 right-0 w-full max-w-xl bg-white shadow-2xl z-50 overflow-y-auto border-l border-slate-200"
    >
      <div className="sticky top-0 bg-white border-b border-slate-100 p-6 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
            <Building className="text-blue-600 w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">{displayCompany.name}</h2>
            <p className="text-sm text-slate-500">{displayCompany.legalName || 'Legal Name Pending'}</p>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="p-2 hover:bg-slate-100 rounded-full transition-colors"
        >
          <X className="w-5 h-5 text-slate-400" />
        </button>
      </div>

      <div className="p-8 space-y-8">
        {displayCompany.needsManualReview && (
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-amber-900">Manual Review Required</h4>
              <p className="text-xs text-amber-700 mt-1">
                The enrichment pipeline flagged this company with a low confidence score ({displayCompany.confidenceScore}%). Please verify the details below.
              </p>
            </div>
          </div>
        )}

        {/* Quick Info */}
        <div className="flex flex-wrap gap-3 items-center">
          {(displayCompany.hqCity || displayCompany.location) && (
            <div className="flex items-center gap-1 px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">
              <MapPin className="w-3 h-3" />
              {displayCompany.hqCity ? `${displayCompany.hqCity}, ${displayCompany.hqProvince}` : displayCompany.location}
            </div>
          )}
          {displayCompany.size && (
            <div className="flex items-center gap-1 px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">
              <Users className="w-3 h-3" />
              {displayCompany.size}
            </div>
          )}
          {displayCompany.isPubliclyTraded && (
            <div className="flex items-center gap-1 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold">
              {displayCompany.stockTicker}
            </div>
          )}
          {displayCompany.website && (
            <a 
              href={displayCompany.website} 
              target="_blank" 
              rel="noreferrer"
              className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white rounded-full text-xs font-medium hover:bg-blue-700 transition-colors"
            >
              Website
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        {/* AI Intelligence Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-500" />
              Enriched Data
            </h3>
            {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
          </div>

          <div className="bg-slate-50 rounded-xl p-6 border border-slate-200 space-y-6">
            {loading ? (
              <div className="space-y-3">
                <div className="h-4 bg-slate-200 rounded w-3/4 animate-pulse"></div>
                <div className="h-4 bg-slate-200 rounded w-1/2 animate-pulse"></div>
                <div className="h-4 bg-slate-200 rounded w-5/6 animate-pulse"></div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-x-4 gap-y-6">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Sector / Industry</p>
                    <p className="text-sm font-medium text-slate-900">
                      {displayCompany.sector} • {displayCompany.industry}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Canadian HQ</p>
                    <p className="text-sm font-medium text-slate-900">
                      {displayCompany.canadianHQ ? 'Yes' : 'No'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Known ATS Portal</p>
                    <p className="text-sm font-medium text-slate-900 capitalize">
                      {displayCompany.knownATSPortal || 'Unknown'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Confidence Score</p>
                    <p className={`text-sm font-bold ${displayCompany.confidenceScore && displayCompany.confidenceScore >= 80 ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {displayCompany.confidenceScore}%
                    </p>
                  </div>
                </div>
                
                {displayCompany.techStack && displayCompany.techStack.length > 0 && (
                  <div className="space-y-2 pt-4 border-t border-slate-200">
                    <p className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                      <Code className="w-3 h-3" /> Tech Stack
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {displayCompany.techStack.map(tech => (
                        <span key={tech} className="px-2 py-1 bg-white border border-slate-200 text-slate-600 text-xs rounded-md font-medium">
                          {tech}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2 pt-4 border-t border-slate-200">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">About</p>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    {displayCompany.description || 'No description available.'}
                  </p>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Open Vacancies at this Company */}
        <section className="space-y-4">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-blue-500" />
            Open Vacancies ({companyJobs.length})
          </h3>
          
          <div className="space-y-3">
            {companyJobs.length > 0 ? (
              companyJobs.map(job => (
                <div 
                  key={job.id} 
                  onClick={() => onViewJob(job)}
                  className="p-4 bg-white border border-slate-200 rounded-xl hover:border-blue-500 hover:shadow-md transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{job.title}</h4>
                      <p className="text-xs text-slate-500">{job.location} • {job.category}</p>
                    </div>
                    <div className="p-2 bg-slate-50 rounded-lg group-hover:bg-blue-50 transition-colors">
                      <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-blue-600" />
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center border-2 border-dashed border-slate-100 rounded-xl">
                <p className="text-sm text-slate-400">No active vacancies found for this company.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </motion.div>
  );
};
