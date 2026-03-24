import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiJson } from '../../services/apiClient';
import { User, Mail, Shield, Loader2, Lock } from 'lucide-react';

export const ProfileSettings: React.FC = () => {
  const { userProfile, refreshUser } = useAuth();
  const [firstName, setFirstName] = useState(userProfile?.firstName || '');
  const [lastName, setLastName] = useState(userProfile?.lastName || '');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Password change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;
    setLoading(true);
    setMessage('');
    try {
      await apiJson('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ firstName, lastName }),
      });
      await refreshUser();
      setMessage('Profile updated successfully.');
    } catch (err: any) {
      setMessage(err.message || 'Error updating profile.');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordLoading(true);
    setPasswordMsg('');
    try {
      await apiJson('/api/auth/password', {
        method: 'PATCH',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setPasswordMsg('Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: any) {
      setPasswordMsg(err.message || 'Error changing password.');
    } finally {
      setPasswordLoading(false);
    }
  };

  if (!userProfile) return null;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Personal Info */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
          <User className="w-5 h-5 text-lime-600" />
          Personal Information
        </h3>

        <form onSubmit={handleUpdateProfile} className="space-y-4">
          {message && (
            <div className={`p-3 rounded-lg text-sm ${message.includes('correctamente') ? 'bg-lime-50 text-lime-700' : 'bg-rose-50 text-rose-600'}`}>
              {message}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">First Name</label>
              <input type="text" required value={firstName} onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-lime-500 focus:border-lime-500 sm:text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Last Name</label>
              <input type="text" required value={lastName} onChange={(e) => setLastName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-lime-500 focus:border-lime-500 sm:text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 sm:text-sm">
              <Mail className="w-4 h-4" />
              {userProfile.email}
            </div>
          </div>
          <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 sm:text-sm">
              <Shield className="w-4 h-4" />
              <span className="capitalize">{userProfile.role}</span>
            </div>
          </div>
          <div className="pt-2 flex justify-end">
            <button type="submit" disabled={loading}
              className="px-4 py-2 bg-lime-600 text-white rounded-lg text-sm font-medium hover:bg-lime-700 transition-colors flex items-center gap-2 disabled:opacity-50">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Changes
            </button>
          </div>
        </form>
      </div>

      {/* Change Password */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
          <Lock className="w-5 h-5 text-lime-600" />
          Change Password
        </h3>
        <form onSubmit={handleChangePassword} className="space-y-4">
          {passwordMsg && (
            <div className={`p-3 rounded-lg text-sm ${passwordMsg.includes('correctamente') ? 'bg-lime-50 text-lime-700' : 'bg-rose-50 text-rose-600'}`}>
              {passwordMsg}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Current Password</label>
            <input type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-lime-500 focus:border-lime-500 sm:text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">New Password (min. 8 characters)</label>
            <input type="password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-lime-500 focus:border-lime-500 sm:text-sm" />
          </div>
          <div className="pt-2 flex justify-end">
            <button type="submit" disabled={passwordLoading}
              className="px-4 py-2 bg-slate-700 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors flex items-center gap-2 disabled:opacity-50">
              {passwordLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              Change Password
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
