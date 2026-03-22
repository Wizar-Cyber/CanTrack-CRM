import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, Globe, MapPin, Building, ExternalLink, Mail, Phone, Users, Briefcase, Sparkles, Loader2 } from 'lucide-react';
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
      const data = await getCompanyIntelligence(company.name, company.location || '');
      setIntelligence(data);
      setLoading(false);
    }
    loadIntelligence();
  }, [company.name, company.location]);

  const companyJobs = jobs.filter(j => j.companyId === company.id || j.companyName === company.name);

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
            <h2 className="text-lg font-bold text-slate-900">{company.name}</h2>
            <p className="text-sm text-slate-500">{company.industry || intelligence?.industry || 'Company'}</p>
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
        {/* Quick Info */}
        <div className="flex flex-wrap gap-3 items-center">
          {company.location && (
            <div className="flex items-center gap-1 px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">
              <MapPin className="w-3 h-3" />
              {company.location}
            </div>
          )}
          {company.size && (
            <div className="flex items-center gap-1 px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">
              <Users className="w-3 h-3" />
              {company.size}
            </div>
          )}
          {(company.website || intelligence?.website) && (
            <a 
              href={company.website || intelligence?.website} 
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
              Company Intelligence
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
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Industry</p>
                    <p className="text-sm font-medium text-slate-900">{company.industry || intelligence?.industry || 'N/A'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Size</p>
                    <p className="text-sm font-medium text-slate-900">{company.size || intelligence?.size || 'N/A'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Contact Email</p>
                    {company.contact_email || intelligence?.contact_email ? (
                      <a href={`mailto:${company.contact_email || intelligence?.contact_email}`} className="text-sm font-medium text-blue-600 hover:underline flex items-center gap-1">
                        <Mail className="w-3 h-3" /> {company.contact_email || intelligence?.contact_email}
                      </a>
                    ) : (
                      <p className="text-sm font-medium text-slate-900">N/A</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Phone</p>
                    {company.phone || intelligence?.phone ? (
                      <p className="text-sm font-medium text-slate-900 flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {company.phone || intelligence?.phone}
                      </p>
                    ) : (
                      <p className="text-sm font-medium text-slate-900">N/A</p>
                    )}
                  </div>
                </div>
                
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">About</p>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    {company.description || intelligence?.description || 'No description available.'}
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
