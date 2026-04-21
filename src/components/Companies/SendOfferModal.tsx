import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Search, Send, Mail, ChevronDown, Check,
  Loader2, AlertCircle, CheckCircle2, User, FileText, MessageSquare,
  Sparkles, Eye, ArrowLeft, FileCheck,
} from 'lucide-react';
import { Company } from '../../types';
import { EMPLOYEE_TYPES, EMPLOYEE_CATEGORIES, EmployeeType } from '../../data/employeeTypes';
import { api, apiJson } from '../../services/apiClient';

interface SendOfferModalProps {
  company: Company;
  onClose: () => void;
}

type Step = 'compose' | 'template' | 'sending' | 'success' | 'error';

export const SendOfferModal: React.FC<SendOfferModalProps> = ({ company, onClose }) => {
  const [step, setStep] = useState<Step>('compose');
  const [errorMsg, setErrorMsg] = useState('');

  // Form fields
  const [toEmail, setToEmail] = useState(company.contactEmail || '');
  const [toName, setToName] = useState('');
  const [selectedType, setSelectedType] = useState<EmployeeType | null>(null);
  const [subject, setSubject] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [typeSearch, setTypeSearch] = useState('');
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Template state
  const [templateContent, setTemplateContent] = useState<string | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [improvingTemplate, setImprovingTemplate] = useState(false);
  const [hasTemplate, setHasTemplate] = useState(false);

  // Auto-generate subject when type or company changes
  useEffect(() => {
    if (selectedType) {
      setSubject(`Staffing Offer: ${selectedType.name} for ${company.name}`);
    }
  }, [selectedType, company.name]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setTypeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredTypes = useMemo(() => {
    const q = typeSearch.toLowerCase();
    if (!q) return EMPLOYEE_TYPES;
    return EMPLOYEE_TYPES.filter(
      t => t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)
    );
  }, [typeSearch]);

  const groupedTypes = useMemo(() => {
    const groups: Record<string, EmployeeType[]> = {};
    filteredTypes.forEach(t => {
      if (!groups[t.category]) groups[t.category] = [];
      groups[t.category].push(t);
    });
    return groups;
  }, [filteredTypes]);

  const isValid = toEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail) && selectedType && subject.trim();

  // ── Load and fill service template ──────────────────────────────────────────
  async function loadTemplate(serviceId: string) {
    setLoadingTemplate(true);
    setTemplateContent(null);
    setHasTemplate(false);
    try {
      // Fill template with company data
      const data = await apiJson(`/api/service-templates/${serviceId}/fill`, {
        method: 'POST',
        body: JSON.stringify({ companyId: company.id }),
      });
      if (data?.content) {
        setTemplateContent(data.content);
        setHasTemplate(true);
      }
    } catch {
      // No template found — that's fine, we'll use custom message
      setHasTemplate(false);
    } finally {
      setLoadingTemplate(false);
    }
  }

  // ── When "Next" is clicked — check for template ──────────────────────────────
  async function handleNext() {
    if (!isValid || !selectedType) return;
    setStep('template');
    await loadTemplate(selectedType.id);
  }

  // ── AI improve the template ──────────────────────────────────────────────────
  async function handleAiImprove() {
    if (!selectedType || !templateContent) return;
    setImprovingTemplate(true);
    try {
      const data = await apiJson(`/api/service-templates/${selectedType.id}/ai-improve`, {
        method: 'POST',
        body: JSON.stringify({
          content: templateContent,
          companyName: company.name,
          city: company.hqCity,
          industry: company.industry,
        }),
      });
      if (data?.improved) {
        setTemplateContent(data.improved);
      }
    } catch (e) {
      console.error('AI improve error:', e);
    } finally {
      setImprovingTemplate(false);
    }
  }

  // ── Send the email ───────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!isValid || !selectedType) return;
    setStep('sending');

    try {
      const res = await api(`/api/companies/${company.id}/send-offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toEmail,
          toName: toName || undefined,
          employeeTypeId: selectedType.id,
          employeeTypeName: selectedType.name,
          employeeTypeDescription: selectedType.description,
          subject,
          customMessage: templateContent || customMessage || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Error sending the email.');
        setStep('error');
      } else {
        setStep('success');
      }
    } catch {
      setErrorMsg('Connection error. Please try again.');
      setStep('error');
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center">
                <Mail className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">Send Staffing Offer</h2>
                <p className="text-xs text-slate-500">{company.name}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>

          {/* Step indicator */}
          {(step === 'compose' || step === 'template') && (
            <div className="flex px-6 pt-4 gap-2">
              {(['compose', 'template'] as const).map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                    step === s ? 'bg-blue-600 text-white' : i === 0 && step === 'template' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'
                  }`}>
                    {i === 0 && step === 'template' ? '✓' : i + 1}
                  </div>
                  <span className={`text-xs font-medium ${step === s ? 'text-slate-800' : 'text-slate-400'}`}>
                    {s === 'compose' ? 'Compose' : 'Preview & Send'}
                  </span>
                  {i < 1 && <div className="w-6 h-px bg-slate-200 mx-1" />}
                </div>
              ))}
            </div>
          )}

          {/* Content */}
          <div className="p-6">

            {/* ── Sending ── */}
            {step === 'sending' && (
              <div className="flex flex-col items-center gap-4 py-12">
                <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                <p className="text-sm text-slate-600 font-medium">Sending email via mDirector…</p>
              </div>
            )}

            {/* ── Success ── */}
            {step === 'success' && (
              <div className="flex flex-col items-center gap-4 py-12">
                <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                </div>
                <div className="text-center">
                  <p className="text-base font-bold text-slate-900">Email sent!</p>
                  <p className="text-sm text-slate-500 mt-1">
                    The offer for <strong>{selectedType?.name}</strong> was sent to{' '}
                    <strong>{toEmail}</strong>
                  </p>
                </div>
                <button onClick={onClose}
                  className="mt-2 px-6 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors">
                  Close
                </button>
              </div>
            )}

            {/* ── Error ── */}
            {step === 'error' && (
              <div className="flex flex-col items-center gap-4 py-10">
                <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center">
                  <AlertCircle className="w-8 h-8 text-red-500" />
                </div>
                <div className="text-center">
                  <p className="text-base font-bold text-slate-900">Send Error</p>
                  <p className="text-sm text-red-600 mt-1">{errorMsg}</p>
                </div>
                <button onClick={() => setStep('compose')}
                  className="px-6 py-2.5 bg-slate-800 text-white text-sm font-semibold rounded-lg hover:bg-slate-900 transition-colors">
                  Retry
                </button>
              </div>
            )}

            {/* ── Compose form ── */}
            {step === 'compose' && (
              <div className="space-y-5">
                {/* Recipient */}
                <div className="space-y-3">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" /> Recipient
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-600 mb-1 font-medium">
                        Email <span className="text-red-500">*</span>
                        {company.contactEmail && (
                          <span className="ml-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">✓ from scraping</span>
                        )}
                      </label>
                      <input
                        type="email"
                        value={toEmail}
                        onChange={e => setToEmail(e.target.value)}
                        placeholder="contact@company.com"
                        className={`w-full text-sm px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-400 ${
                          company.contactEmail ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 mb-1 font-medium">Name (optional)</label>
                      <input
                        type="text"
                        value={toName}
                        onChange={e => setToName(e.target.value)}
                        placeholder="Contact name"
                        className="w-full text-sm px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-400"
                      />
                    </div>
                  </div>
                </div>

                {/* Employee type */}
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" /> Profile to Offer <span className="text-red-500">*</span>
                  </p>

                  <div className="relative" ref={dropdownRef}>
                    <button
                      type="button"
                      onClick={() => setTypeDropdownOpen(!typeDropdownOpen)}
                      className={`w-full flex items-center justify-between text-sm px-3 py-2.5 rounded-lg border transition-all ${
                        selectedType
                          ? 'bg-blue-50 border-blue-200 text-blue-900 font-medium'
                          : 'bg-slate-50 border-slate-200 text-slate-400'
                      } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    >
                      <span className="flex items-center gap-2">
                        {selectedType?.icon && <span>{selectedType.icon}</span>}
                        {selectedType ? selectedType.name : 'Select employee type…'}
                      </span>
                      <ChevronDown className={`w-4 h-4 transition-transform ${typeDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>

                    <AnimatePresence>
                      {typeDropdownOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={{ duration: 0.15 }}
                          className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden"
                        >
                          <div className="p-2 border-b border-slate-100">
                            <div className="relative">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                              <input
                                type="text"
                                value={typeSearch}
                                onChange={e => setTypeSearch(e.target.value)}
                                placeholder="Search profile…"
                                autoFocus
                                className="w-full text-sm pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                          </div>

                          <div className="max-h-60 overflow-y-auto">
                            {(Object.entries(groupedTypes) as [string, EmployeeType[]][]).map(([category, types]) => (
                              <div key={category}>
                                <p className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50 sticky top-0">
                                  {category}
                                </p>
                                {types.map(type => (
                                  <button
                                    key={type.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedType(type);
                                      setTypeDropdownOpen(false);
                                      setTypeSearch('');
                                    }}
                                    className={`w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-blue-50 transition-colors ${
                                      selectedType?.id === type.id ? 'bg-blue-50 text-blue-700' : 'text-slate-700'
                                    }`}
                                  >
                                    <span className="text-base shrink-0">{type.icon}</span>
                                    <span className="text-sm font-medium">{type.name}</span>
                                    {selectedType?.id === type.id && (
                                      <Check className="w-3.5 h-3.5 ml-auto text-blue-600" />
                                    )}
                                  </button>
                                ))}
                              </div>
                            ))}
                            {filteredTypes.length === 0 && (
                              <p className="text-sm text-slate-400 text-center py-6">
                                No profiles found for "{typeSearch}"
                              </p>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {selectedType && (
                    <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 leading-relaxed">
                      {selectedType.description}
                    </p>
                  )}
                </div>

                {/* Subject */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Subject <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    className="w-full text-sm px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Additional message */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5" /> Additional message (optional)
                  </label>
                  <textarea
                    value={customMessage}
                    onChange={e => setCustomMessage(e.target.value)}
                    placeholder="Add a custom paragraph to include in the email body…"
                    rows={3}
                    className="w-full text-sm px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none placeholder-slate-400"
                  />
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <p className="text-xs text-slate-400">
                    Sent via <span className="font-semibold text-slate-600">mDirector</span>
                  </p>
                  <div className="flex gap-2">
                    <button onClick={onClose}
                      className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                      Cancel
                    </button>
                    <button
                      onClick={handleNext}
                      disabled={!isValid}
                      className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                      Preview &amp; Send
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Template preview ── */}
            {step === 'template' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileCheck className="w-4 h-4 text-blue-600" />
                    <p className="text-sm font-bold text-slate-800">Email Content</p>
                  </div>
                  {hasTemplate && (
                    <button
                      onClick={handleAiImprove}
                      disabled={improvingTemplate}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-100 disabled:opacity-50 transition-colors"
                    >
                      {improvingTemplate
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Improving…</>
                        : <><Sparkles className="w-3.5 h-3.5" /> Improve with AI</>
                      }
                    </button>
                  )}
                </div>

                {loadingTemplate ? (
                  <div className="flex items-center justify-center gap-3 py-10 bg-slate-50 rounded-xl border border-slate-200">
                    <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                    <span className="text-sm text-slate-500">Loading template…</span>
                  </div>
                ) : hasTemplate && templateContent ? (
                  <>
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 max-h-64 overflow-y-auto">
                      <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
                        {templateContent}
                      </pre>
                    </div>
                    <p className="text-[10px] text-slate-400 flex items-center gap-1">
                      <FileCheck className="w-3 h-3 text-emerald-500" />
                      Template filled with {company.name}'s data. You can edit it below.
                    </p>
                    {/* Editable version */}
                    <textarea
                      value={templateContent}
                      onChange={e => setTemplateContent(e.target.value)}
                      rows={6}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono"
                    />
                  </>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                    <p className="text-sm text-amber-700 font-medium">No template configured for this service</p>
                    <p className="text-xs text-amber-600 mt-1">
                      Go to <strong>Services → {selectedType?.name}</strong> and create a letter template.
                      <br />The email will be sent using the additional message you entered.
                    </p>
                  </div>
                )}

                {/* Recipient summary */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-800 space-y-1">
                  <div><span className="font-semibold">To:</span> {toEmail}{toName ? ` (${toName})` : ''}</div>
                  <div><span className="font-semibold">Subject:</span> {subject}</div>
                  <div><span className="font-semibold">Profile:</span> {selectedType?.name}</div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <button
                    onClick={() => setStep('compose')}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                  </button>
                  <button
                    onClick={handleSend}
                    className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Send className="w-4 h-4" />
                    Send Email
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
