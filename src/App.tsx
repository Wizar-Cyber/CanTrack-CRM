/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Sidebar } from './components/Layout/Sidebar';
import { Topbar } from './components/Layout/Topbar';
import { Dashboard } from './components/Dashboard/Dashboard';
import { JobTable } from './components/Jobs/JobTable';
import { JobDetail } from './components/Jobs/JobDetail';
import { CompanyDetail } from './components/Companies/CompanyDetail';
import { MOCK_JOBS, MOCK_CANDIDATES, MOCK_APPLICATIONS, MOCK_COMPANIES } from './mockData';
import { Job, DashboardStats, Candidate, Application, Company } from './types';
import { AnimatePresence } from 'motion/react';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [jobs] = useState<Job[]>(MOCK_JOBS);
  const [candidates] = useState<Candidate[]>(MOCK_CANDIDATES);
  const [applications] = useState<Application[]>(MOCK_APPLICATIONS);
  const [companies] = useState<Company[]>(MOCK_COMPANIES);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);

  const stats: DashboardStats = {
    totalJobs: jobs.length,
    activeCandidates: candidates.filter(c => c.status !== 'Placed').length,
    totalApplications: applications.length,
    placements: candidates.filter(c => c.status === 'Placed').length,
  };

  // Helper to get job details for an application
  const getJobForApplication = (app: Application) => jobs.find(j => j.id === app.jobId)!;
  const getCandidateForApplication = (app: Application) => candidates.find(c => c.id === app.candidateId)!;

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard stats={stats} recentJobs={jobs.slice(0, 4)} onSelectCompany={(name) => {
          const company = companies.find(c => c.name === name);
          if (company) setSelectedCompany(company);
          else setSelectedCompany({ id: 'temp', name } as Company);
        }} />;
      case 'jobs':
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900">Available Vacancies</h2>
              <div className="flex gap-2">
                <button className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
                  Import from CSV
                </button>
                <button className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors shadow-sm">
                  Add New Vacancy
                </button>
              </div>
            </div>
            <JobTable jobs={jobs} onViewJob={setSelectedJob} onSelectCompany={(name) => {
              const company = companies.find(c => c.name === name);
              if (company) setSelectedCompany(company);
              else setSelectedCompany({ id: 'temp', name } as Company);
            }} />
          </div>
        );
      case 'candidates':
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900">Employee Pool</h2>
              <button className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors shadow-sm">
                Add New Employee
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {candidates.map(candidate => (
                <div key={candidate.id} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center border border-slate-200 text-slate-600 font-bold">
                      {candidate.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900">{candidate.name}</h3>
                      <p className="text-xs text-slate-500">{candidate.role}</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-1">
                      {candidate.skills.map(skill => (
                        <span key={skill} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-medium">
                          {skill}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                        candidate.status === 'Available' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
                      }`}>
                        {candidate.status}
                      </span>
                      <button className="text-xs font-medium text-emerald-600 hover:text-emerald-700">View Profile</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      default:
        return (
          <div className="flex flex-col items-center justify-center h-[60vh] text-slate-400">
            <p className="text-lg font-medium">Coming Soon</p>
            <p className="text-sm">This feature is currently under development.</p>
          </div>
        );
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        
        <main className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-7xl mx-auto">
            {renderContent()}
          </div>
        </main>
      </div>

      <AnimatePresence>
        {selectedJob && (
          <>
            <div 
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40"
              onClick={() => setSelectedJob(null)}
            />
            <JobDetail 
              job={selectedJob} 
              onClose={() => setSelectedJob(null)} 
              onSelectCompany={(name) => {
                const company = companies.find(c => c.name === name);
                if (company) setSelectedCompany(company);
                else setSelectedCompany({ id: 'temp', name } as Company);
              }}
            />
          </>
        )}
        {selectedCompany && (
          <>
            <div 
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40"
              onClick={() => setSelectedCompany(null)}
            />
            <CompanyDetail 
              company={selectedCompany} 
              jobs={jobs}
              onClose={() => setSelectedCompany(null)} 
              onViewJob={(job) => {
                setSelectedCompany(null);
                setSelectedJob(job);
              }}
            />
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
