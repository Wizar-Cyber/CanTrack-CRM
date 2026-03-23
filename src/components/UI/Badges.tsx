import React from 'react';
import { JobStatus } from '../../types';

interface BadgeProps {
  status: JobStatus;
}

export const StatusBadge: React.FC<BadgeProps> = ({ status }) => {
  const styles: Record<JobStatus, string> = {
    Saved: 'bg-slate-100 text-slate-700 border-slate-200',
    Applied: 'bg-blue-50 text-blue-700 border-blue-200',
    Interview: 'bg-purple-50 text-purple-700 border-purple-200',
    Offer: 'bg-lime-50 text-lime-700 border-lime-200',
    Rejected: 'bg-rose-50 text-rose-700 border-rose-200',
  };

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[status]}`}>
      {status}
    </span>
  );
};

export const SourceBadge: React.FC<{ source: 'linkedin' | 'indeed' }> = ({ source }) => {
  const styles = {
    linkedin: 'bg-[#0077b5]/10 text-[#0077b5] border-[#0077b5]/20',
    indeed: 'bg-[#2164f3]/10 text-[#2164f3] border-[#2164f3]/20',
  };

  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${styles[source]}`}>
      {source}
    </span>
  );
};
