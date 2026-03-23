import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Globe, MapPin, Users, Building, ExternalLink, MessageSquare, Sparkles, Loader2, CheckCircle } from 'lucide-react';
import { Job, Company, Candidate } from '../../types';
import { StatusBadge } from '../UI/Badges';
import { getCompanyIntelligence, analyzeJobFit } from '../../services/geminiService';
import { prepareMappingData } from '../../services/mappingService';
import { MOCK_CANDIDATES } from '../../mockData';

interface JobDetailProps {
  job: Job;
  onClose: () => void;
  onSelectCompany?: (name: string) => void;
}

export const JobDetail: React.FC<JobDetailProps> = ({ job, onClose, onSelectCompany }) => {
  const [intelligence, setIntelligence] = useState<Partial<Company> | null>(null);
  const [fitAnalysis, setFitAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    async function loadIntelligence() {
      setLoading(true);
      const data = await getCompanyIntelligence(job.companyName, job.location);
      setIntelligence(data);
      setLoading(false);
    }
    loadIntelligence();
  }, [job.companyName, job.location]);

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
    const candidate = MOCK_CANDIDATES.find(c => c.id === selectedCandidateId);
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
      const candidate = MOCK_CANDIDATES.find(c => c.id === selectedCandidateId);
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
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed inset-y-0 right-0 w-full max-w-xl bg-white shadow-2xl z-50 overflow-y-auto border-l border-slate-200"
    >
      <div className="sticky top-0 bg-white border-b border-slate-100 p-6 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-lime-50 rounded-lg flex items-center justify-center">
            <Building className="text-lime-600 w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">{job.title}</h2>
            <button 
              onClick={() => onSelectCompany?.(job.companyName)}
              className="text-sm text-slate-500 hover:text-lime-600 transition-colors"
            >
              {job.companyName}
            </button>
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
        {/* Quick Actions */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative group">
            <div className="flex items-center gap-1 cursor-pointer">
              <StatusBadge status={currentStatus as any} />
              <div className="w-4 h-4 text-slate-400 group-hover:text-lime-500 transition-colors">
                <svg viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
            <div className="absolute top-full left-0 mt-2 w-40 bg-white border border-slate-200 rounded-xl shadow-xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none group-hover:pointer-events-auto z-30 p-2 space-y-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase px-2 mb-1">Update Status</p>
              {['Saved', 'Applied', 'Interview', 'Offer', 'Rejected'].map((s) => (
                <button
                  key={s}
                  onClick={() => handleUpdateStatus(s)}
                  disabled={updatingStatus}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    currentStatus === s ? 'bg-lime-50 text-lime-700' : 'hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1 px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">
            <MapPin className="w-3 h-3" />
            {job.location}
          </div>
          <a 
            href={job.url} 
            target="_blank" 
            rel="noreferrer"
            className="flex items-center gap-1 px-3 py-1 bg-lime-600 text-white rounded-full text-xs font-medium hover:bg-lime-700 transition-colors"
          >
            Apply Now
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* AI Intelligence Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-lime-500" />
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
                    <p className="text-sm font-medium text-slate-900">{intelligence?.industry || 'N/A'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Size</p>
                    <p className="text-sm font-medium text-slate-900">{intelligence?.size || 'N/A'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Website</p>
                    {intelligence?.website ? (
                      <a href={intelligence.website} target="_blank" rel="noreferrer" className="text-sm font-medium text-lime-600 hover:underline flex items-center gap-1">
                        Visit Site <Globe className="w-3 h-3" />
                      </a>
                    ) : (
                      <p className="text-sm font-medium text-slate-900">N/A</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Location</p>
                    <p className="text-sm font-medium text-slate-900">{intelligence?.location || job.location || 'N/A'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Contact Email</p>
                    {intelligence?.contact_email ? (
                      <a href={`mailto:${intelligence.contact_email}`} className="text-sm font-medium text-lime-600 hover:underline">
                        {intelligence.contact_email}
                      </a>
                    ) : (
                      <p className="text-sm font-medium text-slate-900">N/A</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Phone</p>
                    <p className="text-sm font-medium text-slate-900">{intelligence?.phone || 'N/A'}</p>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">About</p>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    {intelligence?.description || 'N/A'}
                  </p>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Extension Sync Section */}
        <section className="space-y-4">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <ExternalLink className="w-4 h-4 text-lime-500" />
            Extension Sync (Auto-Fill)
          </h3>
          
          <div className="bg-slate-50 rounded-xl p-6 border border-slate-200 space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Select Candidate to Apply</label>
              <select 
                value={selectedCandidateId}
                onChange={(e) => setSelectedCandidateId(e.target.value)}
                className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-lime-500/20 outline-none"
              >
                <option value="">-- Choose an employee --</option>
                {MOCK_CANDIDATES.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.role})</option>
                ))}
              </select>
            </div>

            <button 
              onClick={handleSyncWithExtension}
              disabled={!selectedCandidateId || syncing}
              className="w-full py-3 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {syncing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Preparing Data...
                </>
              ) : (
                <>
                  <Globe className="w-4 h-4" />
                  Sync with Browser Extension
                </>
              )}
            </button>

            {syncResult && (
              <div className="p-3 bg-lime-50 border border-lime-100 rounded-lg">
                <p className="text-[10px] text-lime-700 font-bold uppercase mb-1">Status: Ready</p>
                <p className="text-xs text-lime-600">Data mapped for {job.source}. Open the job portal to auto-fill.</p>
              </div>
            )}
          </div>
        </section>

        {/* Fit Analysis */}
        <section className="space-y-4">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-lime-500" />
            AI Fit Analysis
          </h3>
          
          {fitAnalysis ? (
            <div className="bg-lime-50 border border-lime-100 rounded-xl p-6 text-lime-900 text-sm leading-relaxed whitespace-pre-wrap">
              {fitAnalysis}
            </div>
          ) : (
            <button 
              onClick={handleAnalyzeFit}
              disabled={analyzing}
              className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-500 text-sm font-medium hover:border-lime-500 hover:text-lime-600 transition-all flex items-center justify-center gap-2"
            >
              {analyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing your fit...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Analyze my fit for this role
                </>
              )}
            </button>
          )}
        </section>

        {/* User Notes */}
        <section className="space-y-4">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">My Notes</h3>
          <textarea 
            className="w-full h-32 p-4 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-lime-500/20 focus:border-lime-500 transition-all"
            placeholder="Add your thoughts about this application..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          ></textarea>
        </section>

          {/* Submit Action */}
        <section className="pt-4 border-t border-slate-100">
          <div className="mb-4 p-3 bg-blue-50 border-l-4 border-blue-500 rounded-r-xl flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-blue-900">Honest Backend Automation</p>
              <p className="text-[10px] text-blue-700">We detect the portal (Greenhouse, Lever, etc.) and apply via API if possible, or guide you through the extension for LinkedIn/Indeed.</p>
            </div>
          </div>

          {requiresExtension && (
            <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-amber-800">
                <Globe className="w-5 h-5" />
                <p className="text-sm font-bold">Extension Required for {portalType?.toUpperCase()}</p>
              </div>
              <p className="text-xs text-amber-700">
                {portalType} requires you to be logged in. The AgencySync extension will auto-fill the form for you.
              </p>
              <div className="flex gap-2">
                <a 
                  href={job.url} 
                  target="_blank" 
                  rel="noreferrer"
                  className="px-4 py-2 bg-amber-600 text-white rounded-lg text-xs font-bold hover:bg-amber-700 transition-colors flex items-center gap-2"
                >
                  Open Job Posting <ExternalLink className="w-3 h-3" />
                </a>
                <button 
                  onClick={() => alert("Checking extension status...")}
                  className="px-4 py-2 border border-amber-300 text-amber-700 rounded-lg text-xs font-bold hover:bg-amber-100 transition-colors"
                >
                  Check Extension
                </button>
              </div>
            </div>
          )}

          {showLogs && (
            <div className="space-y-4 mb-4">
              {/* Verification Layers */}
              {verification && (
                <div className="grid grid-cols-3 gap-2">
                  <div className={`p-3 rounded-xl border flex flex-col items-center gap-1 text-center ${
                    verification.layer1_submit === 'success' ? 'bg-lime-50 border-lime-100 text-lime-700' : 
                    verification.layer1_submit === 'failed' ? 'bg-rose-50 border-rose-100 text-rose-700' : 'bg-slate-50 border-slate-100 text-slate-400'
                  }`}>
                    <CheckCircle className={`w-4 h-4 ${verification.layer1_submit === 'success' ? 'text-lime-500' : 'text-slate-300'}`} />
                    <span className="text-[10px] font-bold uppercase">Layer 1</span>
                    <span className="text-[9px]">Submit Confirmed</span>
                  </div>
                  <div className={`p-3 rounded-xl border flex flex-col items-center gap-1 text-center ${
                    verification.layer2_email === 'success' ? 'bg-lime-50 border-lime-100 text-lime-700' : 
                    verification.layer2_email === 'failed' ? 'bg-rose-50 border-rose-100 text-rose-700' : 'bg-slate-50 border-slate-100 text-slate-400'
                  }`}>
                    <MessageSquare className={`w-4 h-4 ${verification.layer2_email === 'success' ? 'text-lime-500' : 'text-slate-300'}`} />
                    <span className="text-[10px] font-bold uppercase">Layer 2</span>
                    <span className="text-[9px]">Email Verified</span>
                  </div>
                  <div className={`p-3 rounded-xl border flex flex-col items-center gap-1 text-center ${
                    verification.layer3_portal === 'success' ? 'bg-lime-50 border-lime-100 text-lime-700' : 
                    verification.layer3_portal === 'failed' ? 'bg-rose-50 border-rose-100 text-rose-700' : 'bg-slate-50 border-slate-100 text-slate-400'
                  }`}>
                    <Globe className={`w-4 h-4 ${verification.layer3_portal === 'success' ? 'text-lime-500' : 'text-slate-300'}`} />
                    <span className="text-[10px] font-bold uppercase">Layer 3</span>
                    <span className="text-[9px]">Portal Status</span>
                  </div>
                </div>
              )}

              {/* Application ID Badge */}
              {applicationId && (
                <div className="flex items-center justify-between p-3 bg-slate-900 rounded-xl border border-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Application ID</span>
                  <span className="font-mono text-xs text-lime-400">{applicationId}</span>
                </div>
              )}

              {/* Logs Terminal */}
              <div className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800 shadow-inner">
              <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Backend Automation Logs</p>
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                  <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                  <div className="w-2 h-2 rounded-full bg-lime-500"></div>
                </div>
              </div>
              <div className="p-4 max-h-60 overflow-y-auto font-mono text-[11px] space-y-2 custom-scrollbar">
                {automationLogs.length === 0 && submitting && (
                  <div className="flex items-center gap-2 text-slate-500 italic">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Connecting to automation engine...
                  </div>
                )}
                {automationLogs.map((log, i) => (
                  <motion.div 
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    key={i} 
                    className="flex gap-3"
                  >
                    <span className="text-slate-600 shrink-0">[{new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
                    <span className={`${
                      log.level === 'success' ? 'text-lime-400' : 
                      log.level === 'error' ? 'text-rose-400' : 
                      log.level === 'warning' ? 'text-amber-400' : 'text-slate-300'
                    }`}>
                      {log.level === 'success' && '✓ '}
                      {log.level === 'error' && '✗ '}
                      {log.message}
                    </span>
                  </motion.div>
                ))}
                {submitting && automationLogs.length > 0 && (
                  <div className="flex items-center gap-2 text-blue-400 animate-pulse">
                    <span className="inline-block w-1 h-3 bg-blue-400"></span>
                    Processing next step...
                  </div>
                )}
              </div>
            </div>
          </div>
          )}
          
          <button 
            onClick={handleSubmitApplication}
            disabled={!selectedCandidateId || submitting}
            className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Executing Automation...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Trigger Smart Auto-Apply
              </>
            )}
          </button>

          <AnimatePresence>
            {submitFeedback && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`mt-4 p-4 rounded-xl text-sm font-medium flex items-center gap-3 ${
                  submitFeedback.success ? 'bg-lime-50 text-lime-700 border border-lime-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
                }`}
              >
                {submitFeedback.success ? <CheckCircle className="w-5 h-5" /> : <X className="w-5 h-5" />}
                {submitFeedback.message}
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>
    </motion.div>
  );
};
