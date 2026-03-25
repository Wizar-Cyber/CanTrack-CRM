import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Globe, MapPin, Users, Building, ExternalLink, Loader2, Mail, Phone, Building2, Calendar, Zap } from 'lucide-react';
import { Job, Company, Candidate } from '../../types';
import { StatusBadge, SourceBadge } from '../UI/Badges';
import { prepareMappingData } from '../../services/mappingService';

interface JobDetailProps {
  job: Job;
  company?: Company;
  candidates?: Candidate[];
  onClose: () => void;
  onSelectCompany?: (name: string) => void;
}

export const JobDetail: React.FC<JobDetailProps> = ({ job, company, candidates = [], onClose, onSelectCompany }) => {
  const [syncing, setSyncing] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>('');
  const [currentStatus, setCurrentStatus] = useState<string>(job.status || 'Saved');
  const [syncResult, setSyncResult] = useState<any>(null);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);
  const [notes, setNotes] = useState(job.notes || '');

  // Use DB company data if enriched; otherwise null
  const isEnriched = company && company.enrichmentStatus !== 'pending' && company.enrichmentStatus !== undefined;
  const displayCompany = isEnriched ? company : null;

  useEffect(() => {
    // Reset sync result when candidate changes
    setSyncResult(null);
    setStatusFeedback(null);
    setCurrentStatus(job.status || 'Saved');
  }, [selectedCandidateId, job.status]);

  const handleSyncWithExtension = async () => {
    if (!selectedCandidateId) return;
    setSyncing(true);
    setSyncResult(null);
    const candidate = candidates.find(c => c.id === selectedCandidateId);
    if (candidate) {
      const data = await prepareMappingData(candidate, job);
      setSyncResult(data);
    }
    setSyncing(false);
  };

  const handleUpdateStatus = async (newStatus: string) => {
    if (!selectedCandidateId) return;
    setUpdatingStatus(true);
    try {
      const response = await fetch('/api/apply/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id, candidateId: selectedCandidateId, status: newStatus }),
      });
      if (response.ok) {
        setCurrentStatus(newStatus);
        setStatusFeedback(`Status updated to ${newStatus}`);
        setTimeout(() => setStatusFeedback(null), 2500);
      }
    } catch { /* silent */ } finally {
      setUpdatingStatus(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Centered Modal — igual a CompanyDetail */}
      <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto pointer-events-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 20 }}
          transition={{ type: 'spring', damping: 30, stiffness: 350 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl pointer-events-auto my-4 border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* ── Header ── */}
          <div className="sticky top-0 bg-white border-b border-slate-100 p-5 flex items-start justify-between z-20 shrink-0">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-lime-50 rounded-xl flex items-center justify-center shrink-0">
                <Building className="text-lime-600 w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 leading-tight">{job.title}</h2>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <button onClick={() => onSelectCompany?.(job.companyName)}
                    className="text-sm text-slate-500 hover:text-lime-600 transition-colors font-medium">
                    {job.companyName}
                  </button>
                  {displayCompany?.industry && <span className="text-xs text-slate-400">· {displayCompany.industry}</span>}
                </div>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <SourceBadge source={job.source} />
                  {job.isEasyApply && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded uppercase tracking-wide">
                      <Zap className="w-2.5 h-2.5" />Easy Apply
                    </span>
                  )}
                  <div className="relative group">
                    <div className="flex items-center gap-1 cursor-pointer">
                      <StatusBadge status={currentStatus as any} />
                      <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-slate-400">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="absolute top-full left-0 mt-1.5 w-36 bg-white border border-slate-200 rounded-xl shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all z-30 p-1.5 space-y-0.5">
                      {['Saved', 'Applied', 'Interview', 'Offer', 'Rejected'].map(s => (
                        <button key={s} onClick={() => handleUpdateStatus(s)} disabled={updatingStatus}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${currentStatus === s ? 'bg-lime-50 text-lime-700' : 'hover:bg-slate-50 text-slate-600'}`}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a href={job.url} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 px-3 py-1.5 bg-lime-600 text-white rounded-xl text-xs font-semibold hover:bg-lime-700 transition-colors">
                Aplicar <ExternalLink className="w-3 h-3" />
              </a>
              <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
          </div>

          {/* ── Scrollable body: 2 columnas ── */}
          <div className="overflow-y-auto flex-1">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">

              {/* ── COLUMNA IZQUIERDA: info de la vacante + empresa ── */}
              <div className="p-6 space-y-5 border-b lg:border-b-0 lg:border-r border-slate-100">

                {/* Quick info pills */}
                <div className="flex flex-wrap gap-2">
                  {job.location && (
                    <div className="flex items-center gap-1 px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">
                      <MapPin className="w-3 h-3" />{job.location}{job.country && `, ${job.country}`}
                    </div>
                  )}
                  {job.category && (
                    <div className="flex items-center gap-1 px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">
                      {job.category}
                    </div>
                  )}
                  {job.postedAt && (
                    <div className="flex items-center gap-1 px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">
                      <Calendar className="w-3 h-3" />{new Date(job.postedAt).toLocaleDateString('en')}
                    </div>
                  )}
                </div>

                {/* Información de la empresa */}
                <section className="space-y-3">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Building2 className="w-3.5 h-3.5 text-lime-500" />Company Information
                  </h3>

                  {displayCompany ? (
                    <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                      <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-4 py-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold text-white">{displayCompany.name}</p>
                          <p className="text-xs text-slate-300">{displayCompany.legalName || displayCompany.industry || '—'}</p>
                        </div>
                        {displayCompany.confidenceScore && (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${displayCompany.confidenceScore >= 80 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
                            {displayCompany.confidenceScore}%
                          </span>
                        )}
                      </div>
                      <div className="p-4 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <InfoField label="Industry" value={displayCompany.industry} />
                          <InfoField label="Size" value={displayCompany.size} icon={<Users className="w-3 h-3" />} />
                          <InfoField label="City" value={[displayCompany.hqCity, displayCompany.hqProvince].filter(Boolean).join(', ')} icon={<MapPin className="w-3 h-3" />} />
                          <InfoField label="Country" value={displayCompany.hqCountry} />
                          {displayCompany.phone && <InfoField label="Phone" value={displayCompany.phone} icon={<Phone className="w-3 h-3" />} />}
                          {displayCompany.contactEmail && (
                            <div className="space-y-0.5">
                              <p className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1"><Mail className="w-3 h-3" /> Email</p>
                              <a href={`mailto:${displayCompany.contactEmail}`} className="text-xs font-medium text-blue-600 hover:underline truncate block">{displayCompany.contactEmail}</a>
                            </div>
                          )}
                        </div>
                        {displayCompany.exactAddress && (
                          <div className="p-2.5 bg-white rounded-lg border border-slate-200 flex items-start gap-2">
                            <MapPin className="w-3 h-3 text-slate-400 mt-0.5 shrink-0" />
                            <p className="text-[11px] text-slate-600">{displayCompany.exactAddress}</p>
                          </div>
                        )}
                        {displayCompany.website && (
                          <a href={displayCompany.website} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                            <Globe className="w-3 h-3" />{displayCompany.website}
                          </a>
                        )}
                        {displayCompany.description && (
                          <p className="text-xs text-slate-600 leading-relaxed border-t border-slate-100 pt-3">{displayCompany.description}</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-50 rounded-xl border border-dashed border-slate-300 p-5 flex items-center gap-4">
                      <div className="w-9 h-9 bg-slate-200 rounded-xl flex items-center justify-center shrink-0">
                        <Building className="w-4 h-4 text-slate-400" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-700">{job.companyName}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {job.companyEnrichmentStatus === 'pending'
                            ? 'Enrichment pending — data will appear when complete.'
                            : 'This company has no enriched data yet.'}
                        </p>
                        {(job.companyHqCity || job.companyIndustry) && (
                          <div className="flex gap-1.5 mt-2 flex-wrap">
                            {job.companyIndustry && <span className="text-[10px] px-2 py-0.5 bg-slate-200 rounded-full text-slate-600">{job.companyIndustry}</span>}
                            {job.companyHqCity && <span className="text-[10px] px-2 py-0.5 bg-slate-200 rounded-full text-slate-600 flex items-center gap-1"><MapPin className="w-2.5 h-2.5" />{job.companyHqCity}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </section>

                {/* Notas */}
                <section className="space-y-2">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">My Notes</h3>
                  <textarea className="w-full h-24 p-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-lime-500/20 focus:border-lime-500 transition-all resize-none"
                    placeholder="Add your notes about this position..." value={notes} onChange={e => setNotes(e.target.value)} />
                </section>

              </div>{/* end LEFT */}

              {/* ── COLUMNA DERECHA: candidato + auto-apply ── */}
              <div className="p-6 space-y-5">

                {/* Extension Sync */}
                <section className="space-y-3">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <ExternalLink className="w-3.5 h-3.5 text-lime-500" />Extension Sync
                  </h3>
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Candidate</label>
                      <select value={selectedCandidateId} onChange={e => setSelectedCandidateId(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-lime-500/20 outline-none">
                        <option value="">-- Select Candidate --</option>
                        {candidates.map(c => <option key={c.id} value={c.id}>{c.name} ({c.role})</option>)}
                      </select>
                    </div>
                    <button onClick={handleSyncWithExtension} disabled={!selectedCandidateId || syncing}
                      className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                      {syncing ? <><Loader2 className="w-4 h-4 animate-spin" />Preparing...</> : <><Globe className="w-4 h-4" />Prepare for Extension</>}
                    </button>
                    {syncResult && (
                      <div className="p-3 bg-lime-50 border border-lime-100 rounded-lg space-y-1">
                        <p className="text-[10px] text-lime-700 font-bold uppercase">Ready to auto-fill</p>
                        <p className="text-xs text-lime-600">Open the job portal — the extension will fill the form automatically.</p>
                        <p className="text-[10px] text-lime-500 mt-1">Provider: {syncResult._provider || 'fallback'}</p>
                      </div>
                    )}
                  </div>
                </section>

                {/* Status update (solo cambia el tag en el CRM, no aplica en portal) */}
                {selectedCandidateId && (
                  <section className="space-y-2">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Update Status in CRM</h3>
                    <div className="flex flex-wrap gap-2">
                      {['Saved', 'Applied', 'Interview', 'Offer', 'Rejected'].map(s => (
                        <button key={s} onClick={() => handleUpdateStatus(s)} disabled={updatingStatus}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${currentStatus === s ? 'bg-lime-600 text-white border-lime-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                          {s}
                        </button>
                      ))}
                    </div>
                    {statusFeedback && (
                      <p className="text-xs text-lime-600 font-medium">{statusFeedback}</p>
                    )}
                  </section>
                )}

              </div>{/* end RIGHT */}

            </div>{/* end 2-col grid */}
          </div>{/* end scrollable body */}

        </motion.div>
      </div>
    </>
  );
};

// Helper sub-component
const InfoField: React.FC<{ label: string; value?: string | null; icon?: React.ReactNode }> = ({ label, value, icon }) => {
  if (!value) return null;
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">{icon}{label}</p>
      <p className="text-xs font-medium text-slate-900">{value}</p>
    </div>
  );
};