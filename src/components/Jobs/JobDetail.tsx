import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Globe, MapPin, Users, Building, ExternalLink, MessageSquare, Sparkles, Loader2, CheckCircle, Mail, Phone, Building2, Calendar, Zap } from 'lucide-react';
import { Job, Company, Candidate } from '../../types';
import { StatusBadge, SourceBadge } from '../UI/Badges';
import { analyzeJobFit } from '../../services/geminiService';
import { prepareMappingData } from '../../services/mappingService';

interface JobDetailProps {
  job: Job;
  company?: Company;
  candidates?: Candidate[];
  onClose: () => void;
  onSelectCompany?: (name: string) => void;
}

export const JobDetail: React.FC<JobDetailProps> = ({ job, company, candidates = [], onClose, onSelectCompany }) => {
  const [intelligence, setIntelligence] = useState<Partial<Company> | null>(null);
  const [fitAnalysis, setFitAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>('');
  const [currentStatus, setCurrentStatus] = useState<string>(job.status || 'Saved');
  const [syncResult, setSyncResult] = useState<any>(null);
  const [automationLogs, setAutomationLogs] = useState<any[]>([]);
  const [verification, setVerification] = useState<any>(null);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [requiresExtension, setRequiresExtension] = useState(false);
  const [portalType, setPortalType] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const [notes, setNotes] = useState(job.notes || '');

  // Use DB company data if enriched; otherwise null
  const isEnriched = company && company.enrichmentStatus !== 'pending' && company.enrichmentStatus !== undefined;
  const displayCompany = isEnriched ? company : null;

  useEffect(() => {
    async function fetchStatus() {
      if (!selectedCandidateId) {
        setCurrentStatus(job.status || 'Saved');
        setAutomationLogs([]);
        setVerification(null);
        setApplicationId(null);
        return;
      }
      try {
        const response = await fetch(`/api/apply/status?jobId=${job.id}&candidateId=${selectedCandidateId}`);
        const data = await response.json();
        if (data.success) {
          setCurrentStatus(data.status);
          setAutomationLogs(data.logs || []);
          setVerification(data.verification || null);
          setApplicationId(data.applicationId || null);
          setRequiresExtension(data.status === 'Needs Extension');
          setPortalType(data.portal || null);
          
          // If we have logs, show them by default if they were successful
          if (data.logs && data.logs.length > 0) {
            setShowLogs(true);
          }
        }
      } catch (error) {
        console.error("Error fetching status:", error);
      }
    }
    fetchStatus();
  }, [selectedCandidateId, job.id, job.status]);

  const handleAnalyzeFit = async () => {
    setAnalyzing(true);
    const analysis = await analyzeJobFit(job.title, job.companyName, job.notes || "");
    setFitAnalysis(analysis);
    setAnalyzing(false);
  };

  const handleSyncWithExtension = async () => {
    if (!selectedCandidateId) return;
    setSyncing(true);
    const candidate = candidates.find(c => c.id === selectedCandidateId);
    if (candidate) {
      const data = await prepareMappingData(candidate, job);
      setSyncResult(data);
      // In a real app, we would send this to a backend or use window.postMessage for the extension
      console.log("Data prepared for extension:", data);
    }
    setSyncing(false);
  };

  const handleSubmitApplication = async () => {
    if (!selectedCandidateId) {
      setSubmitFeedback({ success: false, message: "Please select a candidate first." });
      return;
    }

    setSubmitting(true);
    setSubmitFeedback(null);

    try {
      const candidate = candidates.find(c => c.id === selectedCandidateId);
      setAutomationLogs([]);
      setShowLogs(true);
      
      const response = await fetch('/api/apply/auto', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          job: job,
          candidate: candidate
        }),
      });

      const data = await response.json();

      if (data.logs) {
        setAutomationLogs(data.logs);
      }

      if (data.verification) {
        setVerification(data.verification);
      }

      if (data.applicationId) {
        setApplicationId(data.applicationId);
      }

      if (data.requiresExtension) {
        setRequiresExtension(true);
        setPortalType(data.portal);
        setCurrentStatus('Needs Extension');
        setSubmitFeedback({ 
          success: true, 
          message: `${data.portal.toUpperCase()} requires the AgencySync Chrome Extension.` 
        });
        return;
      }

      if (response.ok && data.success) {
        setSubmitFeedback({ 
          success: true, 
          message: `Real application submitted to ${data.portal || 'portal'}. ID: ${data.applicationId}` 
        });
        setCurrentStatus('Applied');
        setRequiresExtension(false);
      } else {
        setSubmitFeedback({ success: false, message: data.message || "Failed to execute automation." });
      }
    } catch (error) {
      console.error("Error in backend automation:", error);
      setSubmitFeedback({ success: false, message: "Network error. Please try again later." });
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatus = async (newStatus: string) => {
    if (!selectedCandidateId) {
      setSubmitFeedback({ success: false, message: "Please select a candidate to update application status." });
      return;
    }

    setUpdatingStatus(true);
    try {
      const response = await fetch('/api/apply/status', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jobId: job.id,
          candidateId: selectedCandidateId,
          status: newStatus
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setCurrentStatus(newStatus);
        setSubmitFeedback({ success: true, message: data.message });
      } else {
        setSubmitFeedback({ success: false, message: data.message || "Failed to update status." });
      }
    } catch (error) {
      console.error("Error updating status:", error);
      setSubmitFeedback({ success: false, message: "Network error. Please try again later." });
    } finally {
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

                {/* Análisis de compatibilidad IA */}
                <section className="space-y-3">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <MessageSquare className="w-3.5 h-3.5 text-lime-500" />AI Fit Analysis
                  </h3>
                  {fitAnalysis ? (
                    <div className="bg-lime-50 border border-lime-100 rounded-xl p-4 text-lime-900 text-xs leading-relaxed whitespace-pre-wrap">{fitAnalysis}</div>
                  ) : (
                    <button onClick={handleAnalyzeFit} disabled={analyzing}
                      className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-500 text-sm font-medium hover:border-lime-500 hover:text-lime-600 transition-all flex items-center justify-center gap-2">
                      {analyzing ? <><Loader2 className="w-4 h-4 animate-spin" />Analyzing...</> : <><Sparkles className="w-4 h-4" />Analyze Fit</>}
                    </button>
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

                {/* Selección de candidato */}
                <section className="space-y-3">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <ExternalLink className="w-3.5 h-3.5 text-lime-500" />Extension Sync / Auto-Apply
                  </h3>
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Candidate to Submit</label>
                      <select value={selectedCandidateId} onChange={e => setSelectedCandidateId(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-lime-500/20 outline-none">
                        <option value="">-- Select Candidate --</option>
                        {candidates.map(c => <option key={c.id} value={c.id}>{c.name} ({c.role})</option>)}
                      </select>
                    </div>
                    <button onClick={handleSyncWithExtension} disabled={!selectedCandidateId || syncing}
                      className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                      {syncing ? <><Loader2 className="w-4 h-4 animate-spin" />Preparing...</> : <><Globe className="w-4 h-4" />Sync with Extension</>}
                    </button>
                    {syncResult && (
                      <div className="p-3 bg-lime-50 border border-lime-100 rounded-lg">
                        <p className="text-[10px] text-lime-700 font-bold uppercase mb-1">Ready</p>
                        <p className="text-xs text-lime-600">Data mapped for {job.source}. Open the portal to auto-fill.</p>
                      </div>
                    )}
                  </div>
                </section>

                {/* Backend automation info */}
                <div className="p-3 bg-blue-50 border-l-4 border-blue-500 rounded-r-xl flex items-start gap-3">
                  <Sparkles className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-blue-900">Backend Automation</p>
                    <p className="text-[10px] text-blue-700">We detect the portal (Greenhouse, Lever, etc.) and apply via API when possible.</p>
                  </div>
                </div>

                {/* Extensión requerida */}
                {requiresExtension && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                    <div className="flex items-center gap-2 text-amber-800">
                      <Globe className="w-4 h-4" />
                      <p className="text-sm font-bold">Extension required: {portalType?.toUpperCase()}</p>
                    </div>
                    <a href={job.url} target="_blank" rel="noreferrer"
                      className="inline-flex px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-bold hover:bg-amber-700 items-center gap-1">
                      Open Position <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}

                {/* Logs de automatización */}
                {showLogs && (
                  <div className="space-y-3">
                    {verification && (
                      <div className="grid grid-cols-3 gap-2">
                        {[['layer1_submit', 'Layer 1', 'Submit'], ['layer2_email', 'Layer 2', 'Email'], ['layer3_portal', 'Layer 3', 'Portal']].map(([key, layer, label]) => (
                          <div key={key} className={`p-2.5 rounded-xl border flex flex-col items-center gap-1 text-center text-xs ${
                            (verification as any)[key] === 'success' ? 'bg-lime-50 border-lime-100 text-lime-700' :
                            (verification as any)[key] === 'failed' ? 'bg-rose-50 border-rose-100 text-rose-700' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
                            <CheckCircle className={`w-3.5 h-3.5 ${(verification as any)[key] === 'success' ? 'text-lime-500' : 'text-slate-300'}`} />
                            <span className="font-bold text-[10px] uppercase">{layer}</span>
                            <span className="text-[9px]">{label}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {applicationId && (
                      <div className="flex items-center justify-between p-2.5 bg-slate-900 rounded-xl">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Application ID</span>
                        <span className="font-mono text-xs text-lime-400">{applicationId}</span>
                      </div>
                    )}
                    <div className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800">
                      <div className="p-2.5 border-b border-slate-800 flex items-center justify-between">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Automation Logs</p>
                        <div className="flex gap-1">
                          {['bg-rose-500', 'bg-amber-500', 'bg-lime-500'].map(c => <div key={c} className={`w-2 h-2 rounded-full ${c}`} />)}
                        </div>
                      </div>
                      <div className="p-3 max-h-40 overflow-y-auto font-mono text-[11px] space-y-1.5">
                        {automationLogs.length === 0 && submitting && (
                          <div className="flex items-center gap-2 text-slate-500 italic"><Loader2 className="w-3 h-3 animate-spin" />Connecting...</div>
                        )}
                        {automationLogs.map((log, i) => (
                          <motion.div key={i} initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }} className="flex gap-2">
                            <span className="text-slate-600 shrink-0">[{new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
                            <span className={log.level === 'success' ? 'text-lime-400' : log.level === 'error' ? 'text-rose-400' : log.level === 'warning' ? 'text-amber-400' : 'text-slate-300'}>
                              {log.level === 'success' && '✓ '}{log.level === 'error' && '✗ '}{log.message}
                            </span>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Trigger Auto-Apply */}
                <button onClick={handleSubmitApplication} disabled={!selectedCandidateId || submitting}
                  className="w-full py-3.5 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm">
                  {submitting ? <><Loader2 className="w-5 h-5 animate-spin" />Running...</> : <><Sparkles className="w-5 h-5" />Trigger Smart Auto-Apply</>}
                </button>

                <AnimatePresence>
                  {submitFeedback && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      className={`p-3.5 rounded-xl text-sm font-medium flex items-center gap-3 ${submitFeedback.success ? 'bg-lime-50 text-lime-700 border border-lime-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
                      {submitFeedback.success ? <CheckCircle className="w-5 h-5" /> : <X className="w-5 h-5" />}
                      {submitFeedback.message}
                    </motion.div>
                  )}
                </AnimatePresence>

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