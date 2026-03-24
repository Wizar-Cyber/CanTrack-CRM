import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Search, Send, Mail, ChevronDown, Check,
  Loader2, AlertCircle, CheckCircle2, User, FileText, MessageSquare
} from 'lucide-react';
import { Company } from '../../types';
import { EMPLOYEE_TYPES, EMPLOYEE_CATEGORIES, EmployeeType } from '../../data/employeeTypes';
import { api } from '../../services/apiClient';

interface SendOfferModalProps {
  company: Company;
  onClose: () => void;
}

type Step = 'compose' | 'sending' | 'success' | 'error';

export const SendOfferModal: React.FC<SendOfferModalProps> = ({ company, onClose }) => {
  const [step, setStep] = useState<Step>('compose');
  const [errorMsg, setErrorMsg] = useState('');

  // Formulario
  const [toEmail, setToEmail] = useState(company.contactEmail || '');
  const [toName, setToName] = useState('');
  const [selectedType, setSelectedType] = useState<EmployeeType | null>(null);
  const [subject, setSubject] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [typeSearch, setTypeSearch] = useState('');
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Auto-generar subject cuando cambia el tipo o empresa
  useEffect(() => {
    if (selectedType) {
      setSubject(`Oferta de Personal: ${selectedType.name} para ${company.name}`);
    }
  }, [selectedType, company.name]);

  // Cerrar dropdown al click fuera
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
          customMessage: customMessage || undefined,
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
      {/* Backdrop */}
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
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* ── Estados de resultado ── */}
            {step === 'sending' && (
              <div className="flex flex-col items-center gap-4 py-12">
                <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                <p className="text-sm text-slate-600 font-medium">Sending email via mDirector…</p>
              </div>
            )}

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
                <button
                  onClick={onClose}
                  className="mt-2 px-6 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  Close
                </button>
              </div>
            )}

            {step === 'error' && (
              <div className="flex flex-col items-center gap-4 py-10">
                <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center">
                  <AlertCircle className="w-8 h-8 text-red-500" />
                </div>
                <div className="text-center">
                  <p className="text-base font-bold text-slate-900">Send Error</p>
                  <p className="text-sm text-red-600 mt-1">{errorMsg}</p>
                </div>
                <button
                  onClick={() => setStep('compose')}
                  className="px-6 py-2.5 bg-slate-800 text-white text-sm font-semibold rounded-lg hover:bg-slate-900 transition-colors"
                >
                  Retry
                </button>
              </div>
            )}

            {/* ── Formulario ── */}
            {step === 'compose' && (
              <div className="space-y-5">

                {/* Destinatario */}
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
                        placeholder="contacto@empresa.com"
                        className={`w-full text-sm px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-400 ${
                          company.contactEmail ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 mb-1 font-medium">
                        Name (optional)
                      </label>
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

                {/* Tipo de empleado */}
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
                          {/* Search dentro del dropdown */}
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

                          {/* Lista agrupada */}
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

                  {/* Preview del perfil seleccionado */}
                  {selectedType && (
                    <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 leading-relaxed">
                      {selectedType.description}
                    </p>
                  )}
                </div>

                {/* Asunto */}
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

                {/* Mensaje personalizado */}
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

                {/* Footer botones */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <p className="text-xs text-slate-400">
                    Sent via <span className="font-semibold text-slate-600">mDirector</span>
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={onClose}
                      className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSend}
                      disabled={!isValid}
                      className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <Send className="w-4 h-4" />
                      Send Email
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
