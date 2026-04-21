import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, FileText, Save, Trash2, Loader2, Sparkles,
  CheckCircle2, AlertCircle, Eye, Edit3, RotateCcw, Info,
} from 'lucide-react';
import { api } from '../../services/apiClient';

interface ServiceType { id: string; name: string; category: string; }
interface LetterTemplateModalProps {
  service: ServiceType;
  onClose: () => void;
}

const VARIABLES = [
  { key: '{{company_name}}', label: 'Company name' },
  { key: '{{contact_email}}', label: 'Contact email' },
  { key: '{{phone}}', label: 'Phone' },
  { key: '{{city}}', label: 'City' },
  { key: '{{province}}', label: 'Province' },
  { key: '{{address}}', label: 'Address' },
  { key: '{{industry}}', label: 'Industry' },
  { key: '{{website}}', label: 'Website' },
  { key: '{{date}}', label: 'Date' },
];

const DEFAULT_TEMPLATE = (serviceName: string) => `Dear {{company_name}} team,

I hope this message finds you well. My name is [Your Name] from VSM Services, a staffing agency specializing in connecting businesses with qualified professionals.

We noticed that companies in the {{industry}} sector in {{city}} often require skilled ${serviceName} professionals, and we believe we can help you meet that need.

At VSM Services, we offer:
• Pre-screened, experienced ${serviceName} candidates
• Fast placement (typically within 48-72 hours)
• Full compliance with local labor regulations
• Ongoing support throughout the placement

We would love the opportunity to discuss how we can support your staffing needs. Please feel free to reach out to us at your convenience.

Best regards,
VSM Services Team
{{date}}`;

export const LetterTemplateModal: React.FC<LetterTemplateModalProps> = ({ service, onClose }) => {
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [content, setContent] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasTemplate, setHasTemplate] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [dirty, setDirty] = useState(false);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    api(`/api/service-templates/${service.id}`)
      .then(r => r.json())
      .then(d => {
        if (d.data) {
          setContent(d.data.content);
          setName(d.data.name || `${service.name} Letter`);
          setHasTemplate(true);
        } else {
          setContent(DEFAULT_TEMPLATE(service.name));
          setName(`${service.name} Letter`);
          setHasTemplate(false);
        }
      })
      .catch(() => { setContent(DEFAULT_TEMPLATE(service.name)); setName(`${service.name} Letter`); })
      .finally(() => setLoading(false));
  }, [service.id, service.name]);

  const preview = content
    .replace(/\{\{company_name\}\}/gi, 'Acme Corp')
    .replace(/\{\{contact_email\}\}/gi, 'hr@acme.com')
    .replace(/\{\{phone\}\}/gi, '+1 514 555-0100')
    .replace(/\{\{city\}\}/gi, 'Montreal')
    .replace(/\{\{province\}\}/gi, 'QC')
    .replace(/\{\{address\}\}/gi, '123 Rue Sherbrooke')
    .replace(/\{\{industry\}\}/gi, 'Food & Beverage')
    .replace(/\{\{website\}\}/gi, 'www.acme.com')
    .replace(/\{\{date\}\}/gi, new Date().toLocaleDateString('en-CA', { dateStyle: 'long' }));

  async function handleSave() {
    setSaving(true);
    try {
      const r = await api(`/api/service-templates/${service.id}`, {
        method: 'POST',
        body: JSON.stringify({ name, content }),
      });
      const d = await r.json();
      if (d.success) { showToast('Template saved!'); setHasTemplate(true); setDirty(false); }
      else showToast('Error saving', false);
    } catch { showToast('Connection error', false); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!confirm('Delete this template?')) return;
    setDeleting(true);
    try {
      await api(`/api/service-templates/${service.id}`, { method: 'DELETE' });
      setContent(DEFAULT_TEMPLATE(service.name));
      setHasTemplate(false);
      setDirty(false);
      showToast('Template deleted');
    } catch { showToast('Error deleting', false); }
    finally { setDeleting(false); }
  }

  function insertVariable(v: string) {
    setContent(c => c + v);
    setDirty(true);
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
        onClick={e => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-lime-50 rounded-lg flex items-center justify-center ring-1 ring-lime-200">
                <FileText className="w-5 h-5 text-lime-600" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">Email Letter Template</h2>
                <p className="text-xs text-slate-500">{service.name} · {service.category}</p>
              </div>
              {hasTemplate && (
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">Configured</span>
              )}
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>

          {/* Toast */}
          <AnimatePresence>
            {toast && (
              <motion.div
                initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className={`mx-6 mt-3 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${
                  toast.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
                }`}
              >
                {toast.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                {toast.msg}
              </motion.div>
            )}
          </AnimatePresence>

          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-lime-600" />
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Template name */}
              <div className="px-6 pt-4 pb-0">
                <input
                  value={name}
                  onChange={e => { setName(e.target.value); setDirty(true); }}
                  placeholder="Template name…"
                  className="w-full text-sm font-semibold px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-lime-500/30 focus:border-lime-500 bg-slate-50"
                />
              </div>

              {/* Tabs */}
              <div className="flex gap-1 px-6 pt-3">
                {(['edit', 'preview'] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      tab === t ? 'bg-lime-600 text-white' : 'text-slate-500 hover:bg-slate-100'
                    }`}>
                    {t === 'edit' ? <Edit3 className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    {t === 'edit' ? 'Edit' : 'Preview'}
                  </button>
                ))}
                <div className="ml-auto flex items-center gap-1">
                  <Info className="w-3 h-3 text-slate-400" />
                  <span className="text-[10px] text-slate-400">Use variables below to personalize per company</span>
                </div>
              </div>

              {/* Content area */}
              <div className="flex-1 overflow-hidden flex gap-3 px-6 pt-3 pb-4">
                {/* Left: editor or preview */}
                <div className="flex-1 flex flex-col min-h-0">
                  {tab === 'edit' ? (
                    <textarea
                      value={content}
                      onChange={e => { setContent(e.target.value); setDirty(true); }}
                      className="flex-1 w-full text-sm font-mono px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-lime-500/30 focus:border-lime-500 resize-none bg-slate-50 leading-relaxed"
                      placeholder="Write your email template here…"
                    />
                  ) : (
                    <div className="flex-1 overflow-y-auto px-4 py-3 border border-slate-200 rounded-xl bg-white text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
                      {preview}
                    </div>
                  )}
                </div>

                {/* Right: variables panel */}
                <div className="w-44 shrink-0 space-y-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Variables</p>
                  <div className="space-y-1">
                    {VARIABLES.map(v => (
                      <button key={v.key} onClick={() => insertVariable(v.key)}
                        disabled={tab === 'preview'}
                        className="w-full text-left px-2 py-1.5 rounded-lg text-[11px] font-mono bg-lime-50 text-lime-800 border border-lime-200 hover:bg-lime-100 disabled:opacity-40 transition-colors truncate"
                        title={v.label}
                      >
                        {v.key}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => { setContent(DEFAULT_TEMPLATE(service.name)); setDirty(true); }}
                    className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] text-slate-500 border border-slate-200 hover:bg-slate-50 transition-colors mt-2">
                    <RotateCcw className="w-3 h-3" /> Reset default
                  </button>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  {hasTemplate && (
                    <button onClick={handleDelete} disabled={deleting}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 border border-red-200 transition-colors disabled:opacity-40">
                      {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      Delete
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                    Cancel
                  </button>
                  <button onClick={handleSave} disabled={saving || !dirty}
                    className="flex items-center gap-2 px-4 py-2 bg-lime-600 text-white text-sm font-semibold rounded-lg hover:bg-lime-700 disabled:opacity-40 transition-colors">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save template
                  </button>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
