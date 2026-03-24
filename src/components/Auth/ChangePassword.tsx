import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { apiJson } from '../../services/apiClient';
import { Loader2, ShieldAlert } from 'lucide-react';

export const ChangePassword: React.FC = () => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) return setError('Passwords do not match.');
    if (newPassword.length < 8) return setError('Password must be at least 8 characters.');

    setLoading(true);
    try {
      if (!currentUser) throw new Error('No active user.');
      await apiJson('/api/auth/password', {
        method: 'PATCH',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Error changing password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center shadow-lg">
            <ShieldAlert className="text-amber-600 w-7 h-7" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-black text-slate-900 uppercase tracking-tight">
          Update Password
        </h2>
        <p className="mt-2 text-center text-sm text-slate-600">
          Change your password to continue
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl shadow-slate-200/50 sm:rounded-2xl sm:px-10 border border-slate-100">
          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-600 text-sm rounded-lg p-4">{error}</div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Current Password</label>
              <input type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-amber-500 focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">New Password (min. 8 characters)</label>
              <input type="password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-amber-500 focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Confirm New Password</label>
              <input type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-amber-500 focus:border-amber-500" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-2.5 bg-amber-600 text-white rounded-lg text-sm font-bold hover:bg-amber-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Change Password
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};


