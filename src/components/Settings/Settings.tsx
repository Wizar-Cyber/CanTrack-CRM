import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ProfileSettings } from './ProfileSettings';
import { UserManagement } from './UserManagement';
import { User, Users, Bell } from 'lucide-react';

type Tab = 'profile' | 'users' | 'notifications';

export const Settings: React.FC = () => {
  const { userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('profile');

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode; adminOnly?: boolean }> = [
    { id: 'profile',       label: 'Profile',         icon: <User  className="w-4 h-4" /> },
    { id: 'users',         label: 'Team Management', icon: <Users className="w-4 h-4" />, adminOnly: true },
    { id: 'notifications', label: 'Notifications',   icon: <Bell  className="w-4 h-4" /> },
  ];

  const visibleTabs = tabs.filter(t => !t.adminOnly || userProfile?.role === 'admin');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">Settings</h2>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex border-b border-slate-200 overflow-x-auto">
          {visibleTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors border-b-2 whitespace-nowrap
                ${activeTab === tab.id
                  ? 'border-lime-600 text-lime-700 bg-lime-50/50'
                  : 'border-transparent text-slate-600 hover:bg-slate-50'}`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-6 bg-slate-50/50 min-h-[500px]">
          {activeTab === 'profile' && <ProfileSettings />}

          {activeTab === 'users' && userProfile?.role === 'admin' && <UserManagement />}

          {activeTab === 'notifications' && (
            <div className="text-center text-slate-500 py-16">
              <Bell className="w-12 h-12 mx-auto text-slate-300 mb-4" />
              <p className="font-medium text-slate-700 mb-1">Notifications coming soon</p>
              <p className="text-sm text-slate-400">You'll be able to configure email and in-app alerts here.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
