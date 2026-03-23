import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ProfileSettings } from './ProfileSettings';
import { UserManagement } from './UserManagement';
import { User, Users, Bell } from 'lucide-react';

export const Settings: React.FC = () => {
  const { userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'users' | 'notifications'>('profile');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">Settings</h2>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'profile' ? 'border-lime-600 text-lime-700 bg-lime-50/50' : 'border-transparent text-slate-600 hover:bg-slate-50'
            }`}
          >
            <User className="w-4 h-4" />
            Profile
          </button>
          
          {userProfile?.role === 'admin' && (
            <button
              onClick={() => setActiveTab('users')}
              className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors border-b-2 ${
                activeTab === 'users' ? 'border-lime-600 text-lime-700 bg-lime-50/50' : 'border-transparent text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Users className="w-4 h-4" />
              Team Management
            </button>
          )}
          
          <button
            onClick={() => setActiveTab('notifications')}
            className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'notifications' ? 'border-lime-600 text-lime-700 bg-lime-50/50' : 'border-transparent text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Bell className="w-4 h-4" />
            Notifications
          </button>
        </div>

        <div className="p-6 bg-slate-50/50 min-h-[500px]">
          {activeTab === 'profile' && <ProfileSettings />}
          {activeTab === 'users' && userProfile?.role === 'admin' && <UserManagement />}
          {activeTab === 'notifications' && (
            <div className="text-center text-slate-500 py-12">
              <Bell className="w-12 h-12 mx-auto text-slate-300 mb-4" />
              <p>Notification preferences coming soon.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
