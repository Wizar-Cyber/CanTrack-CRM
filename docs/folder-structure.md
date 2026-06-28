# Folder Structure

## Current Structure (as reorganized)

```
project/
│
├── server.ts                          # Entry point: Express + Vite setup
├── package.json                       # Dependencies & scripts
├── tsconfig.json                      # TypeScript configuration
├── vite.config.ts                     # Vite build configuration
├── vitest.config.ts                   # Test configuration
├── index.html                         # SPA entry point
│
├── server/                            # Backend (Express)
│   ├── application/                   # Use cases (application layer)
│   │   ├── auth/                      #   Login, Setup, ChangePassword, etc.
│   │   ├── company/                   #   CreateCompany, EnrichCompany, etc.
│   │   ├── job/                       #   CreateJob, JobUseCases
│   │   ├── candidate/                 #   CandidateUseCases
│   │   ├── apply/                     #   ApplicationUseCases
│   │   └── sync/                      #   SyncScrapedJobs
│   │
│   ├── domain/                        # Domain entities & interfaces
│   │   ├── company/                   #   Company entity + ICompanyRepository
│   │   ├── job/                       #   Job entity + IJobRepository
│   │   ├── user/                      #   User entity + IUserRepository
│   │   ├── candidate/                 #   Candidate entity + ICandidateRepository
│   │   ├── application/              #   Application entity + IApplicationRepository
│   │   └── shared/                    #   DomainError, base types
│   │
│   ├── services/                      # Business services
│   │   ├── enrichment.service.ts      #   AI enrichment orchestrator
│   │   ├── email-campaign.service.ts  #   Email campaign management
│   │   ├── campaign-automation.service.ts
│   │   ├── mdirector.service.ts       #   MDirector API wrapper
│   │   ├── google-sheets.service.ts   #   Google Sheets API wrapper
│   │   ├── gemini.service.ts          #   Gemini AI integration
│   │   ├── groq.service.ts            #   Groq AI integration
│   │   ├── ollama.service.ts          #   Ollama LLM integration
│   │   ├── websearch.service.ts       #   Web search enrichment
│   │   ├── job-classifier.service.ts  #   Job → service classification
│   │   ├── automation.service.ts      #   Playwright automation
│   │   ├── workflow.service.ts        #   Orchestrated workflow
│   │   ├── portal-detector.ts         #   ATS portal detection
│   │   ├── greenhouse.service.ts      #   Greenhouse scraper adapter
│   │   ├── lever.service.ts           #   Lever scraper adapter
│   │   └── providers/                 #   AI provider implementations
│   │       ├── IEnrichmentProvider.ts #     Interface
│   │       ├── ProviderChain.ts       #     Chain-of-responsibility
│   │       ├── GeminProvider.ts       #     Gemini adapter
│   │       ├── GroqProvider.ts        #     Groq adapter
│   │       ├── OllamaProvider.ts      #     Ollama adapter
│   │       ├── WebSearchProvider.ts   #     Web search adapter
│   │       └── index.ts              #     Barrel exports
│   │
│   ├── infrastructure/                # Infrastructure implementations
│   │   └── database/                  #   Database repositories
│   │       ├── BaseRepository.ts      #     Base CRUD operations
│   │       ├── CompanyRepository.ts   #     Companies table
│   │       ├── JobRepository.ts       #     Jobs table
│   │       ├── UserRepository.ts      #     Users table
│   │       ├── CandidateRepository.ts #     Candidates table
│   │       ├── ApplicationRepository.ts
│   │       ├── ProvinceCompanyRepository.ts
│   │       └── index.ts
│   │
│   ├── middleware/                     # Express middleware
│   │   ├── auth.middleware.ts          #   JWT auth + role check
│   │   ├── error.middleware.ts         #   Global error handler
│   │   ├── rate-limit.middleware.ts    #   Rate limiting
│   │   ├── request-id.middleware.ts    #   Request ID generation
│   │   ├── request-logger.middleware.ts
│   │   └── audit-log.middleware.ts     #   Audit trail
│   │
│   ├── routes/                        # Express route handlers
│   │   ├── auth.routes.ts             #   Authentication endpoints
│   │   ├── companies.routes.ts        #   Company CRUD + enrichment
│   │   ├── jobs.routes.ts             #   Job CRUD
│   │   ├── campaign.routes.ts         #   Campaign management
│   │   ├── candidates.routes.ts       #   Candidate CRUD
│   │   ├── applications.routes.ts     #   Application management
│   │   ├── sync.routes.ts             #   Data sync endpoints
│   │   ├── export.routes.ts           #   Excel/Sheets export
│   │   ├── webhook.routes.ts          #   External webhook receiver
│   │   ├── health.routes.ts           #   Health check
│   │   ├── ontario.routes.ts          #   Ontario companies CRUD
│   │   ├── enrichment.routes.ts       #   Enrichment status
│   │   ├── service-templates.routes.ts
│   │   ├── visits.routes.ts           #   Visit route planning
│   │   └── workflow.routes.ts         #   Workflow triggers
│   │
│   ├── automation/                    # Background jobs
│   │   └── cron-jobs.ts               #   All scheduled tasks
│   │
│   ├── data/                          # Static data definitions
│   │   ├── serviceTypes.ts            #   Service type catalog
│   │   └── mdirectorSegments.ts       #   MDirector segment mappings
│   │
│   ├── lib/                           # Shared libraries
│   │   ├── config.ts                  #   Centralized configuration
│   │   ├── logger.ts                  #   Pino structured logger
│   │   └── validation.ts             #   Input validation utilities
│   │
│   └── utils/                         # Utility functions
│       ├── auth-helpers.ts            #   JWT signing, cookie helpers
│       ├── cache.ts                   #   In-memory cache
│       ├── export-helpers.ts          #   Export scheduling
│       ├── geo.ts                     #   Geocoding utilities
│       ├── normalization.ts           #   Text normalization
│       ├── passwordPolicy.ts          #   Password strength rules
│       ├── province-helpers.ts        #   Province detection
│       ├── region-filter.ts           #   Region-based filtering
│       ├── slug.ts                    #   URL slug generation
│       └── table-names.ts             #   Dynamic table name resolution
│
├── src/                               # Frontend (React 19)
│   ├── main.tsx                       # Entry point
│   ├── App.tsx                        # Root component + routing
│   ├── index.css                      # Global styles (Tailwind)
│   ├── types.ts                       # Shared TypeScript types
│   │
│   ├── components/                    # React components by domain
│   │   ├── Auth/                      #   Login, Setup, ChangePassword
│   │   ├── Layout/                    #   Sidebar, Topbar
│   │   ├── Dashboard/                 #   Dashboard stats
│   │   ├── Jobs/                      #   JobTable, JobDetail, JobsView
│   │   ├── Companies/                 #   CompanyList, CompanyDetail, etc.
│   │   ├── Campaigns/                 #   CampaignModule
│   │   ├── Candidates/                #   CandidatesList
│   │   ├── Routes/                    #   RouteManager, GeocodingManager
│   │   ├── Ontario/                   #   OntarioCompanies
│   │   ├── Services/                  #   ServicesList, LetterTemplateModal
│   │   ├── Settings/                  #   Settings, UserManagement, etc.
│   │   ├── Security/                  #   Security page
│   │   ├── Visits/                    #   VisitPlanner
│   │   ├── Integrations/              #   Integrations page
│   │   ├── VoiceAgent/                #   VoiceAgent UI
│   │   ├── Profiles/                  #   ProfilesList
│   │   ├── UI/                        #   Badges, Toast, TipoSelector, LogoIcon
│   │   └── ErrorBoundary.tsx          #   Error boundary
│   │
│   ├── contexts/                      # React contexts
│   │   └── AuthContext.tsx            #   Authentication state
│   │
│   ├── services/                      # Frontend services
│   │   ├── apiClient.ts              #   HTTP client with auth
│   │   ├── geminiService.ts          #   Gemini API integration
│   │   └── mappingService.ts         #   Data mapping utilities
│   │
│   ├── data/                          # Static data
│   │   └── employeeTypes.ts
│   │
│   └── utils/                         # Utility functions
│       └── tipo.ts                    #   Tipo classification helpers
│
├── db/                                # Database
│   ├── schema.sql                     # Full schema definition
│   ├── seed.sql                       # Seed data
│   └── migrations/                    # Incremental SQL migrations
│       ├── 003_triggers_and_indexes.sql
│       ├── 004_normalize_addresses.sql
│       ├── 005_fix_address_assignments.sql
│       └── 006_fulltext_indexes.sql
│
├── scripts/                           # CLI utilities
│   ├── init-db.mjs                    # Database initialization
│   ├── check-db.mjs                   # DB connection test
│   ├── enrich-companies.ts            # Manual enrichment trigger
│   ├── export-to-excel.ts             # Excel export script
│   ├── export-to-sheets.ts            # Google Sheets export
│   ├── deploy-vps.sh                  # VPS deployment
│   └── ... (30+ utility scripts)
│
├── docs/                              # Documentation
│   ├── architecture/                  #   Architecture docs
│   ├── diagrams/                      #   Mermaid diagrams
│   └── guides/                        #   Developer guides
│
├── public/                            # Static assets
│   └── logo.jpg
│
├── Optimus_rutas/                     # Route optimization microservice
│   ├── app/                           # Python FastAPI application
│   │   ├── main.py                    #   Entry point
│   │   ├── models/                    #   Pydantic models
│   │   ├── routes/                    #   API endpoints
│   │   ├── services/                  #   Business logic
│   │   ├── repositories/             #   Data access
│   │   ├── controllers/              #   Dependency injection
│   │   └── utils/                     #   Config, DB, logger
│   ├── alembic/                       #   Database migrations
│   ├── frontend/                      #   Simple web UI
│   ├── Dockerfile
│   └── requirements.txt
│
├── docker-compose.yml                 # Multi-service orchestration
├── Dockerfile                         # CanTrack CRM container
├── nginx.conf                         # Reverse proxy configuration
└── tunnel.py                          # SSH port forwarding utility
```

## Module Responsibility Summary

| Directory | Responsibility |
|---|---|
| `server/application/` | Use cases — orchestrate domain + infrastructure |
| `server/domain/` | Business entities, repository interfaces, pure logic |
| `server/services/` | External integrations, AI providers, business services |
| `server/infrastructure/` | Database implementations, external I/O |
| `server/middleware/` | Cross-cutting HTTP concerns |
| `server/routes/` | HTTP endpoint definitions |
| `server/automation/` | Background scheduled tasks |
| `server/data/` | Static configuration data |
| `server/lib/` | Shared infrastructure (config, logger, validation) |
| `server/utils/` | Pure utility functions |
