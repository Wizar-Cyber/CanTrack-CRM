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
import { Job, DashboardStats, Candidate, Company } from './types';
import { AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { CandidatesList } from './components/Candidates/CandidatesList';
import { JobsView } from './components/Jobs/JobsView';
import { VisitPlanner } from './components/Visits/VisitPlanner';
import { ToastContainer, useToasts } from './components/UI/Toast';

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
  const [jobsTotal, setJobsTotal] = useState(0);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const { toasts, add: addToast, remove: removeToast } = useToasts();
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [enrichingIds, setEnrichingIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  const refreshCompanies = React.useCallback(() => {
    setRefreshTick(t => t + 1);
  }, []);

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
          const jobsJson = await jobsRes.json();
          const jobsData = Array.isArray(jobsJson) ? jobsJson : (jobsJson.data ?? []);
          if (!Array.isArray(jobsJson)) setJobsTotal(jobsJson.total ?? jobsData.length);
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
          }));

          const formattedCompanies: Company[] = companiesData.map((c: any) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            legalName: c.legal_name,
            industry: c.industry,
            size: c.company_size,
            hqCity: c.hq_city,
            hqProvince: c.hq_province,
            hqCountry: c.hq_country,
            phone: c.phone,
            contactEmail: c.contact_email,
            exactAddress: c.exact_address,
            website: c.website,
            description: c.description,
            knownATSPortal: c.known_ats_portal,
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
  }, [refreshTick]);

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
            setCompanies(prev => prev.map(c => {
              if (c.id !== json.companyId) return c;
              const updated = {
                ...c,
                enrichmentStatus: (json.source === 'db_matched' ? 'db_matched' : 'scraped') as Company['enrichmentStatus'],
                industry: json.data?.industry ?? c.industry,
                sector: json.data?.sector ?? c.sector,
                size: json.data?.company_size ?? c.size,
                hqCity: json.data?.hq_city ?? c.hqCity,
                website: json.data?.website ?? c.website,
                description: json.data?.description ?? c.description,
                isPubliclyTraded: json.data?.is_publicly_traded ?? c.isPubliclyTraded,
                confidenceScore: json.data?.confidence_score ?? c.confidenceScore,
                exactAddress: json.data?.exact_address ?? c.exactAddress,
                hqProvince: json.data?.hq_province ?? c.hqProvince,
                phone: json.data?.phone ?? c.phone,
                contactEmail: json.data?.contact_email ?? c.contactEmail,
                needsManualReview: (json.data?.confidence_score ?? 100) < 60,
                enrichedAt: new Date().toISOString(),
              };
              // Notificación toast
              addToast({
                type: json.source === 'db_matched' ? 'info' : 'success',
                title: `Empresa enriquecida`,
                message: `${updated.name || 'Empresa'} — ${updated.industry || json.source}`,
              });
              return updated;
            }));
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
    totalJobs: jobsTotal || jobs.length,
    activeCandidates: candidates.filter(c => c.status === 'Available').length,
    totalApplications: 0,
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
          <JobsView
            onViewJob={setSelectedJob}
            onSelectCompany={(name) => {
              const company = companies.find(c => c.name === name);
              if (company) setSelectedCompany(company);
              else setSelectedCompany({ id: 'temp', name } as Company);
            }}
          />
        </MainLayout></ProtectedRoute>} />

        <Route path="/candidates" element={<ProtectedRoute><MainLayout>
          <CandidatesList onCandidatesChange={setCandidates} />
        </MainLayout></ProtectedRoute>} />

        <Route path="/companies" element={<ProtectedRoute><MainLayout>
          <CompanyList 
            companies={companies} 
            jobs={jobs} 
            onSelectCompany={setSelectedCompany} 
            onUpdateCompany={handleUpdateCompany}
            enrichingIds={enrichingIds}
            onEnrichmentReset={refreshCompanies}
          />
        </MainLayout></ProtectedRoute>} />

        <Route path="/visits" element={<ProtectedRoute><MainLayout>
          <VisitPlanner companies={companies} onSelectCompany={setSelectedCompany} />
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
          <JobDetail 
            job={selectedJob}
            company={companies.find(c => c.name === selectedJob.companyName || c.id === selectedJob.companyId)}
            candidates={candidates}
            onClose={() => setSelectedJob(null)} 
            onSelectCompany={(name) => {
              const company = companies.find(c => c.name === name);
              if (company) setSelectedCompany(company);
              else setSelectedCompany({ id: 'temp', name } as Company);
            }}
          />
        )}
        {selectedCompany && (
          <CompanyDetail 
            company={selectedCompany} 
            jobs={jobs}
            onClose={() => setSelectedCompany(null)} 
            onViewJob={(job) => {
              setSelectedCompany(null);
              setSelectedJob(job);
            }}
          />
        )}
      </AnimatePresence>

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
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
