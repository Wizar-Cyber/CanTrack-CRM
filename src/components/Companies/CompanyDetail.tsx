import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, MapPin, Building, ExternalLink, Mail, Phone, Users, Briefcase, Sparkles, Loader2, Send, Clock } from 'lucide-react';
import { Company, Job } from '../../types';
import { SendOfferModal } from './SendOfferModal';
import { api } from '../../services/apiClient';
import { TipoSelector } from '../UI/TipoSelector';
import { TIPO_CONFIG } from '../../utils/tipo';

interface CompanyDetailProps {
  company: Company;
  jobs: Job[];
  onClose: () => void;
  onViewJob: (job: Job) => void;
}

export const CompanyDetail: React.FC<CompanyDetailProps> = ({ company, jobs, onClose, onViewJob }) => {
  const [localTipo, setLocalTipo] = useState(company.tipo ?? null);
  const [intelligence, setIntelligence] = useState<Partial<Company> | null>(null);
  const [loading, setLoading] = useState(true);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [emailLogs, setEmailLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  useEffect(() => {
    async function loadIntelligence() {
      setLoading(true);
      setTimeout(() => {
        setIntelligence(company);
        setLoading(false);
      }, 300);
    }
    loadIntelligence();

    // Cargar historial de correos enviados
    const loadLogs = async () => {
      if (!company.id) return;
      setLoadingLogs(true);
      try {
        const res = await api(`/api/companies/${company.id}/email-logs`);
        if (res.ok) setEmailLogs(await res.json());
      } catch { /* silencioso */ } finally {
        setLoadingLogs(false);
      }
    };
    loadLogs();
  }, [company]);

  const companyJobs = jobs.filter(j => j.companyId === company.id || j.companyName === company.name);

  const displayCompany = { ...company, ...intelligence };

  // Si exactAddress parece un teléfono (solo dígitos/espacios/guiones, 7-15 chars),
  // lo movemos al campo phone y limpiamos address
  const looksLikePhone = (val?: string) => !!val && /^[\d\s\-\+\(\)\.]{7,15}$/.test(val.trim());
  const resolvedPhone   = displayCompany.phone || (looksLikePhone(displayCompany.exactAddress) ? displayCompany.exactAddress : undefined);
  const resolvedAddress = looksLikePhone(displayCompany.exactAddress) ? undefined : displayCompany.exactAddress;

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Centered Modal */}
      <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto pointer-events-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 20 }}
          transition={{ type: 'spring', damping: 30, stiffness: 350 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl pointer-events-auto my-4 border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]"
        >
      <div className="sticky top-0 bg-white border-b border-slate-100 p-5 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
            <Building className="text-blue-600 w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">{displayCompany.name}</h2>
            <div className="flex items-center gap-2 flex-wrap">
              {displayCompany.knownATSPortal && (
                <span className="px-2 py-0.5 bg-lime-50 text-lime-700 border border-lime-100 rounded text-xs font-semibold">
                  {displayCompany.knownATSPortal}
                </span>
              )}
              {company.id && !company.id.startsWith('temp') && (
                <TipoSelector
                  companyId={company.id}
                  current={localTipo}
                  onUpdate={t => setLocalTipo(t)}
                />
              )}
            </div>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="p-2 hover:bg-slate-100 rounded-full transition-colors"
        >
          <X className="w-5 h-5 text-slate-400" />
        </button>
      </div>

      {/* Modal de oferta */}
      {showOfferModal && (
        <SendOfferModal
          company={displayCompany as Company}
          onClose={() => {
            setShowOfferModal(false);
            // Recargar logs tras envío
            api(`/api/companies/${company.id}/email-logs`)
              .then(r => r.ok ? r.json() : [])
              .then(setEmailLogs)
              .catch(() => {});
          }}
        />
      )}

      {/* ── Scrollable body: 2-column layout ── */}
      <div className="overflow-y-auto flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">

        {/* ── LEFT COLUMN ── */}
        <div className="p-6 space-y-5 border-b lg:border-b-0 lg:border-r border-slate-100">

        {/* Quick Info pills */}
        <div className="flex flex-wrap gap-2 items-center">
          {(displayCompany.hqCity || resolvedAddress || displayCompany.location) && (
            <div className="flex items-center gap-1 px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-medium max-w-xs truncate">
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="truncate">
                {displayCompany.hqCity
                  ? `${displayCompany.hqCity}${displayCompany.hqProvince ? `, ${displayCompany.hqProvince}` : ''}`
                  : resolvedAddress || displayCompany.location}
              </span>
            </div>
          )}
          {displayCompany.size && (
            <div className="flex items-center gap-1 px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">
              <Users className="w-3 h-3" />
              {displayCompany.size}
            </div>
          )}
          {displayCompany.website && (
            <a href={displayCompany.website} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white rounded-full text-xs font-medium hover:bg-blue-700 transition-colors">
              Web <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        {/* AI Enriched Data */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-blue-500" />Enriched Data
            </h3>
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
          </div>

          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-4">
            {loading ? (
              <div className="space-y-3">
                <div className="h-4 bg-slate-200 rounded w-3/4 animate-pulse"></div>
                <div className="h-4 bg-slate-200 rounded w-1/2 animate-pulse"></div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                <div className="space-y-0.5">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Industry</p>
                  <p className="text-xs font-medium text-slate-900">{displayCompany.industry || '—'}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Size</p>
                  <p className="text-xs font-medium text-slate-900">{displayCompany.size || '—'}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Province</p>
                  <p className="text-xs font-medium text-slate-900">{displayCompany.hqProvince || '—'}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Country</p>
                  <p className="text-xs font-medium text-slate-900">{displayCompany.hqCountry || '—'}</p>
                </div>
                <div className="col-span-2 space-y-0.5">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Address</p>
                  <p className="text-xs font-medium text-slate-900">{resolvedAddress || '—'}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1"><Phone className="w-3 h-3" />Phone</p>
                  {resolvedPhone
                    ? <a href={`tel:${resolvedPhone}`} className="text-xs font-medium text-blue-600 hover:underline">{resolvedPhone}</a>
                    : <p className="text-xs font-medium text-slate-900">—</p>}
                </div>
                <div className="space-y-0.5">
                  <p className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1"><Mail className="w-3 h-3" />Email</p>
                  {displayCompany.contactEmail
                    ? <a href={`mailto:${displayCompany.contactEmail}`} className="text-xs font-medium text-blue-600 hover:underline truncate block">{displayCompany.contactEmail}</a>
                    : <p className="text-xs font-medium text-slate-900">—</p>}
                </div>
                <div className="space-y-0.5">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Service</p>
                  {displayCompany.knownATSPortal
                    ? <span className="px-2 py-0.5 bg-lime-50 text-lime-700 rounded text-xs font-medium">{displayCompany.knownATSPortal}</span>
                    : <p className="text-xs font-medium text-slate-900">—</p>}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* About */}
        {!loading && displayCompany.description && (
          <section className="space-y-2">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">About</h3>
            <p className="text-xs text-slate-600 leading-relaxed">{displayCompany.description}</p>
          </section>
        )}

        </div>{/* end LEFT */}

        {/* ── RIGHT COLUMN ── */}
        <div className="p-6 space-y-5">

          {/* Send Offer */}
          <button onClick={() => setShowOfferModal(true)}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded-xl transition-colors shadow-sm text-sm">
            <Send className="w-4 h-4" />
            Send Staffing Offer
          </button>

          {/* Open Vacancies */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <Briefcase className="w-3.5 h-3.5 text-blue-500" />
              Open Positions ({companyJobs.length})
            </h3>
            <div className="space-y-2">
              {companyJobs.length > 0 ? (
                companyJobs.map((job, i) => (
                  <div key={job.id ?? `job-${i}`} onClick={() => onViewJob(job)}
                    className="p-3 bg-white border border-slate-200 rounded-xl hover:border-blue-500 hover:shadow-sm transition-all cursor-pointer group flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="text-xs font-semibold text-slate-900 group-hover:text-blue-600 transition-colors truncate">{job.title}</h4>
                      <p className="text-[11px] text-slate-400">{job.location}</p>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-500 shrink-0" />
                  </div>
                ))
              ) : (
                <div className="p-5 text-center border-2 border-dashed border-slate-100 rounded-xl">
                  <p className="text-xs text-slate-400">No active positions.</p>
                </div>
              )}
            </div>
          </section>

          {/* Email logs */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-blue-500" />
              Emails Sent ({emailLogs.length})
            </h3>
            {loadingLogs ? (
              <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
            ) : emailLogs.length === 0 ? (
              <div className="p-5 text-center border-2 border-dashed border-slate-100 rounded-xl">
                  <p className="text-xs text-slate-400">No emails sent yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {emailLogs.map((log: any, i: number) => (
                  <div key={log.id ?? `log-${i}`} className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                      <Mail className="w-3.5 h-3.5 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">{log.employee_type_name}</p>
                      <p className="text-[11px] text-slate-500 truncate">→ {log.to_email}</p>
                      <p className="text-[11px] text-slate-400">{log.sent_by_name} · {new Date(log.sent_at).toLocaleDateString('en', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

        </div>{/* end RIGHT */}

        </div>{/* end 2-col grid */}
      </div>{/* end scrollable body */}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
