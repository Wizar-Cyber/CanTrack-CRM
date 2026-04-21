import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Globe, MapPin, Users, Building, ExternalLink, Loader2,
  Mail, Phone, Building2, Calendar, Zap, Bot,
  CheckCircle2, Clock, XCircle, AlertTriangle, AlertCircle, Play,
  Linkedin,
} from 'lucide-react';
import { Job, Company } from '../../types';
import { StatusBadge, SourceBadge } from '../UI/Badges';
import { api } from '../../services/apiClient';

interface JobDetailProps {
  job: Job;
  company?: Company;
  onClose: () => void;
  onSelectCompany?: (name: string) => void;
}

type QueueStatus = 'queued' | 'processing' | 'applied' | 'failed' | 'skipped' | 'captcha';

interface QueueItem {
  id: string;
  status: QueueStatus;
  priority: number;
  queued_at: string;
  applied_at: string | null;
  failed_at: string | null;
  notes: string | null;
  error_message: string | null;
}

const QUEUE_STATUS_CFG: Record<QueueStatus, { label: string; icon: React.FC<any>; cls: string }> = {
  queued:     { label: 'Queued',     icon: Clock,         cls: 'text-blue-600 bg-blue-50 ring-blue-200' },
  processing: { label: 'Processing', icon: Loader2,       cls: 'text-amber-600 bg-amber-50 ring-amber-200' },
  applied:    { label: 'Applied',    icon: CheckCircle2,  cls: 'text-emerald-600 bg-emerald-50 ring-emerald-200' },
  failed:     { label: 'Failed',     icon: XCircle,       cls: 'text-red-600 bg-red-50 ring-red-200' },
  skipped:    { label: 'Skipped',    icon: AlertTriangle, cls: 'text-slate-500 bg-slate-100 ring-slate-200' },
  captcha:    { label: 'CAPTCHA',    icon: AlertCircle,   cls: 'text-orange-600 bg-orange-50 ring-orange-200' },
};

const SUPPORTED_PLATFORMS = new Set(['linkedin', 'indeed']);

export const JobDetail: React.FC<JobDetailProps> = ({ job, company, onClose, onSelectCompany }) => {
  const [queueItem, setQueueItem]   = useState<QueueItem | null | undefined>(undefined);
  const [queueing, setQueueing]     = useState(false);
  const [priority, setPriority]     = useState(5);
  const [queueMsg, setQueueMsg]     = useState<string | null>(null);
  const [notes, setNotes]           = useState(job.notes || '');

  const isEnriched  = company && company.enrichmentStatus !== 'pending' && company.enrichmentStatus !== undefined;
  const displayCompany = isEnriched ? company : null;
  const isSupported = SUPPORTED_PLATFORMS.has(job.source);

  // Fetch current queue status for this job
  useEffect(() => {
    api(`/api/application-queue/job/${job.id}`)
      .then(r => r.json())
      .then(d => setQueueItem(d))
      .catch(() => setQueueItem(null));
  }, [job.id]);

  const handleAddToQueue = async () => {
    setQueueing(true);
    setQueueMsg(null);
    try {
      const r = await api('/api/application-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id, priority }),
      });
      const json = await r.json();
      if (r.ok && json.inserted > 0) {
        setQueueMsg('Vacancy added to the agent queue!');
        // Refresh queue status
        const fresh = await api(`/api/application-queue/job/${job.id}`).then(x => x.json());
        setQueueItem(fresh);
      } else if (json.skippedDuplicates > 0) {
        setQueueMsg('Already queued or being processed.');
      } else {
        setQueueMsg(json.error ?? 'Could not add to queue.');
      }
    } catch {
      setQueueMsg('Network error adding to queue.');
    } finally {
      setQueueing(false);
      setTimeout(() => setQueueMsg(null), 4000);
    }
  };

  const isQueued  = queueItem && ['queued', 'processing'].includes(queueItem.status);
  const isApplied = queueItem?.status === 'applied';

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

      {/* Modal */}
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
                <h2 className="text-lg font-bold text-slate-900 leading-tight">
                  {job.titleDisplay || job.serviceName || job.title}
                </h2>
                {job.serviceName && job.title && job.title.toLowerCase() !== job.serviceName.toLowerCase() && (
                  <p className="text-xs text-slate-400 mt-0.5" title="Título original de la vacante antes de la clasificación IA">
                    Vacante original: {job.title}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <button
                    onClick={() => onSelectCompany?.(job.companyName)}
                    className="text-sm text-slate-500 hover:text-lime-600 transition-colors font-medium"
                  >
                    {job.companyName}
                  </button>
                  {displayCompany?.industry && (
                    <span className="text-xs text-slate-400">· {displayCompany.industry}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <SourceBadge source={job.source} />
                  {job.isEasyApply && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded uppercase tracking-wide">
                      <Zap className="w-2.5 h-2.5" />Easy Apply
                    </span>
                  )}
                  {/* Queue status pill in header */}
                  {queueItem && (
                    <QueueStatusPill status={queueItem.status} />
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={job.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-200 transition-colors"
              >
                Ver vacante <ExternalLink className="w-3 h-3" />
              </a>
              <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
          </div>

          {/* ── Scrollable body: 2 columnas ── */}
          <div className="overflow-y-auto flex-1">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">

              {/* ── LEFT: job + company info ── */}
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

                {/* Company info */}
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

                {/* Notes */}
                <section className="space-y-2">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">My Notes</h3>
                  <textarea
                    className="w-full h-24 p-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-lime-500/20 focus:border-lime-500 transition-all resize-none"
                    placeholder="Add your notes about this position..."
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                  />
                </section>
              </div>

              {/* ── RIGHT: Agent queue panel ── */}
              <div className="p-6 space-y-5">

                <section className="space-y-3">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Bot className="w-3.5 h-3.5 text-lime-500" />Application Agent
                  </h3>

                  {!isSupported ? (
                    /* Platform not supported */
                    <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 text-center">
                      <Globe className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm font-semibold text-slate-600">Plataforma no soportada</p>
                      <p className="text-xs text-slate-400 mt-1">
                        El agente solo funciona con vacantes de{' '}
                        <strong>LinkedIn</strong> e <strong>Indeed</strong>.
                        Esta vacante es de <em>{job.source}</em>.
                      </p>
                      <a
                        href={job.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 bg-lime-600 text-white text-xs font-semibold rounded-lg hover:bg-lime-700 transition-colors"
                      >
                        Aplicar manualmente <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  ) : isApplied ? (
                    /* Already applied */
                    <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-5 text-center">
                      <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                      <p className="text-sm font-bold text-emerald-700">Application submitted!</p>
                      <p className="text-xs text-emerald-600 mt-1">
                        The agent applied to this vacancy
                        {queueItem?.applied_at && ` on ${new Date(queueItem.applied_at).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' })}`}.
                      </p>
                    </div>
                  ) : isQueued ? (
                    /* In queue / processing */
                    <div className="bg-blue-50 rounded-xl border border-blue-200 p-5 text-center">
                      {queueItem?.status === 'processing' ? (
                        <Loader2 className="w-10 h-10 text-blue-500 mx-auto mb-2 animate-spin" />
                      ) : (
                        <Clock className="w-10 h-10 text-blue-400 mx-auto mb-2" />
                      )}
                      <p className="text-sm font-bold text-blue-700">
                        {queueItem?.status === 'processing' ? 'Processing now...' : 'In queue'}
                      </p>
                      <p className="text-xs text-blue-600 mt-1">
                        Agregado {queueItem?.queued_at && new Date(queueItem.queued_at).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })}
                      </p>
                    </div>
                  ) : (
                    /* Ready to queue */
                    <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-4">
                      {/* Platform indicator */}
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          job.source === 'linkedin' ? 'bg-blue-600' : 'bg-indigo-600'
                        }`}>
                          {job.source === 'linkedin'
                            ? <Linkedin className="w-5 h-5 text-white" />
                            : <Globe className="w-5 h-5 text-white" />
                          }
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">
                            {job.source === 'linkedin' ? 'LinkedIn Easy Apply' : 'Indeed Apply'}
                          </p>
                          <p className="text-xs text-slate-500">
                            The agent will apply automatically with your active session
                          </p>
                        </div>
                      </div>

                      {/* Priority selector */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Priority</label>
                        <div className="flex gap-2">
                          {[
                            { label: 'Low',    value: 2 },
                            { label: 'Normal', value: 5 },
                            { label: 'High',   value: 9 },
                          ].map(opt => (
                            <button
                              key={opt.value}
                              onClick={() => setPriority(opt.value)}
                              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                                priority === opt.value
                                  ? 'bg-lime-600 border-lime-600 text-white'
                                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Queue button */}
                      <button
                        onClick={handleAddToQueue}
                        disabled={queueing}
                        className="w-full py-2.5 bg-lime-600 text-white rounded-xl text-sm font-semibold hover:bg-lime-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {queueing ? (
                          <><Loader2 className="w-4 h-4 animate-spin" />Adding...</>
                        ) : (
                          <><Play className="w-4 h-4" />Add to agent queue</>
                        )}
                      </button>

                      {/* Failed/skipped state — show retry option */}
                      {queueItem && ['failed', 'captcha', 'skipped'].includes(queueItem.status) && (
                        <div className="p-3 bg-red-50 border border-red-100 rounded-lg">
                          <p className="text-[10px] font-bold text-red-700 uppercase mb-0.5">
                            {QUEUE_STATUS_CFG[queueItem.status]?.label}
                          </p>
                          {queueItem.error_message && (
                            <p className="text-xs text-red-600">{queueItem.error_message}</p>
                          )}
                          <p className="text-[10px] text-red-500 mt-1">
                            Use the button above to try again.
                          </p>
                        </div>
                      )}

                      {/* Feedback message */}
                      <AnimatePresence>
                        {queueMsg && (
                          <motion.p
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className={`text-xs font-medium text-center ${
                              queueMsg.includes('!') ? 'text-emerald-600' : 'text-slate-500'
                            }`}
                          >
                            {queueMsg}
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </section>

                {/* Info box */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">How it works</p>
                  <ul className="space-y-1 text-[11px] text-slate-500">
                    <li className="flex items-start gap-1.5">
                      <span className="w-3.5 h-3.5 bg-lime-100 text-lime-600 rounded-full text-[9px] flex items-center justify-center shrink-0 mt-0.5 font-bold">1</span>
                      Add the vacancy to the queue using the button above.
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="w-3.5 h-3.5 bg-lime-100 text-lime-600 rounded-full text-[9px] flex items-center justify-center shrink-0 mt-0.5 font-bold">2</span>
                      The agent will process it during business hours (9am–5pm), respecting the 8/hr limit.
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="w-3.5 h-3.5 bg-lime-100 text-lime-600 rounded-full text-[9px] flex items-center justify-center shrink-0 mt-0.5 font-bold">3</span>
                      Make sure you have an active session on LinkedIn / Indeed in Chrome.
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </>
  );
};

// ── Queue status pill ─────────────────────────────────────────────────────────
const QueueStatusPill: React.FC<{ status: QueueStatus }> = ({ status }) => {
  const cfg = QUEUE_STATUS_CFG[status];
  if (!cfg) return null;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ring-1 ${cfg.cls}`}>
      <Icon className={`w-2.5 h-2.5 ${status === 'processing' ? 'animate-spin' : ''}`} />
      {cfg.label}
    </span>
  );
};

// ── Helper sub-component ──────────────────────────────────────────────────────
const InfoField: React.FC<{ label: string; value?: string | null; icon?: React.ReactNode }> = ({ label, value, icon }) => {
  if (!value) return null;
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">{icon}{label}</p>
      <p className="text-xs font-medium text-slate-900">{value}</p>
    </div>
  );
};
