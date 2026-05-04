import React, { useState } from 'react';
import { Company, Job } from '../../types';
import { CompanyList } from './CompanyList';
import { OntarioCompanies } from '../Ontario/OntarioCompanies';

interface CompaniesHubProps {
  companies: Company[];
  jobs: Job[];
  onSelectCompany: (company: Company) => void;
  onUpdateCompany?: (company: Company) => void;
  enrichingIds?: Set<string>;
  onEnrichmentReset?: () => void;
}

export const CompaniesHub: React.FC<CompaniesHubProps> = ({
  companies,
  jobs,
  onSelectCompany,
  onUpdateCompany,
  enrichingIds,
  onEnrichmentReset,
}) => {
  const [activeTab, setActiveTab] = useState<'crm' | 'imported'>('crm');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('crm')}
          className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${
            activeTab === 'crm'
              ? 'border-lime-500 text-lime-700'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          CRM Companies
        </button>
        <button
          onClick={() => setActiveTab('imported')}
          className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${
            activeTab === 'imported'
              ? 'border-lime-500 text-lime-700'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          Ontario / Quebec
        </button>
      </div>

      {activeTab === 'crm' ? (
        <CompanyList
          companies={companies}
          jobs={jobs}
          onSelectCompany={onSelectCompany}
          onUpdateCompany={onUpdateCompany}
          enrichingIds={enrichingIds}
          onEnrichmentReset={onEnrichmentReset}
        />
      ) : (
        <OntarioCompanies />
      )}
    </div>
  );
};
