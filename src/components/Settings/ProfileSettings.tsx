import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { User, Mail, Shield, Loader2 } from 'lucide-react';

export const ProfileSettings: React.FC = () => {
  const { userProfile } = useAuth();
  const [name, setName] = useState(userProfile?.name || '');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;
    
    setLoading(true);
    setMessage('');
    
    setTimeout(() => {
      setMessage('Profile updated successfully (Mock).');
      setLoading(false);
    }, 500);
  };

  if (!userProfile) return null;

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm max-w-2xl">
      <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
        <User className="w-5 h-5 text-lime-600" />
        Personal Information
      </h3>
      
      <form onSubmit={handleUpdateProfile} className="space-y-6">
        {message && (
          <div className={`p-3 rounded-lg text-sm ${message.includes('success') ? 'bg-lime-50 text-lime-700' : 'bg-rose-50 text-rose-600'}`}>
            {message}
          </div>
        )}
        
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-lime-500 focus:border-lime-500 sm:text-sm"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
          <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 sm:text-sm">
            <Mail className="w-4 h-4" />
            {userProfile.email}
          </div>
          <p className="mt-1 text-xs text-slate-500">Email cannot be changed.</p>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Role & Permissions</label>
          <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 sm:text-sm">
            <Shield className="w-4 h-4" />
            <span className="capitalize">{userProfile.role}</span>
          </div>
        </div>
        
        <div className="pt-4 border-t border-slate-100 flex justify-end">
          <button
            type="submit"
            disabled={loading || name === userProfile.name}
            className="px-4 py-2 bg-lime-600 text-white rounded-lg text-sm font-medium hover:bg-lime-700 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Save Changes
          </button>
        </div>
      </form>
    </div>
  );
};
