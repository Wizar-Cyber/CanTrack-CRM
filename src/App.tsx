import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { api } from './services/apiClient';
import { Login } from './components/Auth/Login';
import { Setup } from './components/Auth/Setup';
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
        // 1. Sincronizar vacantes nuevas del scraper antes de cargar datos
        //    (crea companies + jobs para cualquier scraped_job nuevo)
        await api('/api/sync/scraped-jobs', { method: 'POST' }).catch(() => {});

        const [jobsRes, companiesRes] = await Promise.all([
          api('/api/jobs'),
          api('/api/companies')
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
            postedAt: j.created_at,
            // Datos de la empresa directamente desde el JOIN
            companyEnrichmentStatus: j.company_enrichment_status,
            companyIndustry: j.company_industry,
            companyHqCity: j.company_hq_city,
            companyHqCountry: j.company_hq_country,
            companyWebsite: j.company_website,
            companyConfidenceScore: j.company_confidence_score,
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
            hqCountry: c.hq_country,
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

  // ── Enrichment Queue: procesa una empresa pending por vez desde el servidor ──
  const enrichmentRunningRef = React.useRef(false);

  React.useEffect(() => {
    const hasPending = companies.some(c => c.enrichmentStatus === 'pending');
    if (!hasPending || enrichmentRunningRef.current) return;

    enrichmentRunningRef.current = true;

    const runQueue = async () => {
      while (true) {
        try {
          const res = await api('/api/enrichment/process-next', { method: 'POST' });
          if (!res.ok) break;
          const json = await res.json();

          // Actualizar estado en frontend
          if (json.companyId) {
            setCompanies(prev => prev.map(c => c.id === json.companyId ? {
              ...c,
              enrichmentStatus: json.source === 'db_matched' ? 'db_matched' : 'scraped',
              industry: json.data?.industry ?? c.industry,
              sector: json.data?.sector ?? c.sector,
              size: json.data?.company_size ?? c.size,
              hqCity: json.data?.hq_city ?? c.hqCity,
              website: json.data?.website ?? c.website,
              description: json.data?.description ?? c.description,
              isPubliclyTraded: json.data?.is_publicly_traded ?? c.isPubliclyTraded,
              confidenceScore: json.data?.confidence_score ?? c.confidenceScore,
              needsManualReview: (json.data?.confidence_score ?? 100) < 60,
              enrichedAt: new Date().toISOString(),
            } : c));
          }

          if (json.done) break;

          // Pausa entre llamadas para no saturar la API de Gemini (1.5s)
          await new Promise(r => setTimeout(r, 1500));
        } catch {
          break;
        }
      }
      enrichmentRunningRef.current = false;
    };

    runQueue();
  }, [companies]);

  const handleUpdateCompany = (updatedCompany: Company) => {
    setCompanies(prev => prev.map(c => c.id === updatedCompany.id ? updatedCompany : c));
  };

  const stats: DashboardStats = {
    totalJobs: jobs.length,
    activeCandidates: candidates.filter(c => c.status !== 'Placed').length,
    totalApplications: applications.length,
    placements: candidates.filter(c => c.status === 'Placed').length,
    enrichedCompanies: companies.filter(c => c.enrichmentStatus !== 'pending').length,
  };

  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/setup" element={<Setup />} />
        
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
