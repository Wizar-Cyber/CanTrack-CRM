import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiJson } from '../../services/apiClient';
import { User, Mail, Shield, Loader2, Lock, Eye, EyeOff, CheckCircle, AlertCircle, Calendar } from 'lucide-react';

function getInitials(firstName: string, lastName: string) {
  return `${(firstName[0] || '').toUpperCase()}${(lastName[0] || '').toUpperCase()}`;
}

function getAvatarColor(email: string) {
  const colors = [
    'bg-lime-500', 'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500',
    'bg-blue-500', 'bg-violet-500', 'bg-purple-500', 'bg-fuchsia-500',
  ];
  let hash = 0;
  for (const c of email) hash = ((hash << 5) - hash) + c.charCodeAt(0);
  return colors[Math.abs(hash) % colors.length];
}

function passwordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score, label: 'Weak',   color: 'bg-rose-500' };
  if (score <= 3) return { score, label: 'Fair',   color: 'bg-amber-400' };
  if (score === 4) return { score, label: 'Good',  color: 'bg-lime-400' };
  return              { score, label: 'Strong', color: 'bg-lime-600' };
}

export const ProfileSettings: React.FC = () => {
  const { userProfile, refreshUser } = useAuth();
  const [firstName, setFirstName] = useState(userProfile?.firstName || '');
  const [lastName,  setLastName]  = useState(userProfile?.lastName  || '');
  const [loading,   setLoading]   = useState(false);
  const [message,   setMessage]   = useState<{ text: string; ok: boolean } | null>(null);

  const [currentPw,   setCurrentPw]   = useState('');
  const [newPw,        setNewPw]        = useState('');
  const [confirmPw,    setConfirmPw]    = useState('');
  const [showCurrent,  setShowCurrent]  = useState(false);
  const [showNew,      setShowNew]      = useState(false);
  const [showConfirm,  setShowConfirm]  = useState(false);
  const [pwMsg,        setPwMsg]        = useState<{ text: string; ok: boolean } | null>(null);
  const [pwLoading,    setPwLoading]    = useState(false);

  if (!userProfile) return null;

  const avatarColor = getAvatarColor(userProfile.email);
  const initials    = getInitials(userProfile.firstName, userProfile.lastName);
  const strength    = newPw ? passwordStrength(newPw) : null;
  const pwMismatch  = confirmPw && newPw !== confirmPw;

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      await apiJson('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ firstName, lastName }),
      });
      await refreshUser();
      setMessage({ text: 'Profile updated successfully.', ok: true });
    } catch (err: any) {
      setMessage({ text: err.message || 'Error updating profile.', ok: false });
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw !== confirmPw) {
      setPwMsg({ text: 'Passwords do not match.', ok: false });
      return;
    }
    setPwLoading(true);
    setPwMsg(null);
    try {
      await apiJson('/api/auth/password', {
        method: 'PATCH',
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      setPwMsg({ text: 'Password changed successfully.', ok: true });
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch (err: any) {
      setPwMsg({ text: err.message || 'Error changing password.', ok: false });
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">

      {/* Avatar + account summary */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center gap-5">
        <div className={`w-16 h-16 rounded-full ${avatarColor} flex items-center justify-center text-white text-xl font-bold shadow-sm shrink-0`}>
          {initials}
        </div>
        <div className="min-w-0">
          <p className="text-lg font-bold text-slate-900 truncate">
            {userProfile.firstName} {userProfile.lastName}
          </p>
          <p className="text-sm text-slate-500 truncate">{userProfile.email}</p>
          <div className="flex items-center gap-3 mt-1.5">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
              ${userProfile.role === 'admin'  ? 'bg-purple-100 text-purple-700' :
                userProfile.role === 'editor' ? 'bg-blue-100 text-blue-700'     :
                                                'bg-slate-100 text-slate-600'}`}>
              <Shield className="w-3 h-3" />
              {userProfile.role.charAt(0).toUpperCase() + userProfile.role.slice(1)}
            </span>
            {userProfile.createdAt && (
              <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                <Calendar className="w-3 h-3" />
                Member since {new Date(userProfile.createdAt).toLocaleDateString('en-CA', { year: 'numeric', month: 'short' })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Personal Info */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-base font-bold text-slate-900 mb-5 flex items-center gap-2">
          <User className="w-4 h-4 text-lime-600" />
          Personal Information
        </h3>

        <form onSubmit={handleUpdateProfile} className="space-y-4">
          {message && (
            <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${message.ok ? 'bg-lime-50 text-lime-700 border border-lime-200' : 'bg-rose-50 text-rose-600 border border-rose-200'}`}>
              {message.ok ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              {message.text}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">First Name</label>
              <input
                type="text" required value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-lime-400 focus:border-lime-400 outline-none transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Last Name</label>
              <input
                type="text" required value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-lime-400 focus:border-lime-400 outline-none transition"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 text-sm">
              <Mail className="w-4 h-4 shrink-0" />
              {userProfile.email}
            </div>
            <p className="text-xs text-slate-400 mt-1">Email cannot be changed. Contact an admin if needed.</p>
          </div>
          <div className="pt-1 flex justify-end">
            <button
              type="submit" disabled={loading}
              className="px-4 py-2 bg-lime-600 text-white rounded-lg text-sm font-medium hover:bg-lime-700 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Changes
            </button>
          </div>
        </form>
      </div>

      {/* Change Password */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-base font-bold text-slate-900 mb-5 flex items-center gap-2">
          <Lock className="w-4 h-4 text-lime-600" />
          Change Password
        </h3>
        <form onSubmit={handleChangePassword} className="space-y-4">
          {pwMsg && (
            <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${pwMsg.ok ? 'bg-lime-50 text-lime-700 border border-lime-200' : 'bg-rose-50 text-rose-600 border border-rose-200'}`}>
              {pwMsg.ok ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              {pwMsg.text}
            </div>
          )}

          {/* Current password */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Current Password</label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'} required value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-lime-400 focus:border-lime-400 outline-none transition"
              />
              <button type="button" onClick={() => setShowCurrent(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* New password */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">New Password</label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'} required minLength={8} value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-lime-400 focus:border-lime-400 outline-none transition"
              />
              <button type="button" onClick={() => setShowNew(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {strength && newPw && (
              <div className="mt-2 space-y-1">
                <div className="flex gap-1">
                  {[1,2,3,4,5].map(i => (
                    <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= strength.score ? strength.color : 'bg-slate-200'}`} />
                  ))}
                </div>
                <p className="text-xs text-slate-500">Strength: <span className="font-medium">{strength.label}</span></p>
              </div>
            )}
          </div>

          {/* Confirm password */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Confirm New Password</label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'} required minLength={8} value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                className={`w-full px-3 py-2 pr-10 border rounded-lg text-sm focus:ring-2 outline-none transition
                  ${pwMismatch ? 'border-rose-400 focus:ring-rose-300' : 'border-slate-300 focus:ring-lime-400 focus:border-lime-400'}`}
              />
              <button type="button" onClick={() => setShowConfirm(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {pwMismatch && <p className="text-xs text-rose-500 mt-1">Passwords do not match.</p>}
          </div>

          <div className="pt-1 flex justify-end">
            <button
              type="submit"
              disabled={pwLoading || !!pwMismatch}
              className="px-4 py-2 bg-slate-700 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {pwLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              Change Password
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
