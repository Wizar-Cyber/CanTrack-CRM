import React, { useState } from 'react';
import { Search, User, Bell } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export const Topbar: React.FC = () => {
  const { userProfile } = useAuth();
  const [showNotifications, setShowNotifications] = useState(false);
  const notifications: any[] = [];
  const unreadCount = 0;

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between sticky top-0 z-10">
      <div className="relative w-96">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search services, clients, or notes..."
          className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-lime-500/20 focus:border-lime-500 transition-all"
        />
      </div>

      <div className="flex items-center gap-6">
        <div className="relative">
          <button 
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full border-2 border-white"></span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <h3 className="font-bold text-slate-900">Notifications</h3>
                <span className="text-xs font-medium text-lime-600 bg-lime-50 px-2 py-0.5 rounded-full">
                  {unreadCount} New
                </span>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-sm">
                    No new notifications
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {notifications.map(notification => (
                      <div key={notification.id} className={`p-4 hover:bg-slate-50 transition-colors cursor-pointer ${!notification.read ? 'bg-lime-50/30' : ''}`}>
                        <p className="text-sm font-medium text-slate-900">{notification.title}</p>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{notification.message}</p>
                        <p className="text-[10px] text-slate-400 mt-2">
                          {new Date(notification.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="p-3 border-t border-slate-100 text-center bg-slate-50">
                <button className="text-xs font-medium text-lime-600 hover:text-lime-700">
                  Mark all as read
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 pl-6 border-l border-slate-200">
          <div className="text-right">
            <p className="text-sm font-medium text-slate-900">{userProfile?.name || 'Loading...'}</p>
            <p className="text-xs text-slate-500 capitalize">{userProfile?.role || 'User'}</p>
          </div>
          <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center border border-slate-200">
            <User className="w-5 h-5 text-slate-600" />
          </div>
        </div>
      </div>
    </header>
  );
};
