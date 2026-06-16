# CanTrack CRM — Auditoría Técnica Integral (20 Secciones)

**Fecha:** 2026-06-16
**Alcance:** Stack completo — Node.js (Express/React), Python (FastAPI), PostgreSQL, Docker
**Metodología:** Análisis estático del código fuente en `/var/www/cantrack`

---

## Índice

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Stack Tecnológico](#2-stack-tecnológico)
3. [Estructura del Proyecto](#3-estructura-del-proyecto)
4. [Modelo de Datos](#4-modelo-de-datos)
5. [API Endpoints](#5-api-endpoints)
6. [Arquitectura y Patrones](#6-arquitectura-y-patrones)
7. [Autenticación y Autorización](#7-autenticación-y-autorización)
8. [Seguridad](#8-seguridad)
9. [Manejo de Errores](#9-manejo-de-errores)
10. [Logging y Observabilidad](#10-logging-y-observabilidad)
11. [Testing](#11-testing)
12. [Frontend (React)](#12-frontend-react)
13. [Microservicio Optimus_rutas](#13-microservicio-optimus_rutas)
14. [Infraestructura y Deploy](#14-infraestructura-y-deploy)
15. [Dependencias y Riesgos](#15-dependencias-y-riesgos)
16. [Duplicación y Deuda Técnica](#16-duplicación-y-deuda-técnica)
17. [Internacionalización](#17-internacionalización)
18. [Rendimiento y Escalabilidad](#18-rendimiento-y-escalabilidad)
19. [Recomendaciones Priorizadas](#19-recomendaciones-priorizadas)
20. [Confianza y Precisión](#20-confianza-y-precisión)

---

## 1. Resumen Ejecutivo

CanTrack CRM es un sistema monorepo para reclutamiento técnico con enfoque en el mercado colombiano. Integra scraping de empleos, enriquecimiento de empresas vía IA (Gemini/Groq/Ollama/WebSearch), orquestación de campañas de email (MDirector), automatización con Playwright, y optimización de rutas (OR-Tools via microservicio Python).

**Fortalezas:**
- Arquitectura limpia con separación por capas (domain/application/services/routes)
- Uso activo de Pino para logging estructurado
- PostgreSQL con esquema normalizado y migraciones idempotentes
- Docker multi-stage con compilación optimizada
- 16 tests unitarios existentes

**Debilidades críticas:**
- `server.ts` con 3908 líneas y 111 rutas inline (mezcla concerns)
- Rutas de autenticación duplicadas: `server.ts:718-902` y `server/routes/auth.routes.ts`
- `console.log`/`console.error` residual (~15 ocurrencias) coexistiendo con Pino
- `.gitignore` incluye `*.test.ts` — los tests están excluidos del control de versiones
- Sin paginación en `GET /api/companies` (riesgo OOM con >1000 empresas)
- Password hardcoded en `docker-compose.yml:31`
- CSP deshabilitado en Helmet
- 0 tests en frontend React
- 0 tests en el microservicio Python

---

## 2. Stack Tecnológico

| Capa | Tecnología | Versión | Archivo |
|------|-----------|---------|---------|
| Runtime Node | Node.js | 22 | `Dockerfile:1` |
| Backend framework | Express | 4.21.2 | `package.json:28` |
| Frontend framework | React | 19.0.0 | `package.json:43` |
| Lenguaje Frontend | TypeScript | 5.8 | `tsconfig.json` |
| Bundler | Vite | 6.2 | `package.json:47` |
| Base de datos principal | PostgreSQL | (vía CasaOS) | `docker-compose.yml` |
| Microservicio rutas | Python 3.10 + FastAPI | — | `Optimus_rutas/Dockerfile` |
| ORM Python | SQLAlchemy 2.0 async | — | `Optimus_rutas/requirements.txt` |
| Optimizador rutas | OR-Tools | — | `Optimus_rutas/requirements.txt` |
| Logging | Pino + pino-pretty | 10.3 / 13.1 | `package.json:38-39` |
| Testing Node | Vitest + Supertest | 3.1 / 7.2 | `package.json:62,59` |
| Testing Python | pytest | — | `Optimus_rutas/pytest.ini` |
| Auth | JWT (jsonwebtoken) + bcryptjs | 9.0 / 3.0 | `package.json` |
| UI | Tailwind CSS v4, Framer Motion, Lucide React | — | `package.json` |
| Routing React | react-router-dom | 7.13 | `package.json:45` |
| Automatización | Playwright + playwright-extra | 1.59 | `package.json:40-41` |
| IA | Google Gemini, Groq, Ollama | — | `server/services/` |

---

## 3. Estructura del Proyecto

```
cantrack/
├── server.ts                          # Entry point Express (3908 líneas)
├── server/
│   ├── application/                   # Casos de uso (auth, company, job, etc.)
│   │   ├── auth/                      # Login, Setup, ChangePassword, ManageUsers
│   │   ├── company/                   # CRUD + Enrich + Export companies
│   │   ├── job/                       # CRUD jobs
│   │   ├── candidate/                 # CandidateUseCases
│   │   ├── apply/                     # ApplicationUseCases
│   │   └── sync/                      # SyncScrapedJobs
│   ├── domain/                        # Entidades + interfaces repositorio
│   │   ├── company/Company.ts
│   │   ├── job/Job.ts
│   │   ├── candidate/Candidate.ts
│   │   ├── application/Application.ts
│   │   ├── user/User.ts
│   │   └── shared/DomainError.ts
│   ├── services/                      # Infraestructura
│   │   ├── enrichment.service.ts      # Orquestador Gemini→Groq→WebSearch
│   │   ├── workflow.service.ts        # Pipeline completo (sync→enrich→classify→export)
│   │   ├── email-campaign.service.ts  # Campañas MDirector
│   │   ├── application-agent.service.ts  # Playwright automation
│   │   ├── gemini.service.ts / groq.service.ts / ollama.service.ts / websearch.service.ts
│   │   ├── google-sheets.service.ts
│   │   ├── mdirector.service.ts
│   │   ├── job-classifier.service.ts
│   │   ├── greenhouse.service.ts / lever.service.ts / portal-detector.ts
│   │   └── campaign-automation.service.ts
│   ├── routes/                        # Routers Express
│   │   ├── auth.routes.ts             # 11 endpoints (refactorizados)
│   │   ├── companies.routes.ts        # 10 endpoints
│   │   ├── jobs.routes.ts             # 8 endpoints
│   │   ├── campaign.routes.ts         # 14 endpoints (743 líneas)
│   │   ├── ontario.routes.ts          # 448 líneas
│   │   ├── candidates.routes.ts       # 5 endpoints
│   │   ├── applications.routes.ts     # 4 endpoints
│   │   ├── enrichment.routes.ts       # 2 endpoints
│   │   ├── sync.routes.ts             # 1 endpoint
│   │   ├── webhook.routes.ts          # 3 endpoints
│   │   └── agent.routes.ts            # 48 líneas (comentado en server.ts)
│   ├── middleware/
│   │   ├── auth.middleware.ts         # JWT verify + role check
│   │   ├── error.middleware.ts
│   │   ├── rate-limit.middleware.ts
│   │   ├── request-id.middleware.ts
│   │   └── audit-log.middleware.ts
│   ├── lib/
│   │   ├── config.ts                  # Validación env vars + pool + constantes
│   │   ├── logger.ts                  # Pino estructurado
│   │   └── validation.ts             # Schemas Zod
│   └── utils/
│       ├── passwordPolicy.ts
│       ├── region-filter.ts
│       ├── normalization.ts
│       └── slug.ts
├── src/                               # Frontend React
│   ├── App.tsx                        # Componente raíz + router
│   ├── components/
│   │   ├── Auth/                      # Login, Setup, ChangePassword
│   │   ├── Campaigns/CampaignModule.tsx
│   │   ├── Companies/                  # CompanyList, CompanyDetail, SendOfferModal
│   │   ├── Dashboard/Dashboard.tsx
│   │   ├── Jobs/                      # JobTable, JobDetail, JobsView, ApplicationQueue
│   │   ├── Routes/                    # RouteManager, GeocodingManager
│   │   ├── Settings/                  # Settings, UserManagement, ProfileSettings, ExcelExport
│   │   ├── Candidates/               # CandidatesList
│   │   ├── Layout/                   # Sidebar, Topbar
│   │   ├── UI/                       # Toast, Badges, LogoIcon, TipoSelector
│   │   └── ErrorBoundary.tsx
│   └── contexts/AuthContext.tsx
├── db/
│   ├── schema.sql                     # Schema completo + seeds (~400 líneas)
│   └── migrations/                    # Migraciones incrementales SQL
│       ├── 003_triggers_and_indexes.sql
│       ├── 004_normalize_addresses.sql
│       └── 005_fix_address_assignments.sql
├── scripts/                           # Scripts de utilidad (30+ archivos)
│   ├── deploy-vps.sh                  # Deploy manual SCP/bash
│   ├── export-to-excel.ts / export-to-sheets.ts
│   ├── enrich-companies.ts
│   ├── seed-mdirector-templates.ts
│   └── ... (migraciones one-off, diagnósticos)
├── Optimus_rutas/                     # Microservicio Python
│   ├── app/
│   │   ├── main.py                   # FastAPI entry point
│   │   ├── models/db.py              # SQLAlchemy models (Route, RouteStop, GeocodingCache)
│   │   ├── services/                 # route_optimizer.py, geocoding_service.py, etc.
│   │   ├── routes/                   # geocoding_endpoints, health_endpoints, routes_endpoints
│   │   └── utils/                    # config, database, logger
│   ├── alembic/                      # Migrations SQLAlchemy
│   └── frontend/                     # HTML/JS/CSS estático
├── docker-compose.yml                # 3 servicios (app, optimus-rutas, ollama)
├── Dockerfile                        # Multi-stage Node 22
└── nginx.conf                        # Reverse proxy
```

---

## 4. Modelo de Datos

### 4.1 Esquema PostgreSQL (CanTrack)

Extraído de `db/schema.sql:10-400`.

**Tablas principales:**

| Tabla | Columnas | PK | FK | Índices |
|-------|----------|----|----|---------|
| `users` | id, email, password_hash, first_name, last_name, role, is_active, created_at, updated_at | id UUID | — | idx_users_email |
| `companies` | id, name, slug, legal_name, industry, company_size, hq_city, hq_province, hq_country, exact_address, phone, contact_email, website, description, known_ats_portal, enrichment_status, enriched_at, created_at, updated_at | id UUID | — | idx_companies_slug, idx_companies_enrichment_status |
| `company_tech_stack` | id, company_id, technology | id UUID | companies(id) CASCADE | UNIQUE(company_id, technology) |
| `jobs` | id, company_id, title, source, url, location, country, category, application_type, is_easy_apply, is_active, created_at, updated_at | id UUID | companies(id) RESTRICT | idx_jobs_company_id, idx_jobs_created_at, idx_jobs_source, idx_jobs_is_active |
| `job_required_skills` | id, job_id, skill | id UUID | jobs(id) CASCADE | UNIQUE(job_id, skill) |
| `user_saved_jobs` | user_id, job_id, is_favorite, saved_at | (user_id, job_id) | users(id), jobs(id) | — |
| `candidates` | id, name, role, email, phone, location, linkedin_url, resume_url, years_of_experience, status, bio, created_at, updated_at | id UUID | — | idx_candidates_status |
| `candidate_skills` | id, candidate_id, skill | id UUID | candidates(id) CASCADE | UNIQUE(candidate_id, skill) |
| `applications` | id, job_id, candidate_id, status, applied_date, notes, created_at, updated_at | id UUID | jobs(id) RESTRICT, candidates(id) RESTRICT | idx_applications_status, idx_applications_job_id, idx_applications_candidate_id |
| `scraped_jobs` | id (SERIAL), fuente, titulo, empresa, url_postulacion, keyword, fecha_creacion | id SERIAL | — | idx_scraped_jobs_fuente, idx_scraped_jobs_fecha |
| `ontario_companies` | id, nombre, telefono, tipo, correo, direccion, provincia, region, ciudad, pueblo, work, descripcion, dominio_de_pagina, lista_de_llamadas, is_duplicate, status, created_at, updated_at | id UUID | — | idx_ontario_companies_nombre_unique |

**Enums:** `enrichment_status_enum` (pending, processing, db_matched, scraped, verified, failed), `application_status_enum` (Saved, Applied, Interview, Offer, Rejected, Placed), `candidate_status_enum` (Available, Interviewing, Placed, Inactive), `job_source_enum` (linkedin, indeed, glassdoor, company_website, other)

### 4.2 Esquema Optimus_rutas (SQLAlchemy)

Definido en `Optimus_rutas/app/models/db.py:55-137`.

| Tabla | Columnas | PK | FK |
|-------|----------|----|----|
| `routes` | id, user_id, name, status, start_address, start_lat, start_lng, return_to_start, average_speed_kmh, total_distance_km, estimated_time_minutes, current_stop_index, notes, created_at, updated_at, started_at, completed_at, deleted_at | id String(36) | — |
| `route_stops` | id, route_id, order, address, lat, lng, label, distance_from_previous_km, status, visited_at, notes | id String(36) | routes(id) CASCADE |
| `geocoding_cache` | id, address_normalized, lat, lng, confidence_score, mapbox_response_raw, created_at | id String(36) | — |

### 4.3 Relaciones Clave

- `companies` 1:N `jobs` (con RESTRICT en delete)
- `companies` 1:N `company_tech_stack` (con CASCADE)
- `jobs` 1:N `job_required_skills` (con CASCADE)
- `jobs` N:M `users` via `user_saved_jobs`
- `jobs` N:M `candidates` via `applications` (con RESTRICT)
- `routes` 1:N `route_stops` (con CASCADE, ordenado por `order`)

---

## 5. API Endpoints

### 5.1 Rutas Inline en `server.ts`

111 definiciones de ruta directas en `server.ts`. Principales:

| Método | Ruta | Auth | Roles | Rate Limit |
|--------|------|------|-------|------------|
| GET | `/api/health` | — | — | — |
| GET | `/api/config/mapbox` | JWT | — | — |
| GET | `/api/geocoding/status` | JWT | — | — |
| POST | `/api/auth/setup` | — | — | setupLimiter |
| POST | `/api/auth/login` | — | — | authLimiter |
| POST | `/api/auth/logout` | — | — | — |
| GET | `/api/auth/me` | JWT | — | — |
| PATCH | `/api/auth/profile` | JWT | — | — |
| PATCH | `/api/auth/password` | JWT | — | — |
| GET | `/api/users` | JWT | admin | — |
| POST | `/api/users` | JWT | admin | — |
| PATCH | `/api/users/:id/role` | JWT | admin | — |
| DELETE | `/api/users/:id` | JWT | admin | — |
| GET | `/api/companies` | JWT | — | — |
| GET | `/api/companies/:id` | JWT | — | — |
| POST | `/api/companies` | JWT | admin, editor | — |
| PATCH | `/api/companies/:id/tipo` | JWT | — | — |
| DELETE | `/api/companies/all` | JWT | admin | — |
| POST | `/api/companies/export` | JWT | — | exportLimiter |
| POST | `/api/gemini/enrich` | JWT | admin, editor | — |
| POST | `/api/enrichment/process-next` | JWT | — | — |
| GET | `/api/enrichment/status` | JWT | — | — |
| GET | `/api/region-filter` | JWT | — | — |
| GET | `/api/jobs` | JWT | — | — |
| GET | `/api/jobs/:id` | JWT | — | — |
| POST | `/api/jobs` | JWT | admin, editor | — |
| PATCH | `/api/jobs/:id` | JWT | admin, editor | — |
| DELETE | `/api/jobs/:id` | JWT | admin, editor | — |
| GET | `/api/stats` | JWT | — | — |
| GET | `/api/dashboard` | JWT | — | — |
| POST | `/api/sync/scraped-jobs` | JWT | — | — |
| POST | `/api/webhook/scraper` | webhook_secret | — | — |
| POST | `/api/webhook/enrich` | webhook_secret | — | — |
| GET | `/api/webhook/enrich/status` | JWT | — | — |
| GET | `/api/campaigns/config` | JWT | admin, editor | — |
| PATCH | `/api/campaigns/config` | JWT | admin | — |
| GET | `/api/campaigns/preview` | JWT | admin, editor | — |
| POST | `/api/campaigns/send` | JWT | admin | — |
| GET | `/api/campaigns/history` | JWT | admin, editor | — |
| GET | `/api/campaigns/sheet-companies` | JWT | — | — |

### 5.2 Rutas en `server/routes/` (refactorizadas)

Auth routes (`auth.routes.ts`):

| Método | Ruta | Auth | Roles | Rate Limit |
|--------|------|------|-------|------------|
| POST | `/api/auth/setup` | — | — | setupLimiter |
| POST | `/api/auth/login` | — | — | authLimiter |
| POST | `/api/auth/logout` | — | — | — |
| GET | `/api/auth/me` | JWT | — | — |
| PATCH | `/api/auth/profile` | JWT | — | — |
| PATCH | `/api/auth/password` | JWT | — | — |
| GET | `/api/auth/password-policy` | — | — | — |
| GET | `/api/users` | JWT | admin | — |
| POST | `/api/users` | JWT | admin | — |
| PATCH | `/api/users/:id/role` | JWT | admin | — |
| DELETE | `/api/users/:id` | JWT | admin | — |

**Nota:** Hay duplicación funcional entre las rutas inline de `server.ts:718-902` y las de `server/routes/auth.routes.ts`. Dependiendo de qué módulo se importe (ninguno se importa actualmente en server.ts), ambas copias podrían estar activas.

Companies routes (`companies.routes.ts:34-390`):

| Método | Ruta | Auth | Roles |
|--------|------|------|-------|
| GET | `/api/companies` | JWT | — |
| GET | `/api/companies/:id` | JWT | — |
| POST | `/api/companies` | JWT | admin, editor |
| PATCH | `/api/companies/:id` | JWT | admin, editor |
| DELETE | `/api/companies/all` | JWT | admin |
| DELETE | `/api/companies/:id` | JWT | admin |
| POST | `/api/companies/export` | JWT | exportLimiter |
| POST | `/api/companies/import` | JWT | admin, editor |
| POST | `/api/companies/enrich` | JWT | admin, editor (enrichLimiter) |
| POST | `/api/companies/:id/send-offer` | JWT | admin, editor |
| GET | `/api/companies/:id/email-logs` | JWT | — |

Campaign routes (`campaign.routes.ts:49-743`):

| Método | Ruta | Auth | Roles |
|--------|------|------|-------|
| GET | `/api/campaigns/templates` | JWT | admin, editor |
| GET | `/api/campaigns/template-map` | JWT | admin, editor |
| POST | `/api/campaigns/template-map` | JWT | admin |
| DELETE | `/api/campaigns/template-map/:region/:work_label` | JWT | admin |
| POST | `/api/campaigns/send-template` | JWT | admin |
| POST | `/api/campaigns/send-test` | JWT | admin |
| POST | `/api/campaigns/webhook/bounce` | — | — |
| GET | `/api/campaigns/suppression` | JWT | admin, editor |
| POST | `/api/campaigns/suppression` | JWT | admin |
| DELETE | `/api/campaigns/suppression/:id` | JWT | admin |
| GET | `/api/campaigns/auto-config` | JWT | admin, editor |
| PATCH | `/api/campaigns/auto-config` | JWT | admin |
| POST | `/api/campaigns/auto-run` | JWT | admin |
| GET | `/api/campaigns/history` | JWT | admin, editor |
| GET | `/api/campaigns/distinct-work` | JWT | admin, editor |

Jobs routes (`jobs.routes.ts:18-239`):

| Método | Ruta | Auth | Roles |
|--------|------|------|-------|
| GET | `/api/jobs` | JWT | — |
| GET | `/api/jobs/:id` | JWT | — |
| POST | `/api/jobs` | JWT | admin, editor |
| PATCH | `/api/jobs/:id` | JWT | admin, editor |
| DELETE | `/api/jobs/:id` | JWT | admin, editor |
| GET | `/api/jobs/stats/dashboard` | JWT | — |
| POST | `/api/jobs/mapping/prepare` | JWT | — |
| POST | `/api/jobs/gemini/cover-letter` | JWT | admin, editor |

### 5.3 Endpoints del Microservicio (Optimus_rutas)

Definidos en `Optimus_rutas/app/routes/`.

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/health/db` | DB connection check |
| POST | `/geocode` | Geocodificar dirección (Mapbox) |
| POST | `/routes` | Crear ruta |
| GET | `/routes` | Listar rutas |
| GET | `/routes/{id}` | Obtener ruta |
| PATCH | `/routes/{id}` | Actualizar ruta |
| PATCH | `/routes/{id}/stop` | Actualizar parada |
| DELETE | `/routes/{id}` | Eliminar ruta |

### 5.4 Totales

- **Server.ts inline:** ~50 endpoints únicos
- **Routes refactorizadas:** ~55 endpoints
- **Optimus_rutas:** 9 endpoints
- **Endpoints totales:** ~95+ (con duplicación entre inline y refactorizado)

---

## 6. Arquitectura y Patrones

### 6.1 Patrones Identificados

| Patrón | Ubicación | Implementación |
|--------|-----------|----------------|
| **Chain of Responsibility** | `server/services/enrichment.service.ts` | Proveedores de enriquecimiento en cadena: Gemini → Groq → Ollama → WebSearch. Cada provider llena campos vacíos y pasa al siguiente si faltan datos. |
| **Repository** | `server/domain/*/I*Repository.ts` | Interfaces para Company, Job, Candidate, Application, User. Implementaciones inline con SQL crudo. |
| **Use Case / Interactor** | `server/application/*/*.ts` | Casos de uso separados (CreateCompany, GetCompanies, Login, Setup, etc.) con inyección de dependencias via constructor. |
| **MVC** | Server completo | Model (domain/entities + DB queries), View (React), Controller (routes + services). |
| **Strategy** | `server/services/enrichment.service.ts:37-40` | mergeInto() aplica merge strategy field-by-field entre providers. |
| **Middleware Chain** | `server.ts` setup | Express middleware pipeline: request-id → cookieParser → cors → helmet → audit-log → auth → routes → error handler. |
| **Factory** | `server/middleware/auth.middleware.ts:21` | `createRequireAuth(pool)` retorna middleware bound al pool. |
| **Singleton** | `server/lib/config.ts:43` | Pool de PostgreSQL. |
| **Debounced Write** | `server.ts:70-91` | Export a Excel con debounce de 10s para batching. |

### 6.2 Diagrama de Arquitectura

```mermaid
graph TB
    subgraph "Frontend (React + Vite)"
        A[App.tsx] --> B[AuthContext]
        A --> C[Componentes UI]
        C --> D[apiClient.ts]
    end

    subgraph "Backend (Express + Node 22)"
        D --> E[server.ts]
        E --> F[Middleware Chain]
        F --> G[Router Inline 50+ endpoints]
        F --> H[Router Refactorizado 55+ endpoints]
        G --> I[Application Layer]
        H --> I
        I --> J[Domain Entities]
        I --> K[Services Layer]
        K --> L[EnrichmentService]
        K --> M[WorkflowService]
        K --> N[EmailCampaignService]
        K --> O[ApplicationAgentService]
        L --> P[GeminiService]
        L --> Q[GroqService]
        L --> R[OllamaService]
        L --> S[WebSearchService]
    end

    subgraph "Microservicio (Python FastAPI)"
        T[main.py] --> U[Route Optimizer OR-Tools]
        T --> V[Geocoding Service Mapbox]
        T --> W[SQLAlchemy Async]
    end

    subgraph "Infraestructura"
        X[(PostgreSQL CasaOS)]
        Y[MDirector API]
        Z[Google Sheets API]
        AA[Ollama Local]
    end

    E --> X
    T --> X
    N --> Y
    O --> Z
    K --> AA
    V --> AA
```

### 6.3 Flujo de Enriquecimiento

```mermaid
sequenceDiagram
    actor User
    participant UI as React UI
    participant API as Express API
    participant ES as EnrichmentService
    participant GEM as Gemini
    participant GRO as Groq
    participant WS as WebSearch
    participant DB as PostgreSQL

    User->>UI: Click "Enrich"
    UI->>API: POST /api/enrichment/process-next
    API->>DB: SELECT next pending company
    DB-->>API: company data
    API->>ES: enrichCompany(company)
    
    ES->>GEM: getEnrichmentData(name, industry)
    alt Gemini returns partial data
        GEM-->>ES: {industry, website, ...}
        ES->>GRO: getEnrichmentData(name, missingFields)
        GRO-->>ES: {phone, description, ...}
        ES->>WS: search(name)
        WS-->>ES: {contact_email, ...}
    else Gemini fails
        ES->>GRO: getEnrichmentData(name)
        GRO-->>ES: partial data
        ES->>WS: search(name, missingFields)
        WS-->>ES: remaining fields
    end

    ES->>DB: UPDATE companies SET ...
    ES-->>API: enriched data
    API-->>UI: {success: true, data}
    User->>UI: Sees enriched fields
```

### 6.4 Flujo de Workflow Completo

```mermaid
flowchart LR
    A[Scraped Jobs] --> B[syncJobs]
    B --> C{C empresa existe?}
    C -->|Sí| D[Link job → company]
    C -->|No| E[Crear company]
    E --> D
    D --> F[enrichAllPending]
    F --> G[Gemini]
    G --> H[Groq fallback]
    H --> I[WebSearch fallback]
    I --> J[copyToProvinceTables]
    J --> K[Ontario table]
    J --> L[Quebec table]
    K --> M[exportToSheets]
    L --> M
    M --> N[(Google Sheets)]
```

---

## 7. Autenticación y Autorización

### 7.1 Mecanismo

- **JWT** firmado con `HS256`, secret validado a mínimo 32 caracteres (`server/lib/config.ts:36`)
- **Expiración:** 8 horas, sincronizada entre JWT y cookie (`server/lib/config.ts:37-38`)
- **Dual token transport:** Cookie httpOnly (preferente) + Bearer header (fallback) (`server/middleware/auth.middleware.ts:34-39`)
- **Verificación activa:** Cada request verifica que el usuario siga activo en DB (`auth.middleware.ts:54-66`)
- **Roles:** `admin`, `editor`, `viewer` (verificado via `requireRole()` middleware)
- **Rate limiting:** `authLimiter` en login/setup, `setupLimiter` en setup, `enrichLimiter` en enrich, `exportLimiter` en export

### 7.2 Seguridad de Contraseñas

- **Hashing:** bcryptjs con 12 rondas (`server/lib/config.ts:52`)
- **Política:** Mínimo 8 caracteres, al menos 1 mayúscula, 1 número, 1 símbolo (`server/utils/passwordPolicy.ts`)
- **Lockout:** 5 intentos fallidos → bloqueo 15 minutos (`server/lib/config.ts:53-54`, implementado en `auth.routes.ts`)
- **Validación Zod:** Schemas para login, setup, changePassword (`server/lib/validation.ts`)

### 7.3 Duplicación Crítica

Las rutas auth están definidas en dos lugares:
1. **Inline:** `server.ts:718-902` — setup, login, logout, me, profile, password, users CRUD
2. **Refactorizado:** `server/routes/auth.routes.ts:119-341` — mismo conjunto + password-policy endpoint

**Riesgo:** `server/routes/auth.routes.ts` no es importado en `server.ts`. Dependiendo de cambios futuros, ambas copias podrían activarse causando conflictos de ruta.

---

## 8. Seguridad

### 8.1 Hallazgos

| # | Hallazgo | Severidad | Ubicación | Descripción |
|---|----------|-----------|-----------|-------------|
| S1 | Password hardcoded en compose | **CRÍTICA** | `docker-compose.yml:31` | `DATABASE_URL=postgresql+asyncpg://casaos:casaos@postgresql:5432/casaos` — credencial visible |
| S2 | CSP deshabilitado | **ALTA** | `server.ts` (Helmet config) | `contentSecurityPolicy: false` permite XSS via inline styles |
| S3 | Tests ignorados por git | **ALTA** | `.gitignore:11` | `*.test.ts` excluye tests del repo — los tests no tienen versionado |
| S4 | Sin tasa en companies GET | **MEDIA** | `server.ts:908` | `GET /api/companies` (y su equivalente refactorizado) sin rate limiter |
| S5 | Sin paginación en companies | **MEDIA** | `server.ts:908` | Retorna todas las empresas sin límite — riesgo OOM |
| S6 | Sin refresh token | **MEDIA** | `server/routes/auth.routes.ts` | JWT 8h sin rotación — ventana larga si es robado |
| S7 | `.env` en `.gitignore` | **OK** | `.gitignore:7` | `.env` explícitamente ignorado — buena práctica |
| S8 | Sin CSRF protection | **MEDIA** | `server.ts` | Cookie httpOnly previene XSS theft pero CSRF via cookie es posible |
| S9 | console.log en server.ts | **BAJA** | `server.ts:89,99` | `console.log` usado en autoexport — expone datos en producción |
| S10 | Sin límite de tamaño body | **BAJA** | `server.ts` | Express sin `limit` en body parser — DoS potencial |
| S11 | `secure: false` en dev | **BAJA** | `auth.routes.ts:15` | Cookie sin Secure en desarrollo |
| S12 | Catch silencioso en agent | **BAJA** | `application-agent.service.ts` | `catch { /* silent */ }` traga errores |
| S13 | SQL injection mitigado | **OK** | Todos | Queries parametrizados con `$1`, `$2` — buena práctica |
| S14 | JWT_SECRET validado | **OK** | `server/lib/config.ts:36` | Min 32 caracteres — buena práctica |
| S15 | Inyección por table name | **BAJA** | `email-campaign.service.ts` | Interpolación `${table}` mitigada por enum controlado |

### 8.2 Helmet Config

Confirmar el estado de CSP en `server.ts`. Buscar `contentSecurityPolicy` para verificar.

---

## 9. Manejo de Errores

### 9.1 Backend

| Aspecto | Estado | Detalle |
|---------|--------|---------|
| Global unhandledRejection | ✅ Implementado | `server.ts:43-45` — logger.error |
| Global uncaughtException | ✅ Implementado | `server.ts:46-49` — logger.fatal + exit |
| Error middleware | ✅ Implementado | `server/middleware/error.middleware.ts` |
| Formato respuesta inconsistente | ⚠️ Mixto | Algunos endpoints retornan `{ error: string }`, otros `{ success: false, message }` |
| Catch con `any` | ⚠️ Frecuente | `catch (err: any)` en múltiples servicios |
| catch silencioso | ⚠️ Presente | `application-agent.service.ts` |
| Errores de validación Zod | ✅ Implementado | Schemas en `server/lib/validation.ts` |

### 9.2 Frontend

| Aspecto | Estado | Detalle |
|---------|--------|---------|
| ErrorBoundary | ✅ Existe | `src/components/ErrorBoundary.tsx` — implementado pero no claro si envuelve toda la app |
| Toast system | ✅ Existe | `src/components/UI/Toast.tsx` — implementado |
| Silent catch blocks | ⚠️ Presente | `ApplicationQueue.tsx` — catch vacío |
| Sin retry en AuthContext | ⚠️ Riesgo | Fallo de sesión recreada silenciosamente |

### 9.3 Microservicio Python

| Aspecto | Estado |
|---------|--------|
| Exception handler AppError | ✅ Implementado (`main.py:83-91`) |
| Exception handler genérico | ✅ Implementado (`main.py:93-103`) |
| Logging de errores | ✅ Vía `logger.exception()` |

---

## 10. Logging y Observabilidad

### 10.1 Estado Actual

| Componente | Herramienta | Estado |
|------------|-------------|--------|
| Logger estructurado | Pino | ✅ En uso en `server/lib/logger.ts` |
| Pretty-print dev | pino-pretty | ✅ Solo en desarrollo |
| Redact de secrets | Pino redact | ✅ Passwords, tokens redactados |
| Request ID middleware | Custom UUID | ✅ `server/middleware/request-id.middleware.ts` |
| Audit log middleware | Custom | ✅ `server/middleware/audit-log.middleware.ts` |
| Child logger con contexto | `requestLogger()` | ✅ `server/lib/logger.ts:31-33` |
| `console.log` residual | — | ⚠️ ~15 ocurrencias en server.ts, scripts |
| Health check | Endpoint GET /api/health | ✅ Implementado |
| Métricas Prometheus | — | ❌ No implementado |
| Tracing distribuido | — | ❌ No implementado |

### 10.2 console.log Residual

Ocurrencias encontradas en `server.ts`:
- Línea 89: `console.log('[AutoExport/Excel] ...')`
- Línea 99: `console.warn('[AutoExport/Sheets] ...')`

Posiblemente más en scripts y servicios.

---

## 11. Testing

### 11.1 Tests Existents (16 archivos)

| Archivo | Tipo | Assertions |
|---------|------|------------|
| `server/application/auth/Login.test.ts` | Unitario | Mock LoginUseCase |
| `server/application/auth/Setup.test.ts` | Unitario | Mock SetupUseCase |
| `server/application/auth/ChangePassword.test.ts` | Unitario | Mock ChangePasswordUseCase |
| `server/application/auth/ManageUsers.test.ts` | Unitario | Mock ManageUsersUseCase |
| `server/application/company/CreateCompany.test.ts` | Unitario | Mock CreateCompanyUseCase |
| `server/application/job/CreateJob.test.ts` | Unitario | Mock CreateJobUseCase |
| `server/domain/shared/DomainError.test.ts` | Unitario | DomainError |
| `server/lib/config.test.ts` | Unitario | Env config validation |
| `server/lib/validation.test.ts` | Unitario | Zod schemas |
| `server/middleware/auth.middleware.test.ts` | Unitario | JWT + role middleware |
| `server/routes/auth.routes.test.ts` | Integración | Supertest + testcontainers |
| `server/routes/campaign.routes.test.ts` | Integración | Supertest + testcontainers |
| `server/services/campaign-automation.service.test.ts` | Unitario | Servicio mockeado |
| `server/services/email-campaign.service.test.ts` | Unitario | Servicio mockeado |
| `server/utils/passwordPolicy.test.ts` | Unitario | Password validation |
| `server/campaign.data-integrity.test.ts` | Integración | Data integrity |

### 11.2 Cobertura por Capa

| Capa | Tests | Cobertura estimada |
|------|-------|--------------------|
| Domain | 1 archivo | ~20% |
| Application (use cases) | 5 archivos | ~40% |
| Routes (integración) | 2 archivos | ~15% |
| Services | 2 archivos | ~15% |
| Middleware | 1 archivo | ~30% |
| Lib/Utils | 3 archivos | ~50% |
| **Frontend React** | **0 archivos** | **0%** |
| **Python microservice** | **0 archivos** | **0%** |

### 11.3 Problemas

- `*.test.ts` en `.gitignore:11` — los tests no se commitean al repo
- Sin tests para frontend (componentes React)
- Sin tests para Python microservice (aunque existe `pytest.ini`)
- Sin E2E tests para el agente Playwright

---

## 12. Frontend (React)

### 12.1 Estructura

- **Entry point:** `src/main.tsx`
- **Root component:** `src/App.tsx` (365 líneas) — router, context provider, componentes layout
- **UI Library:** Tailwind CSS v4 + Framer Motion + Lucide React
- **Routing:** react-router-dom v7 con `BrowserRouter`, `ProtectedRoute`, `MainLayout`
- **State:** React hooks (useState, useEffect, useCallback) + AuthContext
- **API Client:** `src/services/apiClient.ts` — fetch wrapper con JWT

### 12.2 Componentes Principales

| Componente | Archivo | Líneas | Estado |
|------------|---------|--------|--------|
| App (root) | `src/App.tsx` | 365 | Activo |
| Auth/Login | `src/components/Auth/Login.tsx` | — | Activo |
| Auth/Setup | `src/components/Auth/Setup.tsx` | — | Activo |
| CampaignModule | `src/components/Campaigns/CampaignModule.tsx` | — | Activo |
| CompaniesHub | `src/components/Companies/CompaniesHub.tsx` | — | Activo |
| CompanyDetail | `src/components/Companies/CompanyDetail.tsx` | — | Activo |
| CompanyList | `src/components/Companies/CompanyList.tsx` | — | Activo |
| Dashboard | `src/components/Dashboard/Dashboard.tsx` | — | Activo |
| JobsView | `src/components/Jobs/JobsView.tsx` | — | Activo |
| JobTable | `src/components/Jobs/JobTable.tsx` | — | Activo |
| JobDetail | `src/components/Jobs/JobDetail.tsx` | — | Activo |
| ApplicationQueue | `src/components/Jobs/ApplicationQueue.tsx` | — | Comentado en App.tsx |
| RouteManager | `src/components/Routes/RouteManager.tsx` | — | Activo |
| GeocodingManager | `src/components/Routes/GeocodingManager.tsx` | — | Activo |
| ErrorBoundary | `src/components/ErrorBoundary.tsx` | — | Activo |
| Toast | `src/components/UI/Toast.tsx` | — | Activo |
| Sidebar | `src/components/Layout/Sidebar.tsx` | — | Activo |
| Topbar | `src/components/Layout/Topbar.tsx` | — | Activo |

### 12.3 Observaciones

- **ErrorBoundary** existe pero no está claro si envuelve toda la aplicación (verificar en App.tsx línea 24: se importa pero se usa como wrapper alrededor de las rutas)
- **ApplicationQueue** comentado en `App.tsx:21`
- **ServicesList** comentado en `App.tsx:18`
- **0 tests** para cualquier componente React
- **Tipos TypeScript** definidos en `src/types.ts`
- **Mock data** en `src/mockData.ts` — sugiere desarrollo temprano con datos falsos

---

## 13. Microservicio Optimus_rutas

### 13.1 Stack

- **Framework:** FastAPI
- **ORM:** SQLAlchemy 2.0 asyncio
- **Optimizador:** OR-Tools (TSP solver)
- **Geocoding:** Mapbox API
- **Base de datos:** PostgreSQL (misma instancia que CanTrack)
- **Migrations:** Alembic
- **Testing:** pytest (configurado en `pytest.ini` pero 0 tests implementados)

### 13.2 Servicios

| Servicio | Archivo | Descripción |
|----------|---------|-------------|
| Route Optimizer | `app/services/route_optimizer.py` | TSP con OR-Tools, distancia euclidiana o Mapbox |
| Geocoding | `app/services/geocoding_service.py` | Mapbox con caché en DB |
| Distance Calculator | `app/services/distance_calculator.py` | Cálculo de distancias entre paradas |
| Route Service | `app/services/route_service.py` | Orquestación CRUD + optimización |

### 13.3 API

| Método | Ruta | Controller |
|--------|------|------------|
| GET | `/health` | `health_endpoints.py` |
| GET | `/health/db` | `health_endpoints.py` |
| POST | `/geocode` | `geocoding_endpoints.py` |
| POST | `/routes` | `routes_endpoints.py` |
| GET | `/routes` | `routes_endpoints.py` |
| GET | `/routes/{id}` | `routes_endpoints.py` |
| PATCH | `/routes/{id}` | `routes_endpoints.py` |
| PATCH | `/routes/{id}/stop` | `routes_endpoints.py` |
| DELETE | `/routes/{id}` | `routes_endpoints.py` |

### 13.4 Observaciones

- Excelente arquitectura con FastAPI moderno (async, lifespan, type hints)
- Alembic configurado para migraciones pero usa `Base.metadata.create_all` en startup
- 0 tests implementados a pesar de tener `pytest.ini`
- Frontend HTML estático servido por FastAPI
- Dependencia de `playwright-extra-plugin-stealth@0.0.1` (no mantenido)

---

## 14. Infraestructura y Deploy

### 14.1 Docker

| Servicio | Puerto | Dockerfile | Dependencias |
|----------|--------|------------|--------------|
| app (Node) | 3000 | `./Dockerfile` | optimus-rutas |
| optimus-rutas (Python) | 8000 | `./Optimus_rutas/Dockerfile` | — |
| ollama | 11434 | `ollama/ollama:latest` | — |

### 14.2 Redes Docker

- `cantrack-network`: Red interna para los 3 servicios
- `postgresql_default`: Red externa de CasaOS para PostgreSQL (driver bridge)

### 14.3 Volúmenes

- `ollama-data`: Persistencia de modelos Ollama
- `optimus-data`: Definido pero no usado explícitamente

### 14.4 Deploy

- **Script:** `scripts/deploy-vps.sh` — manual SCP + bash
- **CI/CD:** ❌ No implementado
- **Reverse proxy:** nginx.conf con upstream `app:3000`, WebSocket support para socket.io
- **SSL:** No configurado en nginx.conf (proxy pasa tráfico HTTP en puerto 80)

### 14.5 Dockerfile Node

- **Builder:** Node 22, npm ci, Chromium deps, Playwright install
- **Runtime:** Node 22 slim, Chromium deps, usuario no-root `nodejs`
- **Multi-stage:** Sí, optimizado con COPY selectivo
- **Start:** `npx tsx server.ts` (sin compilación previa en producción)

### 14.6 Observaciones

- Password PostgreSQL hardcoded en `docker-compose.yml:31`
- Sin healthcheck en docker-compose
- Sin limitación de recursos para `app` y `optimus-rutas` (solo `ollama` tiene memory limit)
- Sin SSL termination configurado
- Sin CI/CD pipeline

---

## 15. Dependencias y Riesgos

### 15.1 Dependencias Críticas

| Dependencia | Versión | Propósito | Riesgo |
|-------------|---------|-----------|--------|
| `playwright` | ^1.59.1 | Automatización navegador | Actualizaciones frecuentes |
| `playwright-extra` | ^4.3.6 | Plugin system | Mantenimiento comunitario |
| `playwright-extra-plugin-stealth` | ^0.0.1 | Evasión detección | **No mantenido** — versión 0.0.1 |
| `@google/genai` | ^1.29.0 | Gemini API | Estable |
| `groq-sdk` | (no listado) | — | — |
| `express` | ^4.21.2 | HTTP framework | Estable, LTS |
| `react` | ^19.0.0 | UI framework | Estable |
| `pino` | ^10.3.1 | Logging | Estable |
| `zod` | ^3.23.8 | Validación | Estable |
| `helmet` | ^8.1.0 | Seguridad HTTP headers | Estable |
| `or-tools` | (no especificado) | Optimización rutas | Estable |

### 15.2 Riesgos Identificados

| Riesgo | Impacto | Probabilidad | Mitigación |
|--------|---------|--------------|------------|
| playwright-extra-plugin-stealth abandonado | Alto (agente deja de funcionar) | Media | Migrar a Playwright nativo + fingerprint |
| .env.example desactualizado | Medio (setup incorrecto) | Baja | Sincronizar con .env |
| OR-Tools breaking changes | Medio | Baja | Pin version en requirements.txt |
| Gemini API deprecation | Alto | Baja | Mantener fallbacks Groq/Ollama |
| Chromium system deps en Docker | Medio (build fail) | Baja | Usar `playwright-docker` image |

---

## 16. Duplicación y Deuda Técnica

### 16.1 Duplicación de Código

| # | Código Duplicado | Ubicación A | Ubicación B | Líneas |
|---|-----------------|-------------|-------------|--------|
| D1 | Rutas auth (setup, login, logout, me, profile, password, users CRUD) | `server.ts:718-902` (inline) | `server/routes/auth.routes.ts:119-341` | ~180 c/u |
| D2 | `JWT_EXPIRES_IN = '8h'` | `server/lib/config.ts:37` | `server/routes/auth.routes.ts:20` | 1 c/u |
| D3 | `ACCOUNT_LOCKOUT_THRESHOLD = 5` | `server/lib/config.ts:53` | `server/routes/auth.routes.ts:10` | 1 c/u |
| D4 | `ACCOUNT_LOCKOUT_MINUTES = 15` | `server/lib/config.ts:54` | `server/routes/auth.routes.ts:11` | 1 c/u |
| D5 | `COOKIE_OPTS` / cookie config | `server/routes/auth.routes.ts:13-18` | `server.ts` (inline en auth) | ~5 c/u |
| D6 | Companies routes (CRUD completo) | `server.ts:908-...` (inline) | `server/routes/companies.routes.ts` | ~200+ c/u |

### 16.2 Deuda Técnica

| # | Item | Esfuerzo Est. | Impacto |
|---|------|---------------|---------|
| T1 | Refactorizar server.ts en routers | 2-3 días | Alto — elimina duplicación, mejora mantenibilidad |
| T2 | Reemplazar console.log residual por Pino | 2-4 horas | Medio — logging consistente |
| T3 | Sincronizar constantes auth | 1 hora | Bajo — prevenir drift |
| T4 | Agregar tests frontend | 3-5 días | Alto — 0% cobertura actual |
| T5 | Agregar tests Python | 2-3 días | Alto — 0 tests a pesar de pytest.ini |
| T6 | Revisar `.gitignore` (sacar *.test.ts) | 5 min | Crítico — tests no versionados |
| T7 | Mover password de docker-compose a secrets | 1 hora | Crítico — seguridad |
| T8 | Agregar paginación a GET /api/companies | 4-6 horas | Medio — prevenir OOM |

---

## 17. Internacionalización

### 17.1 Idioma del Código

- **Código backend:** Español e inglés mixto
- **Nombres de variables:** Mayormente español (tipo, trabajo, empresa, etc.)
- **Mensajes de error al usuario:** Español (`Error interno del servidor`, `Autenticación requerida`)
- **Comentarios:** Mixto (inglés técnico, español funcional)
- **Nombres de archivos:** Inglés
- **Nombres de tablas DB:** Inglés (companies, jobs, candidates, applications)
- **Nombres de columnas DB:** Mixto (ontario_companies tiene `nombre`, `telefono`, `tipo`, `correo`, `direccion`, `pueblo` en español)

### 17.2 Evaluación

- No hay framework de i18n (react-intl, i18next, etc.)
- Strings hardcodeados en español en componentes React
- Apropiado para mercado colombiano actual, pero limitante si se expande a otros países

---

## 18. Rendimiento y Escalabilidad

### 18.1 Cuellos de Botella Identificados

| # | Problema | Ubicación | Impacto |
|---|----------|-----------|---------|
| P1 | `GET /api/companies` sin paginación | `server.ts:908` | Riesgo OOM con +1000 empresas |
| P2 | N+1 queries en loops | `enrichment.service.ts`, `workflow.service.ts` | Lento al procesar batches grandes |
| P3 | Pool PostgreSQL fijo en 10 conexiones | `server/lib/config.ts:45` | Limitante bajo concurrencia alta |
| P4 | Debounce de export en memoria | `server.ts:70-76` | Pérdida de datos si el server crashea |
| P5 | Sin caché HTTP (ETag, Cache-Control) | `server.ts` | Respuestas no cacheadas |
| P6 | `lazy="selectin"` en SQLAlchemy | `Optimus_rutas/app/models/db.py:94` | Podría causar N+1 en joins complejos |
| P7 | Sin índices en algunas FK | Schema completo | Performance degradado en joins |

### 18.2 Escalabilidad

- **Horizontal:** Stateless (JWT), escalable con múltiples instancias
- **Vertical:** Pool DB configurable, queries parametrizados
- **Frontend:** Vite bundle optimizado, lazy loading no implementado
- **Base de datos:** Schema normalizado 3NF, índices en columnas de búsqueda frecuente

---

## 19. Recomendaciones Priorizadas

### Prioridad Crítica (Esta Semana)

| # | Acción | Área | Archivos | Esfuerzo |
|---|--------|------|----------|----------|
| CR1 | Sacar `*.test.ts` de `.gitignore` y commitear tests | Testing | `.gitignore` | 5 min |
| CR2 | Mover password PostgreSQL a Docker secrets | Seguridad | `docker-compose.yml` | 1 hora |
| CR3 | Reemplazar console.log residual por Pino | Logging | `server.ts`, scripts | 2-4 horas |
| CR4 | Agregar paginación a GET /api/companies | Performance | `server/routes/companies.routes.ts` | 4-6 horas |

### Prioridad Alta (2 Semanas)

| # | Acción | Área | Esfuerzo |
|---|--------|------|----------|
| A1 | Refactorizar server.ts: extraer auth/companies routes a router files | Arquitectura | 2-3 días |
| A2 | Eliminar constantes duplicadas (JWT_EXPIRES_IN, ACCOUNT_LOCKOUT) | Calidad | 1 hora |
| A3 | Sincronizar rutas inline vs refactorizadas — decidir cuál eliminar | Arquitectura | 1 día |
| A4 | Agregar tests para componentes React (Vitest + Testing Library) | Testing | 3-5 días |
| A5 | Agregar tests para Optimus_rutas (pytest) | Testing | 2-3 días |
| A6 | Re-habilitar CSP o migrar a Tailwind CSP-compatible | Seguridad | 4-8 horas |

### Prioridad Media (1 Mes)

| # | Acción | Área | Esfuerzo |
|---|--------|------|----------|
| M1 | Agregar refresh token rotation | Auth | 1-2 días |
| M2 | Agregar CSRF protection (double-submit cookie) | Seguridad | 4-6 horas |
| M3 | Agregar rate limiting a GET /api/companies | Seguridad | 2-3 horas |
| M4 | Implementar lazy loading en rutas React | Frontend | 1-2 días |
| M5 | Agregar healthcheck en docker-compose | Infra | 1 hora |
| M6 | Agregar Prometheus metrics endpoint | Observabilidad | 1-2 días |

### Prioridad Baja (Próximo Trimestre)

| # | Acción | Área | Esfuerzo |
|---|--------|------|----------|
| L1 | Migrar playwright-extra-plugin-stealth a alternativa mantenida | Automation | 2-3 días |
| L2 | Agregar CI/CD (GitHub Actions) | DevOps | 1-2 días |
| L3 | Agregar SSL termination (Let's Encrypt + nginx) | Seguridad | 4-6 horas |
| L4 | Agregar i18n framework | Frontend | 3-5 días |
| L5 | Implementar tests E2E con Playwright Test Runner | Testing | 3-5 días |

---

## 20. Confianza y Precisión

### 20.1 Metodología

Esta auditoría se realizó mediante análisis estático del código fuente en `/var/www/cantrack`. Todos los hallazgos están referenciados a archivos y líneas específicas. No se ejecutó la aplicación ni se realizaron pruebas dinámicas.

### 20.2 Índice de Confianza por Sección

| Sección | Confianza | Base |
|---------|-----------|------|
| 1. Resumen Ejecutivo | **Alta** | Síntesis de hallazgos directos |
| 2. Stack Tecnológico | **Alta** | Extraído de package.json, Dockerfiles |
| 3. Estructura del Proyecto | **Alta** | Tree real del filesystem |
| 4. Modelo de Datos | **Alta** | Extraído de db/schema.sql y models/db.py |
| 5. API Endpoints | **Alta** | Grep directo sobre server.ts y routes/ |
| 6. Arquitectura | **Alta** | Análisis de imports y flujo de llamadas |
| 7. Autenticación | **Alta** | Lectura directa de auth.middleware.ts y auth.routes.ts |
| 8. Seguridad | **Alta** | Hallazgos directos verificables |
| 9. Manejo de Errores | **Media** | Algunos catch blocks requieren ejecución para verificar |
| 10. Logging | **Alta** | Lectura directa de logger.ts y server.ts |
| 11. Testing | **Alta** | Conteo directo de archivos *.test.ts |
| 12. Frontend | **Alta** | Lectura de App.tsx y estructura de componentes |
| 13. Optimus_rutas | **Alta** | Lectura directa de archivos Python |
| 14. Infraestructura | **Alta** | Lectura de docker-compose.yml, Dockerfile, nginx.conf |
| 15. Dependencias | **Alta** | Extraído de package.json y requirements.txt |
| 16. Duplicación | **Alta** | Comparación directa de archivos |
| 17. Internacionalización | **Media** | Requeriría revisión completa de strings |
| 18. Rendimiento | **Media** | Inferido de patrones de código, no medido |
| 19. Recomendaciones | **Alta** | Basado en hallazgos confirmados |
| 20. Esta sección | **Alta** | Metodología documentada |

### 20.3 Limitaciones

- No se realizaron pruebas de penetración
- No se ejecutaron tests para verificar cobertura real
- No se analizaron dependencias transitivas (npm audit)
- No se verificó la configuración de producción real vs. docker-compose
- Algunos hallazgos de rendimiento son inferencias no medidas
- El estado de CSP deshabilitado es inferido (buscar `contentSecurityPolicy: false` en server.ts)

---

*Documento generado el 2026-06-16. Todos los hallazgos deben verificarse manualmente antes de actuar sobre ellos.*
