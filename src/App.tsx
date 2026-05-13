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
import { CompanyDetail } from './components/Companies/CompanyDetail';
import { OntarioCompanies } from './components/Ontario/OntarioCompanies';
import { Settings } from './components/Settings/Settings';
import { Job, DashboardStats, Candidate, Company } from './types';
import { AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
// import { ServicesList } from './components/Services/ServicesList'; // hidden
import { JobsView } from './components/Jobs/JobsView';
import CampaignModule from './components/Campaigns/CampaignModule';
// import { ApplicationQueue } from './components/Jobs/ApplicationQueue';
import { RouteManager } from './components/Routes/RouteManager';
import { ToastContainer, useToasts } from './components/UI/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';

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
  const { currentUser } = useAuth();

  const refreshCompanies = React.useCallback(() => {
    setRefreshTick(t => t + 1);
  }, []);

  // Fetch data from real DB — solo cuando el usuario está autenticado
  React.useEffect(() => {
    // No correr si no hay sesión activa
    if (!currentUser) {
      setIsLoading(false);
      return;
    }

    const fetchData = async () => {

      try {
        // 1. Sincronizar vacantes nuevas del scraper antes de cargar datos
        await api('/api/sync/scraped-jobs', { method: 'POST' }).catch(() => {});

        const [jobsRes, companiesRes] = await Promise.all([
          api('/api/jobs'),
          // Fuente de verdad de compañías = Google Sheets (no la BD)
          api('/api/campaigns/sheet-companies')
        ]);

        // Si el token expiró, limpiar y no procesar
        if (jobsRes.status === 401 || companiesRes.status === 401) {
          localStorage.removeItem('token');
          return;
        }

        if (jobsRes.ok && companiesRes.ok) {
          const jobsJson = await jobsRes.json();
          const jobsData = Array.isArray(jobsJson) ? jobsJson : (jobsJson.data ?? []);
          if (!Array.isArray(jobsJson)) setJobsTotal(jobsJson.total ?? jobsData.length);
          const sheetData = await companiesRes.json();
          // sheet-companies devuelve { total, companies: [...] }
          const sheetRows: any[] = sheetData.companies ?? sheetData ?? [];

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
            companyEnrichmentStatus: j.company_enrichment_status,
            companyIndustry: j.company_industry,
            companyHqCity: j.company_hq_city,
            companyHqCountry: j.company_hq_country,
            companyWebsite: j.company_website,
            serviceTypeId: j.service_type_id ?? null,
            serviceName:   j.service_name   ?? null,
            serviceNumber: j.service_number ?? null,
            serviceCategory: j.service_category ?? null,
            titleDisplay:  j.title_display  ?? j.title,
            hasDirectServiceMatch: j.has_direct_service_match ?? false,
          }));

          // Mapear filas del Sheet al tipo Company.
          // Los campos que no existen en el Sheet (industry, website…) se dejan
          // vacíos; si la empresa existe en la BD se rellenan desde el JOIN que
          // el endpoint ya hace (enrichmentStatus, contactEmail, addedToSheetAt).
          const formattedCompanies: Company[] = sheetRows.map((c: any) => ({
            id:               c.companyId   ?? c.empresa,
            name:             c.empresa,
            slug:             c.empresa?.toLowerCase().replace(/[^a-z0-9]/g, '-') ?? '',
            industry:         c.industry    || undefined,
            size:             c.companySize || undefined,
            hqCity:           c.hqCity      || c.ciudad    || undefined,
            hqProvince:       c.hqProvince  || c.provincia || 'QC',
            hqRegion:         c.hqRegion    || c.region    || undefined,
            hqTown:           c.hqTown      || c.pueblo    || undefined,
            hqCountry:        'Canada',
            exactAddress:     c.exactAddress || c.direccion || undefined,
            phone:            c.phone        || undefined,
            contactEmail:     c.email        || undefined,
            website:          c.dominio      || c.website   || undefined,
            description:      c.descripcion  || c.description || undefined,
            knownATSPortal:   c.work         || undefined,
            enrichmentStatus: (c.enrichmentStatus as any)  || undefined,
            enrichedAt:       c.addedToSheetAt || undefined,
            tipo:             c.tipo           || undefined,
            tipoUpdatedAt:    c.tipoUpdatedAt  || undefined,
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
    const interval = setInterval(fetchData, 60000); // cada 60s en lugar de 10s
    return () => clearInterval(interval);
  }, [refreshTick, currentUser]);

  // ── Enrichment Queue: procesa una empresa pending por vez desde el servidor ──
  const enrichmentRunningRef = React.useRef(false);

  React.useEffect(() => {
    const hasPending = companies.some(c => c.enrichmentStatus === 'pending');
    if (!hasPending || enrichmentRunningRef.current) return;

    enrichmentRunningRef.current = true;

    const runQueue = async () => {
      let consecutiveErrors = 0;
      const MAX_CONSECUTIVE_ERRORS = 5;

      while (consecutiveErrors < MAX_CONSECUTIVE_ERRORS) {
        try {
          const res = await api('/api/enrichment/process-next', { method: 'POST' });
          if (!res.ok) {
            consecutiveErrors++;
            await new Promise(r => setTimeout(r, 5000 * consecutiveErrors));
            continue;
          }
          consecutiveErrors = 0;
          const json = await res.json();

          if (json.companyId) {
            setCompanies(prev => prev.map(c => {
              if (c.id !== json.companyId) return c;
              const autoRojo = json.data?.is_closed === true;
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
                tipo: autoRojo ? 'rojo' : c.tipo,
              };
              addToast({
                type: autoRojo ? 'error' : (json.source === 'db_matched' ? 'info' : 'success'),
                title: autoRojo ? `🔴 Closed company detected` : `Company enriched`,
                message: `${updated.name || 'Company'}${autoRojo ? ' — marked as ROJO' : ` — ${updated.industry || json.source}`}`,
              });
              return updated;
            }));
          }

          if (json.done) break;

          await new Promise(r => setTimeout(r, 1500));
        } catch (err) {
          consecutiveErrors++;
          console.warn(`[EnrichmentQueue] Error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`, err);
          await new Promise(r => setTimeout(r, 5000 * consecutiveErrors));
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
    tipoStats: {
      verde:   companies.filter(c => c.tipo === 'verde').length,
      naranja: companies.filter(c => c.tipo === 'naranja').length,
      morado:  companies.filter(c => c.tipo === 'morado').length,
      rojo:    companies.filter(c => c.tipo === 'rojo').length,
      sinTipo: companies.filter(c => !c.tipo).length,
      total:   companies.length,
    },
  };

  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/setup" element={<Setup />} />
        
        <Route path="/" element={<ProtectedRoute><MainLayout><Dashboard stats={stats} /></MainLayout></ProtectedRoute>} />
        
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

        {/* /services hidden — uncomment to restore */}
        <Route path="/visits" element={<Navigate to="/routes" replace />} />

        <Route path="/companies" element={<ProtectedRoute><MainLayout>
          <OntarioCompanies />
        </MainLayout></ProtectedRoute>} />

        <Route path="/campaigns" element={<ProtectedRoute><MainLayout>
          <CampaignModule />
        </MainLayout></ProtectedRoute>} />

        <Route path="/routes" element={<ProtectedRoute><MainLayout>
          <RouteManager />
        </MainLayout></ProtectedRoute>} />

        {/*
        <Route path="/agent" element={<ProtectedRoute><MainLayout>
          <ApplicationQueue />
        </MainLayout></ProtectedRoute>} />
        */}

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
        <ErrorBoundary>
          <AppContent />
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  );
}
