import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users, Search, Plus, Mail, Phone, MapPin, Briefcase,
  ExternalLink, Edit2, Trash2, X, Loader2, UserCheck, Clock,
} from 'lucide-react';
import { Candidate } from '../../types';
import { api } from '../../services/apiClient';

const STATUS_STYLE: Record<string, string> = {
  Available:    'bg-emerald-50 text-emerald-700 border border-emerald-200',
  Placed:       'bg-blue-50   text-blue-700   border border-blue-200',
  Interviewing: 'bg-amber-50  text-amber-700  border border-amber-200',
};

function formatCandidate(c: any): Candidate {
  return {
    id: c.id,
    name: c.name,
    role: c.role || '',
    email: c.email || '',
    phone: c.phone || '',
    location: c.location || '',
    linkedinUrl: c.linkedin_url,
    resumeUrl: c.resume_url,
    yearsOfExperience: c.years_of_experience || 0,
    skills: c.skills || [],
    status: c.status || 'Available',
    bio: c.bio,
  };
}

interface CandidatesListProps {
  onCandidatesChange?: (candidates: Candidate[]) => void;
}

export const CandidatesList: React.FC<CandidatesListProps> = ({ onCandidatesChange }) => {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Candidate | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchCandidates = useCallback(async () => {
    try {
      const res = await api('/api/candidates');
      if (res.ok) {
        const data = await res.json();
        const formatted = data.map(formatCandidate);
        setCandidates(formatted);
        onCandidatesChange?.(formatted);
      }
    } catch (e) {
      console.error('Error fetching candidates:', e);
    } finally {
      setLoading(false);
    }
  }, [onCandidatesChange]);

  useEffect(() => { fetchCandidates(); }, [fetchCandidates]);

  const filtered = candidates.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      c.name.toLowerCase().includes(q) ||
      c.role.toLowerCase().includes(q) ||
      c.skills.some(s => s.toLowerCase().includes(q)) ||
      c.location.toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const counts = {
    all:          candidates.length,
    Available:    candidates.filter(c => c.status === 'Available').length,
    Interviewing: candidates.filter(c => c.status === 'Interviewing').length,
    Placed:       candidates.filter(c => c.status === 'Placed').length,
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este candidato permanentemente?')) return;
    setDeletingId(id);
    try {
      const res = await api(`/api/candidates/${id}`, { method: 'DELETE' });
      if (res.ok) setCandidates(prev => prev.filter(c => c.id !== id));
      else alert('Error al eliminar candidato.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Candidatos</h2>
          <p className="text-sm text-slate-500">
            {candidates.length} candidates · {counts.Available} available · {counts.Placed} placed
          </p>
        </div>
        <button
          onClick={() => { setEditTarget(null); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-lime-600 text-white rounded-lg text-sm font-semibold hover:bg-lime-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          New Candidate
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, role or skill…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm
              focus:outline-none focus:ring-2 focus:ring-lime-500/30 focus:border-lime-500"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {(['all', 'Available', 'Interviewing', 'Placed'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                statusFilter === s
                  ? 'bg-lime-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {s === 'all' ? 'All' : s}
              <span className={`ml-1.5 text-[10px] ${statusFilter === s ? 'opacity-70' : 'opacity-50'}`}>
                {counts[s as keyof typeof counts]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-lime-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 bg-white rounded-xl border-2 border-dashed border-slate-200">
          <Users className="w-12 h-12 text-slate-200 mb-3" />
          <p className="text-slate-500 font-medium">
            {search ? 'No matching candidates' : 'No candidates registered'}
          </p>
          {!search && (
            <button
              onClick={() => setShowForm(true)}
              className="mt-3 text-sm text-lime-600 font-semibold hover:underline"
            >
              + Add first candidate
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <AnimatePresence mode="popLayout">
            {filtered.map(c => (
              <motion.div
                key={c.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94 }}
                className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-all group"
              >
                {/* Top row */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-lime-400 to-emerald-600 flex items-center justify-center text-white font-bold text-lg shadow-sm shrink-0">
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-slate-900 leading-tight truncate">{c.name}</h3>
                      <p className="text-xs text-slate-500 truncate">{c.role || '—'}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full shrink-0 ${STATUS_STYLE[c.status]}`}>
                    {c.status}
                  </span>
                </div>

                {/* Info */}
                <div className="space-y-1.5 mb-4">
                  {c.email && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Mail className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{c.email}</span>
                    </div>
                  )}
                  {c.phone && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Phone className="w-3.5 h-3.5 shrink-0" />
                      <span>{c.phone}</span>
                    </div>
                  )}
                  {c.location && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span>{c.location}</span>
                    </div>
                  )}
                  {c.yearsOfExperience > 0 && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Briefcase className="w-3.5 h-3.5 shrink-0" />
                      <span>{c.yearsOfExperience} year{c.yearsOfExperience !== 1 ? 's' : ''} of experience</span>
                    </div>
                  )}
                </div>

                {/* Skills */}
                {c.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {c.skills.slice(0, 5).map(skill => (
                      <span key={skill} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-medium">
                        {skill}
                      </span>
                    ))}
                    {c.skills.length > 5 && (
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-400 rounded text-[10px]">
                        +{c.skills.length - 5}
                      </span>
                    )}
                  </div>
                )}

                {/* Actions footer */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => { setEditTarget(c); setShowForm(true); }}
                      className="p-1.5 text-slate-400 hover:text-lime-600 hover:bg-lime-50 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(c.id)}
                      disabled={deletingId === c.id}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-40"
                      title="Delete"
                    >
                      {deletingId === c.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  {c.linkedinUrl && (
                    <a
                      href={c.linkedinUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      <ExternalLink className="w-3 h-3" />
                      LinkedIn
                    </a>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Modal form */}
      <AnimatePresence>
        {showForm && (
          <CandidateForm
            candidate={editTarget}
            onClose={() => { setShowForm(false); setEditTarget(null); }}
            onSaved={fetchCandidates}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Form Modal ────────────────────────────────────────────────────────────────

interface CandidateFormProps {
  candidate: Candidate | null;
  onClose: () => void;
  onSaved: () => void;
}

const CandidateForm: React.FC<CandidateFormProps> = ({ candidate, onClose, onSaved }) => {
  const [form, setForm] = useState({
    name:                candidate?.name ?? '',
    role:                candidate?.role ?? '',
    email:               candidate?.email ?? '',
    phone:               candidate?.phone ?? '',
    location:            candidate?.location ?? '',
    linkedin_url:        candidate?.linkedinUrl ?? '',
    years_of_experience: String(candidate?.yearsOfExperience ?? 0),
    bio:                 candidate?.bio ?? '',
    status:              (candidate?.status ?? 'Available') as 'Available' | 'Interviewing' | 'Placed',
    skills:              candidate?.skills ?? [] as string[],
    skillInput:          '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const addSkill = () => {
    const s = form.skillInput.trim();
    if (s && !form.skills.includes(s)) {
      setForm(p => ({ ...p, skills: [...p.skills, s], skillInput: '' }));
    }
  };

  const removeSkill = (s: string) => setForm(p => ({ ...p, skills: p.skills.filter(x => x !== s) }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        name:                form.name.trim(),
        role:                form.role.trim() || null,
        email:               form.email.trim() || null,
        phone:               form.phone.trim() || null,
        location:            form.location.trim() || null,
        linkedin_url:        form.linkedin_url.trim() || null,
        years_of_experience: parseInt(form.years_of_experience) || 0,
        bio:                 form.bio.trim() || null,
        status:              form.status,
        skills:              form.skills,
      };
      const res = await api(
        candidate ? `/api/candidates/${candidate.id}` : '/api/candidates',
        { method: candidate ? 'PATCH' : 'POST', body: JSON.stringify(payload) },
      );
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Error saving.');
      }
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-white border-b border-slate-100 rounded-t-2xl">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-lime-600" />
            {candidate ? 'Edit Candidate' : 'New Candidate'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <p className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-4 py-2">{error}</p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Full Name *"  type="text"   value={form.name}                onChange={v => setForm(p => ({ ...p, name: v }))}               placeholder="e.g. John Smith" />
            <Field label="Role / Position"        type="text"   value={form.role}                onChange={v => setForm(p => ({ ...p, role: v }))}               placeholder="e.g. Production Operator" />
            <Field label="Email"              type="email"  value={form.email}               onChange={v => setForm(p => ({ ...p, email: v }))}              placeholder="john@email.com" />
            <Field label="Phone"           type="tel"    value={form.phone}               onChange={v => setForm(p => ({ ...p, phone: v }))}              placeholder="+1 555 123 4567" />
            <Field label="Location"          type="text"   value={form.location}            onChange={v => setForm(p => ({ ...p, location: v }))}           placeholder="City, Country" />
            <Field label="Years of Experience" type="number" value={form.years_of_experience} onChange={v => setForm(p => ({ ...p, years_of_experience: v }))} placeholder="0" />
            <Field label="LinkedIn URL"       type="url"    value={form.linkedin_url}        onChange={v => setForm(p => ({ ...p, linkedin_url: v }))}       placeholder="https://linkedin.com/in/…" />
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Status</label>
              <select
                value={form.status}
                onChange={e => setForm(p => ({ ...p, status: e.target.value as any }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm
                  focus:outline-none focus:ring-2 focus:ring-lime-500/30 focus:border-lime-500"
              >
                <option value="Available">Available</option>
                <option value="Interviewing">Interviewing</option>
                <option value="Placed">Placed</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Bio / Notes</label>
            <textarea
              value={form.bio}
              onChange={e => setForm(p => ({ ...p, bio: e.target.value }))}
              rows={3}
              placeholder="Brief candidate description…"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none
                focus:outline-none focus:ring-2 focus:ring-lime-500/30 focus:border-lime-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Skills</label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={form.skillInput}
                onChange={e => setForm(p => ({ ...p, skillInput: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } }}
                placeholder="Type skill + Enter…"
                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm
                  focus:outline-none focus:ring-2 focus:ring-lime-500/30 focus:border-lime-500"
              />
              <button
                type="button"
                onClick={addSkill}
                className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors"
              >
                +
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {form.skills.map(s => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-lime-50 text-lime-700 rounded-full text-xs font-medium border border-lime-100"
                >
                  {s}
                  <button type="button" onClick={() => removeSkill(s)} className="text-lime-400 hover:text-lime-700">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-lime-600 text-white text-sm font-semibold rounded-lg
                hover:bg-lime-700 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {candidate ? 'Save Changes' : 'Create Candidate'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};

const Field: React.FC<{
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}> = ({ label, value, onChange, placeholder, type = 'text' }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-600 mb-1.5">{label}</label>
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm
        focus:outline-none focus:ring-2 focus:ring-lime-500/30 focus:border-lime-500"
    />
  </div>
);
