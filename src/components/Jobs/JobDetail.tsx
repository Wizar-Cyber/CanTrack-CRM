import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  X, Globe, MapPin, Users, Building, ExternalLink,
  Mail, Phone, Building2, Calendar, Zap, Briefcase, Clock, ShieldCheck,
} from 'lucide-react';
import { Job, Company } from '../../types';
import { SourceBadge } from '../UI/Badges';

interface JobDetailProps {
  job: Job;
  company?: Company;
  onClose: () => void;
  onSelectCompany?: (name: string) => void;
}

const EnrichmentBadge: React.FC<{ status?: string }> = ({ status }) => {
  if (!status || status === 'pending') return null;
  const cfg = {
    scraped: { label: 'Enriquecida', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
    db_matched: { label: 'Datos precargados', cls: 'bg-blue-50 text-blue-700 ring-blue-200' },
  } as const;
  const c = cfg[status as keyof typeof cfg];
  if (!c) return null;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ring-1 ${c.cls}`}>
      <ShieldCheck className="w-2.5 h-2.5" />{c.label}
    </span>
  );
};

const Pill: React.FC<{ icon?: React.ReactNode; children: React.ReactNode }> = ({ icon, children }) => (
  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">
    {icon}{children}
  </span>
);

export const JobDetail: React.FC<JobDetailProps> = ({ job, company, onClose, onSelectCompany }) => {
  const [notes, setNotes] = useState(job.notes || '');

  const isEnriched = (company && company.enrichmentStatus !== 'pending' && company.enrichmentStatus !== undefined)
    || job.companyEnrichmentStatus === 'scraped'
    || job.companyEnrichmentStatus === 'db_matched';
  const displayCompany = isEnriched ? (company || {
    id: job.id, name: job.companyName,
    slug: job.companyName?.toLowerCase().replace(/[^a-z0-9]/g, '-') || '',
    industry: job.companyIndustry, enrichmentStatus: job.companyEnrichmentStatus,
    hqCity: job.companyHqCity, hqCountry: job.companyHqCountry, website: job.companyWebsite,
  } as Company) : null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40" onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto pointer-events-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 20 }}
          transition={{ type: 'spring', damping: 30, stiffness: 350 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl pointer-events-auto border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* ── Header with gradient ── */}
          <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-6 py-5 shrink-0">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Briefcase className="w-4 h-4 text-lime-400 shrink-0" />
                  <h2 className="text-lg font-bold text-white leading-tight truncate">
                    {job.titleDisplay || job.serviceName || job.title}
                  </h2>
                </div>
                {job.serviceName && job.title && job.title.toLowerCase() !== job.serviceName.toLowerCase() && (
                  <p className="text-xs text-slate-400 mb-1">Original: {job.title}</p>
                )}
                <div className="flex items-center gap-2 flex-wrap mt-2">
                  <Pill><MapPin className="w-3 h-3" />{job.location || 'Remote'}{job.country ? `, ${job.country}` : ''}</Pill>
                  {job.category && <Pill>{job.category}</Pill>}
                  {job.postedAt && <Pill icon={<Calendar className="w-3 h-3" />}>{new Date(job.postedAt).toLocaleDateString('en-CA')}</Pill>}
                  <SourceBadge source={job.source} />
                  {job.isEasyApply && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-500/20 text-blue-200 rounded-full text-[10px] font-bold">
                      <Zap className="w-2.5 h-2.5" />Easy Apply
                    </span>
                  )}
                  <EnrichmentBadge status={displayCompany?.enrichmentStatus || job.companyEnrichmentStatus} />
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a href={job.url} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 px-3 py-1.5 bg-white/10 text-white rounded-lg text-xs font-semibold hover:bg-white/20 transition-colors">
                  Apply <ExternalLink className="w-3 h-3" />
                </a>
                <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* ── Body ── */}
          <div className="overflow-y-auto flex-1 p-6 space-y-6">

            {/* Company card */}
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" />Company
              </h3>

              {displayCompany ? (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
                  {/* Company header */}
                  <div className="px-4 py-3 flex items-center justify-between bg-slate-50">
                    <div>
                      <p className="text-sm font-bold text-slate-900">{displayCompany.name}</p>
                      <p className="text-xs text-slate-500">{displayCompany.industry || '—'}</p>
                    </div>
                    {displayCompany.enrichmentStatus === 'scraped' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-bold ring-1 ring-emerald-200">
                        <ShieldCheck className="w-2.5 h-2.5" />Verified
                      </span>
                    )}
                  </div>

                  {/* Data grid */}
                  <div className="p-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <DataItem label="Industry" value={displayCompany.industry} />
                      <DataItem label="Size" value={displayCompany.size} />
                      <DataItem label="City" value={[displayCompany.hqCity, displayCompany.hqProvince].filter(Boolean).join(', ')} />
                      <DataItem label="Website" value={displayCompany.website} href={displayCompany.website} />
                      <DataItem label="Phone" value={displayCompany.phone} />
                      <DataItem label="Email" value={displayCompany.contactEmail} href={displayCompany.contactEmail ? `mailto:${displayCompany.contactEmail}` : undefined} />
                    </div>
                    {displayCompany.description && (
                      <div className="mt-4 pt-4 border-t border-slate-100">
                        <p className="text-xs font-bold text-slate-400 uppercase mb-1">Description</p>
                        <p className="text-xs text-slate-600 leading-relaxed">{displayCompany.description}</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 rounded-xl border border-dashed border-slate-300 p-5 text-center">
                  <Building className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-600">{job.companyName}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {job.companyEnrichmentStatus === 'pending'
                      ? '⏳ Enriching company data...'
                      : 'No enriched data available yet.'}
                  </p>
                  {(job.companyIndustry || job.companyHqCity) && (
                    <div className="flex gap-2 justify-center mt-3">
                      {job.companyIndustry && <span className="text-[10px] px-2 py-0.5 bg-slate-200 rounded-full text-slate-600">{job.companyIndustry}</span>}
                      {job.companyHqCity && <span className="text-[10px] px-2 py-0.5 bg-slate-200 rounded-full text-slate-600">{job.companyHqCity}</span>}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />Notes
              </h3>
              <textarea
                className="w-full h-20 p-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-lime-500/20 focus:border-lime-500 transition-all resize-none placeholder:text-slate-300"
                placeholder="Write your notes about this position..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>
          </div>
        </motion.div>
      </div>
    </>
  );
};

const DataItem: React.FC<{ label: string; value?: string | null; href?: string }> = ({ label, value, href }) => {
  if (!value) return null;
  return (
    <div>
      <p className="text-[10px] font-bold text-slate-400 uppercase">{label}</p>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="text-xs font-medium text-blue-600 hover:underline truncate block mt-0.5">{value}</a>
      ) : (
        <p className="text-xs font-medium text-slate-900 mt-0.5">{value}</p>
      )}
    </div>
  );
};
