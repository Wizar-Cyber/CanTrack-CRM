import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Login } from './components/Auth/Login';
import { Sidebar } from './components/Layout/Sidebar';
import { Topbar } from './components/Layout/Topbar';
import { Dashboard } from './components/Dashboard/Dashboard';
import { JobTable } from './components/Jobs/JobTable';
import { JobDetail } from './components/Jobs/JobDetail';
import { CompanyList } from './components/Companies/CompanyList';
import { CompanyDetail } from './components/Companies/CompanyDetail';
import { Settings } from './components/Settings/Settings';
import { MOCK_JOBS, MOCK_CANDIDATES, MOCK_APPLICATIONS, MOCK_COMPANIES } from './mockData';
import { Job, DashboardStats, Candidate, Application, Company } from './types';
import { AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-lime-600" />
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

const AppContent: React.FC = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [candidates] = useState<Candidate[]>(MOCK_CANDIDATES);
  const [applications] = useState<Application[]>(MOCK_APPLICATIONS);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [enrichingIds, setEnrichingIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  // Fetch data from real DB
  React.useEffect(() => {
    const fetchData = async () => {
      try {
        const [jobsRes, companiesRes] = await Promise.all([
          fetch('/api/jobs'),
          fetch('/api/companies')
        ]);
        
        if (jobsRes.ok && companiesRes.ok) {
          const jobsData = await jobsRes.json();
          const companiesData = await companiesRes.json();
          
          const formattedJobs: Job[] = jobsData.map((j: any) => ({
            id: j.id,
            title: j.title,
            companyId: j.company_id,
            companyName: j.company_name,
            source: j.source,
            url: j.url,
            location: j.location || 'Remote',
            category: j.category || 'Full-time',
            isFavorite: false,
            applicationType: j.application_type || 'External',
            isEasyApply: j.is_easy_apply,
            country: j.country,
            postedAt: j.created_at
          }));

          const formattedCompanies: Company[] = companiesData.map((c: any) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            legalName: c.legal_name,
            industry: c.industry,
            sector: c.sector,
            size: c.company_size,
            isPubliclyTraded: c.is_publicly_traded,
            stockTicker: c.stock_ticker,
            hqCity: c.hq_city,
            hqProvince: c.hq_province,
            exactAddress: c.exact_address,
            website: c.website,
            description: c.description,
            knownATSPortal: c.known_ats_portal,
            confidenceScore: c.confidence_score,
            needsManualReview: c.needs_manual_review,
            enrichmentStatus: c.enrichment_status,
            enrichedAt: c.enriched_at
          }));

          setJobs(formattedJobs);
          setCompanies(formattedCompanies);
        }
      } catch (error) {
        console.error("Error fetching data from DB:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
    // Poll every 10 seconds to check for new scraped jobs
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  // Global Automatic Enrichment Trigger (Now updates real DB)
  React.useEffect(() => {
    const pendingCompanies = companies.filter(c => c.enrichmentStatus === 'pending' && !enrichingIds.has(c.id));
    
    pendingCompanies.forEach(async (company) => {
      // Don't enrich mock auto-generated IDs
      if (company.id.startsWith('auto-')) return;

      setEnrichingIds(prev => new Set(prev).add(company.id));
      
      // Step 1: Search in 12k DB (Simulated)
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Step 2: Web Scraping Fallback (Simulated)
      await new Promise(resolve => setTimeout(resolve, 2000));

      const sizes = ['11-50', '201-500', '1001-5000', '10001+'];
      const randomSize = sizes[Math.floor(Math.random() * sizes.length)];
      const isPublic = Math.random() > 0.5;
      const confidence = 92 + Math.floor(Math.random() * 7);

      // Update in real DB
      try {
        await fetch(`/api/companies/${company.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            enrichment_status: 'scraped',
            industry: 'Technology',
            hq_city: 'Toronto',
            hq_province: 'ON',
            company_size: randomSize,
            is_publicly_traded: isPublic,
            stock_ticker: isPublic ? 'AUTO' : null,
            exact_address: '123 Automated Way, Toronto, ON M5V 2T6, Canada',
            confidence_score: confidence,
            needs_manual_review: false
          })
        });

        // Update in frontend state
        setCompanies(prev => prev.map(c => c.id === company.id ? {
          ...c,
          enrichmentStatus: 'scraped',
          industry: 'Technology',
          hqCity: 'Toronto',
          hqProvince: 'ON',
          size: randomSize,
          isPubliclyTraded: isPublic,
          stockTicker: isPublic ? 'AUTO' : undefined,
          exactAddress: '123 Automated Way, Toronto, ON M5V 2T6, Canada',
          confidenceScore: confidence,
          techStack: ['Python', 'React', 'AWS'],
          needsManualReview: false,
          enrichedAt: new Date().toISOString()
        } : c));
      } catch (e) {
        console.error("Failed to update company in DB", e);
      }
      
      setEnrichingIds(prev => {
        const next = new Set(prev);
        next.delete(company.id);
        return next;
      });
    });
  }, [companies, enrichingIds]);

  const handleUpdateCompany = (updatedCompany: Company) => {
    setCompanies(prev => prev.map(c => c.id === updatedCompany.id ? updatedCompany : c));
  };

  const stats: DashboardStats = {
    totalJobs: jobs.length,
    activeCandidates: candidates.filter(c => c.status !== 'Placed').length,
    totalApplications: applications.length,
    placements: candidates.filter(c => c.status === 'Placed').length,
  };

  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        <Route path="/" element={<ProtectedRoute><MainLayout><Dashboard stats={stats} recentJobs={jobs.slice(0, 4)} onSelectCompany={(name) => {
          const company = companies.find(c => c.name === name);
          if (company) setSelectedCompany(company);
          else setSelectedCompany({ id: 'temp', name } as Company);
        }} /></MainLayout></ProtectedRoute>} />
        
        <Route path="/jobs" element={<ProtectedRoute><MainLayout>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900">Job Board</h2>
              <div className="flex gap-2">
                <button className="px-4 py-2 bg-lime-600 text-white rounded-lg text-sm font-medium hover:bg-lime-700 transition-colors shadow-sm">
                  Import Jobs
                </button>
              </div>
            </div>
            <JobTable jobs={jobs} onViewJob={setSelectedJob} onSelectCompany={(name) => {
              const company = companies.find(c => c.name === name);
              if (company) setSelectedCompany(company);
              else setSelectedCompany({ id: 'temp', name } as Company);
            }} />
          </div>
        </MainLayout></ProtectedRoute>} />

        <Route path="/candidates" element={<ProtectedRoute><MainLayout>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900">Candidates</h2>
              <button className="px-4 py-2 bg-lime-600 text-white rounded-lg text-sm font-medium hover:bg-lime-700 transition-colors shadow-sm">
                Add Candidate
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
                        candidate.status === 'Available' ? 'bg-lime-50 text-lime-700' : 'bg-blue-50 text-blue-700'
                      }`}>
                        {candidate.status}
                      </span>
                      <button className="text-xs font-medium text-lime-600 hover:text-lime-700">View Profile</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </MainLayout></ProtectedRoute>} />

        <Route path="/companies" element={<ProtectedRoute><MainLayout>
          <CompanyList 
            companies={companies} 
            jobs={jobs} 
            onSelectCompany={setSelectedCompany} 
            onUpdateCompany={handleUpdateCompany}
            enrichingIds={enrichingIds}
          />
        </MainLayout></ProtectedRoute>} />

        <Route path="/settings" element={<ProtectedRoute><MainLayout><Settings /></MainLayout></ProtectedRoute>} />
        
        <Route path="*" element={<ProtectedRoute><MainLayout>
          <div className="flex flex-col items-center justify-center h-[60vh] text-slate-400">
            <p className="text-lg font-medium">Coming Soon</p>
            <p className="text-sm">This feature is currently under development.</p>
          </div>
        </MainLayout></ProtectedRoute>} />
      </Routes>

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
    </>
  );
};

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  );
}
