import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiJson } from '../../services/apiClient';
import { Loader2, Plus, UserPlus, Shield, Mail, User as UserIcon, Users, Trash2 } from 'lucide-react';

interface TeamUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'editor' | 'viewer';
  isActive: boolean;
  createdAt: string;
}

export const UserManagement: React.FC = () => {
  const { userProfile } = useAuth();
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState<'admin' | 'editor' | 'viewer'>('viewer');

  useEffect(() => {
    apiJson<TeamUser[]>('/api/users')
      .then(setUsers)
      .catch(() => setError('Error al cargar usuarios.'))
      .finally(() => setLoading(false));
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setCreating(true);
    try {
      const newUser = await apiJson<TeamUser>('/api/users', {
        method: 'POST',
        body: JSON.stringify({ email, password, firstName, lastName, role }),
      });
      setUsers(prev => [...prev, newUser]);
      setSuccess(`Usuario ${email} creado correctamente.`);
      setEmail(''); setPassword(''); setFirstName(''); setLastName(''); setRole('viewer');
    } catch (err: any) {
      setError(err.message || 'Error al crear usuario.');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Desactivar este usuario?')) return;
    try {
      await apiJson(`/api/users/${id}`, { method: 'DELETE' });
      setUsers(prev => prev.filter(u => u.id !== id));
    } catch (err: any) {
      setError(err.message || 'Error al eliminar usuario.');
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
      setError(err.message || 'Error al cambiar rol.');
    }
  };

  if (userProfile?.role !== 'admin') {
    return (
      <div className="p-6 text-center text-slate-500">
        You do not have permission to view this page.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-lime-600" />
          Create New User
        </h3>
        
        <form onSubmit={handleCreateUser} className="space-y-4">
          {error && <div className="p-3 bg-rose-50 text-rose-600 rounded-lg text-sm">{error}</div>}
          {success && <div className="p-3 bg-lime-50 text-lime-700 rounded-lg text-sm">{success}</div>}
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label>
              <input type="text" required value={firstName} onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-lime-500 focus:border-lime-500 sm:text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Apellido</label>
              <input type="text" required value={lastName} onChange={(e) => setLastName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-lime-500 focus:border-lime-500 sm:text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-lime-500 focus:border-lime-500 sm:text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña temporal</label>
              <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-lime-500 focus:border-lime-500 sm:text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Rol</label>
              <select value={role} onChange={(e) => setRole(e.target.value as any)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-lime-500 focus:border-lime-500 sm:text-sm">
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 bg-lime-600 text-white rounded-lg text-sm font-medium hover:bg-lime-700 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create User
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-lime-600" />
            Team Members
          </h3>
        </div>
        
        {loading ? (
          <div className="p-8 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {users.map((user) => (
              <div key={user.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center border border-slate-200">
                    <UserIcon className="w-5 h-5 text-slate-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{user.firstName} {user.lastName}</p>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Mail className="w-3 h-3" />
                      {user.email}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {user.id !== userProfile?.id && (
                    <select
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.id, e.target.value)}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white"
                    >
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                      <option value="admin">Admin</option>
                    </select>
                  )}
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1
                    ${user.role === 'admin' ? 'bg-purple-50 text-purple-700' : 
                      user.role === 'editor' ? 'bg-blue-50 text-blue-700' : 
                      'bg-slate-100 text-slate-700'}`}>
                    <Shield className="w-3 h-3" />
                    {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                  </span>
                  <span className={`text-xs font-medium ${user.isActive ? 'text-lime-600' : 'text-slate-400'}`}>
                    {user.isActive ? 'Activo' : 'Inactivo'}
                  </span>
                  {user.id !== userProfile?.id && (
                    <button onClick={() => handleDelete(user.id)} className="p-1.5 text-slate-400 hover:text-rose-500 transition-colors" title="Desactivar usuario">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
