import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiJson } from '../../services/apiClient';
import {
  Loader2, Plus, UserPlus, Shield, Mail, Users, Trash2,
  Search, Eye, EyeOff, CheckCircle, AlertCircle, UserCheck, UserX, Calendar,
} from 'lucide-react';

interface TeamUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'editor' | 'viewer';
  isActive: boolean;
  createdAt: string;
}

const ROLE_STYLES: Record<string, string> = {
  admin:  'bg-purple-50 text-purple-700 border-purple-200',
  editor: 'bg-blue-50 text-blue-700 border-blue-200',
  viewer: 'bg-slate-100 text-slate-600 border-slate-200',
};

const AVATAR_COLORS = [
  'bg-lime-500', 'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500',
  'bg-blue-500', 'bg-violet-500', 'bg-purple-500', 'bg-fuchsia-500',
  'bg-rose-500', 'bg-orange-500',
];

function avatarColor(email: string) {
  let h = 0;
  for (const c of email) h = ((h << 5) - h) + c.charCodeAt(0);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function initials(u: Pick<TeamUser, 'firstName' | 'lastName'>) {
  return `${(u.firstName[0] || '').toUpperCase()}${(u.lastName[0] || '').toUpperCase()}`;
}

export const UserManagement: React.FC = () => {
  const { userProfile } = useAuth();
  const [users,   setUsers]   = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState('');
  const [search,  setSearch]  = useState('');

  // Create user form
  const [showForm,    setShowForm]    = useState(false);
  const [creating,    setCreating]    = useState(false);
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [showPw,      setShowPw]      = useState(false);
  const [firstName,   setFirstName]   = useState('');
  const [lastName,    setLastName]    = useState('');
  const [role,        setRole]        = useState<'admin' | 'editor' | 'viewer'>('viewer');

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return users;
    return users.filter(u =>
      `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(q)
    );
  }, [users, search]);

  const stats = useMemo(() => ({
    total:   users.length,
    active:  users.filter(u => u.isActive).length,
    admins:  users.filter(u => u.role === 'admin').length,
    editors: users.filter(u => u.role === 'editor').length,
    viewers: users.filter(u => u.role === 'viewer').length,
  }), [users]);

  useEffect(() => {
    apiJson<TeamUser[]>('/api/users')
      .then(setUsers)
      .catch(() => setError('Error loading users.'))
      .finally(() => setLoading(false));
  }, []);

  const showMsg = (text: string, isError = false) => {
    if (isError) { setError(text); setSuccess(''); }
    else         { setSuccess(text); setError(''); }
    setTimeout(() => { setError(''); setSuccess(''); }, 4000);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const newUser = await apiJson<TeamUser>('/api/users', {
        method: 'POST',
        body: JSON.stringify({ email, password, firstName, lastName, role }),
      });
      setUsers(prev => [...prev, newUser]);
      showMsg(`User ${email} created successfully.`);
      setEmail(''); setPassword(''); setFirstName(''); setLastName(''); setRole('viewer');
      setShowForm(false);
    } catch (err: any) {
      showMsg(err.message || 'Error creating user.', true);
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (user: TeamUser) => {
    const action = user.isActive ? 'deactivate' : 'reactivate';
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} ${user.firstName} ${user.lastName}?`)) return;
    try {
      if (user.isActive) {
        await apiJson(`/api/users/${user.id}`, { method: 'DELETE' });
        setUsers(prev => prev.filter(u => u.id !== user.id));
        showMsg(`${user.firstName} deactivated.`);
      } else {
        const updated = await apiJson<TeamUser>(`/api/users/${user.id}/activate`, { method: 'PATCH' });
        setUsers(prev => prev.map(u => u.id === user.id ? updated : u));
        showMsg(`${user.firstName} reactivated.`);
      }
    } catch (err: any) {
      showMsg(err.message || `Error ${action}ing user.`, true);
    }
  };

  const handleRoleChange = async (id: string, newRole: string) => {
    try {
      const updated = await apiJson<TeamUser>(`/api/users/${id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role: newRole }),
      });
      setUsers(prev => prev.map(u => u.id === id ? updated : u));
    } catch (err: any) {
      showMsg(err.message || 'Error changing role.', true);
    }
  };

  if (userProfile?.role !== 'admin') {
    return (
      <div className="p-10 text-center">
        <Shield className="w-12 h-12 mx-auto text-slate-300 mb-3" />
        <p className="text-slate-500 font-medium">Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total',   value: stats.total,   color: 'text-slate-700' },
          { label: 'Active',  value: stats.active,  color: 'text-lime-600'  },
          { label: 'Admins',  value: stats.admins,  color: 'text-purple-600'},
          { label: 'Editors', value: stats.editors, color: 'text-blue-600'  },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4 text-center shadow-sm">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Global messages */}
      {(error || success) && (
        <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${success ? 'bg-lime-50 text-lime-700 border border-lime-200' : 'bg-rose-50 text-rose-600 border border-rose-200'}`}>
          {success ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          {success || error}
        </div>
      )}

      {/* Create user */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-lime-600" />
            Create New User
          </h3>
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-lime-600 text-white rounded-lg text-xs font-medium hover:bg-lime-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {showForm ? 'Cancel' : 'New User'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleCreateUser} className="p-5 space-y-4 bg-slate-50/50">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">First Name</label>
                <input type="text" required value={firstName} onChange={(e) => setFirstName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-lime-400 focus:border-lime-400 outline-none transition bg-white" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Last Name</label>
                <input type="text" required value={lastName} onChange={(e) => setLastName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-lime-400 focus:border-lime-400 outline-none transition bg-white" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-lime-400 focus:border-lime-400 outline-none transition bg-white" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Temporary Password</label>
                <div className="relative">
                  <input type={showPw ? 'text' : 'password'} required minLength={8} value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 pr-9 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-lime-400 focus:border-lime-400 outline-none transition bg-white" />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Role</label>
                <select value={role} onChange={(e) => setRole(e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-lime-400 focus:border-lime-400 outline-none transition bg-white">
                  <option value="viewer">Viewer — read only</option>
                  <option value="editor">Editor — can edit data</option>
                  <option value="admin">Admin — full access</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={creating}
                className="px-4 py-2 bg-lime-600 text-white rounded-lg text-sm font-medium hover:bg-lime-700 transition-colors flex items-center gap-2 disabled:opacity-50">
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Create User
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Team list */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-4 h-4 text-lime-600" />
            Team Members
          </h3>
          <div className="relative sm:ml-auto">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text" placeholder="Search by name or email…" value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-lime-400 focus:border-lime-400 outline-none transition w-56"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-10 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-slate-400">
            <Users className="w-10 h-10 mx-auto mb-2 text-slate-200" />
            <p className="text-sm">{search ? 'No users match your search.' : 'No users yet.'}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((user) => {
              const isMe = user.id === userProfile?.id;
              return (
                <div key={user.id} className={`px-5 py-4 flex items-center gap-4 hover:bg-slate-50/70 transition-colors ${!user.isActive ? 'opacity-50' : ''}`}>
                  {/* Avatar */}
                  <div className={`w-9 h-9 rounded-full ${avatarColor(user.email)} flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-sm`}>
                    {initials(user)}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {user.firstName} {user.lastName}
                      </p>
                      {isMe && (
                        <span className="px-1.5 py-0.5 bg-lime-50 text-lime-700 border border-lime-200 rounded text-xs font-medium">You</span>
                      )}
                      {!user.isActive && (
                        <span className="px-1.5 py-0.5 bg-slate-100 text-slate-400 rounded text-xs">Inactive</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="flex items-center gap-1 text-xs text-slate-400 truncate">
                        <Mail className="w-3 h-3 shrink-0" />{user.email}
                      </span>
                      {user.createdAt && (
                        <span className="hidden sm:flex items-center gap-1 text-xs text-slate-400 shrink-0">
                          <Calendar className="w-3 h-3" />
                          {new Date(user.createdAt).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Role selector */}
                    {!isMe ? (
                      <select
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                        className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white focus:ring-1 focus:ring-lime-400 outline-none"
                      >
                        <option value="viewer">Viewer</option>
                        <option value="editor">Editor</option>
                        <option value="admin">Admin</option>
                      </select>
                    ) : (
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border ${ROLE_STYLES[user.role]}`}>
                        <Shield className="w-3 h-3" />
                        {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                      </span>
                    )}

                    {/* Toggle active */}
                    {!isMe && (
                      <button
                        onClick={() => handleToggleActive(user)}
                        title={user.isActive ? 'Deactivate user' : 'Reactivate user'}
                        className={`p-1.5 rounded-lg transition-colors ${user.isActive ? 'text-slate-400 hover:text-rose-500 hover:bg-rose-50' : 'text-slate-400 hover:text-lime-600 hover:bg-lime-50'}`}
                      >
                        {user.isActive ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
