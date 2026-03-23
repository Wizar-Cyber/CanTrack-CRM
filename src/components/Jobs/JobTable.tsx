import React from 'react';
import { Job } from '../../types';
import { StatusBadge, SourceBadge } from '../UI/Badges';
import { ExternalLink, MoreVertical, MapPin, Zap } from 'lucide-react';

interface JobTableProps {
  jobs: Job[];
  onViewJob: (job: Job) => void;
  onSelectCompany?: (name: string) => void;
}

export const JobTable: React.FC<JobTableProps> = ({ jobs, onViewJob, onSelectCompany }) => {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Title & Company</th>
            <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Source</th>
            <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Location</th>
            <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
            <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
            <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {jobs.map((job) => (
            <tr 
              key={job.id} 
              className="hover:bg-slate-50 transition-colors cursor-pointer group"
              onClick={() => onViewJob(job)}
            >
              <td className="px-6 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900 group-hover:text-lime-700 transition-colors">{job.title}</p>
                    {job.isEasyApply && (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded uppercase tracking-wider">
                        <Zap className="w-3 h-3" /> Easy Apply
                      </span>
                    )}
                  </div>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectCompany?.(job.companyName);
                    }}
                    className="text-xs text-slate-500 hover:text-lime-600 transition-colors"
                  >
                    {job.companyName}
                  </button>
                </div>
              </td>
              <td className="px-6 py-4">
                <SourceBadge source={job.source} />
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-1 text-xs text-slate-600">
                  <MapPin className="w-3 h-3" />
                  {job.location} {job.country && <span className="text-slate-400">({job.country})</span>}
                </div>
              </td>
              <td className="px-6 py-4">
                <StatusBadge status={job.status} />
              </td>
              <td className="px-6 py-4 text-xs text-slate-500">
                {job.appliedDate || 'Not applied'}
              </td>
              <td className="px-6 py-4 text-right">
                <div className="flex items-center justify-end gap-2">
                  <a 
                    href={job.url} 
                    target="_blank" 
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="p-1.5 text-slate-400 hover:text-lime-600 hover:bg-lime-50 rounded transition-all"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-all">
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
