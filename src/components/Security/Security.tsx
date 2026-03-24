import React from 'react';
import { ShieldCheck, Lock, EyeOff, FileKey, AlertTriangle } from 'lucide-react';

export const Security = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Security & Intellectual Property</h2>
          <p className="text-sm text-slate-500">Database protection for 16,000 companies</p>
        </div>
        <button className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors shadow-sm">
          Access Audit
        </button>
      </div>

      <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex gap-3 items-start">
        <AlertTriangle className="w-5 h-5 text-rose-600 mt-0.5" />
        <div>
          <h4 className="text-sm font-bold text-rose-900">Active Data Theft Prevention</h4>
          <p className="text-xs text-rose-700 mt-1">
            Bulk exports are disabled for non-admin users. Any unusual download attempt will be reported immediately.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
              <Lock className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-900">Access Control (RBAC)</h3>
          </div>
          <p className="text-sm text-slate-500 mb-4">
            Configure which roles can view, edit, or export company and candidate data.
          </p>
          <div className="space-y-3">
            {['Administrator', 'Sales Agent', 'Recruiter'].map((role) => (
              <div key={role} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-sm font-medium text-slate-700">{role}</span>
                <button className="text-xs font-bold text-emerald-600 hover:text-emerald-700">
                  Edit Permissions
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
              <EyeOff className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-900">Data Masking</h3>
          </div>
          <p className="text-sm text-slate-500 mb-4">
            Hides sensitive information (phones, emails) from unauthorized users until a candidate is assigned.
          </p>
          <div className="space-y-3">
            <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500" defaultChecked />
              <span className="text-sm font-medium text-slate-700">Hide company phone numbers</span>
            </label>
            <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500" defaultChecked />
              <span className="text-sm font-medium text-slate-700">Hide candidate emails</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
