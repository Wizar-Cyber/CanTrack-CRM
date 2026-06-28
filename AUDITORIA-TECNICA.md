# Auditoría Técnica Completa — CanTrack CRM

> **Versión:** 1.0.0  
> **Propósito:** Documentación técnica oficial para onboarding de desarrolladores  
> **Stack:** Node.js 22 + Express 4 + React 19 + PostgreSQL 17 + TypeScript 5.8  

---

## Índice

1. [Arquitectura General](#1-arquitectura-general)
2. [Configuración de Entidades](#2-configuración-de-entidades)
3. [Inicialización del Sistema](#3-inicialización-del-sistema)
4. [Scraping e Ingesta de Información](#4-scraping-e-ingesta-de-información)
5. [Sincronización](#5-sincronización)
6. [Cron Jobs](#6-cron-jobs)
7. [Servicio Optimus Route](#7-servicio-optimus-route)
8. [Scripts de Configuración](#8-scripts-de-configuración)
9. [Seed Inicial](#9-seed-inicial)
10. [Dependencias entre Módulos](#10-dependencias-entre-módulos)
11. [Variables de Entorno](#11-variables-de-entorno)
12. [Base de Datos](#12-base-de-datos)
13. [APIs](#13-apis)
14. [Dependencias Externas](#14-dependencias-externas)
15. [Flujo Completo del Sistema](#15-flujo-completo-del-sistema)
16. [Mapa Completo de Dependencias](#16-mapa-completo-de-dependencias)
17. [Guía para Nuevo Desarrollador](#17-guía-para-nuevo-desarrollador)

---

## 1. Arquitectura General

### Tipo de Arquitectura

**Monolito Modular** con un microservicio auxiliar (Optimus_rutas).  
Sigue una arquitectura limpia en capas para el backend:

```
Routes → Use Cases (Application) → Domain ← Infrastructure
                                  → Services → External APIs
```

### Stack Tecnológico

| Capa | Tecnología | Versión | Propósito |
|------|-----------|---------|-----------|
| **Runtime** | Node.js | 22 | Servidor backend |
| **Backend** | Express | 4.21 | Framework HTTP |
| **Frontend** | React | 19 | UI SPA |
| **Lenguaje** | TypeScript | 5.8 | Tipado estático |
| **Build** | Vite | 6.2 | Bundler frontend + dev server |
| **CSS** | Tailwind CSS | 4.1 | Estilos utilitarios |
| **DB Driver** | pg (node-postgres) | 8.20 | Conector PostgreSQL |
| **Auth** | jsonwebtoken + bcryptjs | 9.0 / 3.0 | JWT + hash |
| **Logging** | pino | 10.3 | Logger estructurado |
| **Testing** | Vitest + Supertest | 3.1 / 7.2 | Tests unitarios e integración |
| **AI** | @google/genai, fetch (Groq) | 1.29 | Enriquecimiento IA |
| **Scraping** | playwright | 1.59 | Automatización navegador |
| **Container** | Docker + Compose | — | Despliegue |
| **Proxy** | Nginx | — | Reverse proxy |

### Organización del Proyecto

```
/var/www/cantrack/
├── server.ts                    # Entry point backend
├── server/                      # Backend
│   ├── application/             # Use cases (casos de uso)
│   │   ├── auth/                #   Login, Setup, ChangePassword, etc.
│   │   ├── company/             #   CRUD + Enrichment
│   │   ├── job/                 #   Job CRUD
│   │   ├── candidate/           #   Candidate management
│   │   ├── apply/               #   Application flow
│   │   └── sync/                #   Scraped job sync
│   ├── domain/                  # Entidades + interfaces de repositorio
│   │   ├── company/             #   Company entity + ICompanyRepository
│   │   ├── job/                 #   Job entity + IJobRepository
│   │   ├── user/                #   User entity + IUserRepository
│   │   ├── candidate/           #   Candidate entity
│   │   ├── application/         #   Application entity
│   │   └── shared/              #   DomainError base class
│   ├── services/                # Lógica de negocio + integraciones
│   │   ├── enrichment.service.ts
│   │   ├── email-campaign.service.ts
│   │   ├── campaign-automation.service.ts
│   │   ├── mdirector.service.ts
│   │   ├── google-sheets.service.ts
│   │   ├── gemini.service.ts / groq.service.ts / ollama.service.ts
│   │   ├── job-classifier.service.ts
│   │   ├── workflow.service.ts
│   │   ├── automation.service.ts
│   │   ├── portal-detector.ts
│   │   └── providers/           # Chain-of-responsibility IA
│   │       ├── IEnrichmentProvider.ts
│   │       ├── ProviderChain.ts
│   │       ├── GeminiProvider.ts
│   │       ├── GroqProvider.ts
│   │       ├── OllamaProvider.ts
│   │       └── WebSearchProvider.ts
│   ├── infrastructure/          # Implementaciones de repositorios
│   │   └── database/
│   │       ├── BaseRepository.ts
│   │       ├── CompanyRepository.ts
│   │       ├── JobRepository.ts
│   │       ├── UserRepository.ts
│   │       ├── CandidateRepository.ts
│   │       └── ProvinceCompanyRepository.ts
│   ├── middleware/              # Express middleware
│   │   ├── auth.middleware.ts
│   │   ├── error.middleware.ts
│   │   ├── rate-limit.middleware.ts
│   │   ├── request-id.middleware.ts
│   │   ├── request-logger.middleware.ts
│   │   └── audit-log.middleware.ts
│   ├── routes/                  # Route handlers
│   │   ├── auth.routes.ts
│   │   ├── companies.routes.ts
│   │   ├── jobs.routes.ts
│   │   ├── campaign.routes.ts
│   │   ├── candidates.routes.ts
│   │   ├── applications.routes.ts
│   │   ├── sync.routes.ts
│   │   ├── export.routes.ts
│   │   ├── webhook.routes.ts
│   │   ├── health.routes.ts
│   │   ├── enrichment.routes.ts
│   │   └── workflow.routes.ts
│   ├── automation/              # Cron jobs
│   │   └── cron-jobs.ts
│   ├── lib/                     # Config, logger, validation
│   ├── data/                    # Datos estáticos (serviceTypes, mdirectorSegments)
│   └── utils/                   # Utilidades
├── src/                         # Frontend React
│   ├── components/              # Componentes por dominio
│   ├── contexts/                # AuthContext
│   ├── services/                # apiClient, geminiService
│   └── utils/                   # tipo.ts
├── db/                          # Migraciones SQL
├── scripts/                     # Scripts CLI (30+)
├── Optimus_rutas/               # Microservicio Python
├── docs/                        # Documentación
├── docker-compose.yml
├── Dockerfile
└── nginx.conf
```

### Flujo General de Ejecución

```mermaid
graph TB
    subgraph "Startup sequence"
        A[npm run dev / docker-compose up]
        B[server.ts loads dotenv/config]
        C[Express app init]
        D[PostgreSQL pool connect]
        E[Auto-migrations run]
        F[Cron jobs start]
        G[Server listening :3000]
        A --> B --> C --> D --> E --> F --> G
    end

    subgraph "Request flow"
        H[Browser] -->|HTTP| Nginx
        Nginx -->|:3000| Express
        Express -->|/api/*| Routes
        Routes -->|auth check| AuthMiddleware
        Routes -->|data| DB[(PostgreSQL)]
        Routes -->|enrich| AI[AI Providers]
        Routes -->|email| MDirector
        Routes -->|sheets| GoogleSheets
        Routes -->|routes| Optimus
    end
```

### Cómo Inicia la Aplicación

Archivo: `server.ts` (518 líneas)

1. **`import 'dotenv/config'`** — Carga variables de entorno ANTES que cualquier otro import
2. **Configura Express** con helmet, cors, cookie-parser, JSON parser (1MB limit)
3. **Conecta PostgreSQL** vía `pg.Pool` usando `DATABASE_URL`
4. **Ejecuta auto-migraciones** (`runMigrations()`): tablas nuevas y columnas faltantes
5. **Inicia cron jobs** (`initCronJobs(pool)`) — geocoding, enrichment, campaigns, workflow
6. **Configura rate limiters** por ruta
7. **Importa dinámicamente** todos los routers
8. **Configura Vite** (dev mode) o sirve `dist/` estático (production)
9. **Escucha en `0.0.0.0:3000`**

---

## 2. Configuración de Entidades

### Tabla Maestra de Entidades

| Entidad | Tabla BD | Relaciones | Servicio Principal | Endpoints | Seed |
|---------|----------|-----------|-------------------|-----------|------|
| **User** | `users` | → email_logs, routes, application_queue | Auth Routes | `/api/auth/*`, `/api/users/*` | No (setup inicial) |
| **Company** | `companies` | → jobs, email_logs, route_stops | Company Routes | `/api/companies/*` | `db/seed.sql` (55) |
| **Job** | `jobs` | → companies, applications, application_queue | Job Routes | `/api/jobs/*` | `db/seed.sql` (1) |
| **Candidate** | `candidates` | → applications, candidate_skills | Candidate Routes | `/api/candidates/*` | No |
| **Application** | `applications` | → jobs, candidates | Application Routes | `/api/applications/*` | No |
| **OntarioCompany** | `ontario_companies` | → jobs (province_id) | Ontario Routes | `/api/ontario/*` | No (~8,055 rows) |
| **QuebecCompany** | `quebec_companies` | → jobs (province_id) | Quebec Routes | `/api/quebec/*` | No (~15,676 rows) |
| **CampaignConfig** | `campaign_config` | — (singleton) | Campaign Routes | `/api/campaigns/config` | `server.ts` insert |
| **Route** | `routes` | → route_stops, users | Visits Routes | `/api/routes/*` | No |
| **RouteStop** | `route_stops` | → routes, companies | Visits Routes | `/api/routes/*` | No |

### Entidad: User

- **Archivo entidad:** `server/domain/user/User.ts`
- **Archivo repositorio:** `server/infrastructure/database/UserRepository.ts`
- **Archivo interfaz:** `server/domain/user/IUserRepository.ts`
- **Migraciones:** Auto-migración en `server.ts:runMigrations()` (solo si existen columnas nuevas)
- **Validaciones:** Email regex, password min 8 chars, role permitido (admin/editor/viewer)
- **Enums:** `UserRole = 'admin' | 'editor' | 'viewer'`
- **Middlewares:** `auth.middleware.ts` (JWT), `rate-limit.middleware.ts`

### Entidad: Company

- **Archivo entidad:** `server/domain/company/Company.ts`
- **Archivo repositorio:** `server/infrastructure/database/CompanyRepository.ts`
- **Migraciones principales:**
  - `server.ts:runMigrations()` — columnas: phone, contact_email, hq_region, hq_town, suggested_services, google_maps_status, tipo, last_campaign_sent_at
  - Elimina columnas legacy: sector, is_publicly_traded, stock_ticker, confidence_score, needs_manual_review
- **Enums:** `EnrichmentStatus`, `CompanyTipo` (verde/naranja/morado/rojo)
- **Column allowlist:** `ALLOWED_COMPANY_COLUMNS` en `companies.routes.ts:18-23`

### Entidad: Job

- **Archivo entidad:** `server/domain/job/Job.ts`
- **Migraciones:** `server.ts` — service_type_id, service_match_confidence, service_match_reasoning, service_match_provider
- **Enums:** `JobSource = 'linkedin' | 'indeed' | 'glassdoor' | 'company_website' | 'other'`
- **Deduplicación:** índice único `idx_jobs_company_title_dedup` (raw_company_name + title, donde is_active = true)

### Entidad: Ontario/Quebec Company

- **Tablas:** `ontario_companies`, `quebec_companies` (~8,000 y ~15,000 filas respectivamente)
- **Campos en español:** nombre, telefono, tipo, correo, direccion, provincia, region, ciudad, pueblo, work, descripcion, dominio_de_pagina
- **Enriquecimiento:** enrichment_status, lat, lng, suggested_services, last_campaign_at, email_status, email_bounce_count

---

## 3. Inicialización del Sistema

### `npm install`

Instala dependencias de `package.json`:
- **Producción:** express, pg, jsonwebtoken, bcryptjs, playwright, @google/genai, exceljs, googleapis, pino, zod, react, etc.
- **Desarrollo:** typescript, vitest, supertest, testcontainers, tsx, tailwindcss

### `npm run dev`

Ejecuta `tsx server.ts` — el flujo completo:

1. **Carga `.env`** vía `dotenv/config` (línea 2 de `server.ts`)
2. **Valida variables requeridas** en `server/lib/config.ts`:
   - `JWT_SECRET` (min 32 chars) — si falta, `process.exit(1)`
   - `DATABASE_URL` — si falta, `process.exit(1)`
3. **Conecta PostgreSQL** con Pool (max 10 conexiones)
4. **Ejecuta `runMigrations()`**: ~30 ALTER TABLE/CREATE TABLE idempotentes
5. **Inicia cron jobs** vía `initCronJobs(pool)`:
   - Geocoding a los 10s, luego cada 60 min
   - Campaign check a los 60s, luego cada 15 min
   - Workflow check a los 90s, luego cada 15 min
   - Fast Sync a los 30s, luego cada 5 min
   - Enrichment a los 3s, luego cada 8s (5 por ciclo)
6. **Configura Express** con helmet, cors, cookieParser, JSON body parser
7. **Configura rate limiters** (auth, api, heavy, setup, agent, password)
8. **Importa dinámicamente** 15 routers (ver `server.ts:462-490`)
9. **Configura Vite middleware** (dev) o static `dist/` (prod)
10. **Inicia servidor** en `0.0.0.0:3000`

### `docker-compose up`

Levanta 3 servicios:

```
docker-compose.yml
├── app          → Build desde Dockerfile, puerto :3000
├── optimus-rutas → Build desde Optimus_rutas/Dockerfile, puerto :8000
└── ollama       → Imagen ollama/ollama:latest, puerto :11434
```

Redes: `cantrack-network` (interna) + `postgresql_default` (CasaOS externa)

### Servicios externos necesarios

| Servicio | Variable | ¿Requerido en dev? | Notas |
|----------|----------|-------------------|-------|
| PostgreSQL | `DATABASE_URL` | **Sí** | Todo el sistema depende de BD |
| Gemini AI | `GEMINI_API_KEY` | No | Sin esto, usa Groq → Ollama → WebSearch |
| Groq AI | `GROQ_API_KEY` | No | Fallback de Gemini |
| MDirector | `MDIRECTOR_*` | No | Solo para campañas de email |
| Mapbox | `MAPBOX_TOKEN` | No | Geocoding usa Nominatim como fallback |
| Google Sheets | `GOOGLE_SERVICE_ACCOUNT_CREDENTIALS` | No | Export opcional |

### NO utiliza

- **Redis**: El proyecto NO tiene Redis. El cache es en memoria (`server/utils/cache.ts`)
- **Colas/RabbitMQ**: No. Usa setInterval + queries directas a BD
- **Workers/Bull**: No. Todo corre en el mismo proceso
- **Socket.IO**: No. Polling HTTP cada 60s

---

## 4. Scraping e Ingesta de Información

### ¿Cómo funciona la ingesta?

**NO hay un scraper integrado en el proyecto CanTrack CRM.**  
La ingesta ocurre a través de **webhooks** que reciben datos de scrapers externos.

### Punto de entrada

`POST /api/webhook/scraper` — archivo: `server/routes/webhook.routes.ts`

### Flujo completo

```mermaid
sequenceDiagram
    participant Scraper as Scraper Externo
    participant Webhook as POST /api/webhook/scraper
    participant Province as province-helpers
    participant DB as PostgreSQL
    participant Classifier as JobClassifierService
    participant Queue as Enrichment Queue

    Scraper->>Webhook: {fuente, titulo, empresa, url_postulacion}
    Webhook->>Webhook: Validar WEBHOOK_SECRET
    Webhook->>Webhook: Validar campos requeridos
    Webhook->>Webhook: Filtro regional (REGION_FILTER)
    
    Webhook->>Province: findCompanyInBothTables(empresa)
    alt Empresa existe
        Province-->>Webhook: {id, table, src}
    else Empresa nueva
        Province->>Province: enrichAndInsertCompany(empresa)
        Province-->>Webhook: {id, src} (nueva)
    end
    
    Webhook->>DB: INSERT INTO jobs (...)
    Webhook-->>Scraper: {success: true, isNew, province, companyId}
    
    DB->>Classifier: classifyJob(titulo) [background]
    Classifier->>DB: UPDATE jobs SET service_type_id
    
    Note over Queue: Cron de enrichment procesa después
    Queue->>DB: enrichNextPending()
```

### Archivos principales

| Archivo | Rol |
|---------|-----|
| `server/routes/webhook.routes.ts` | Receptor del webhook (131 líneas) |
| `server/utils/province-helpers.ts` | Búsqueda/creación en tablas provinciales (132 líneas) |
| `server/services/job-classifier.service.ts` | Clasificación IA de vacantes (411 líneas) |
| `server/services/portal-detector.ts` | Detección de ATS desde URL (108 líneas) |
| `server/services/automation.service.ts` | Postulación automatizada con Playwright (361 líneas) |

### APIs consumidas por portal-detector

| Portal | API Endpoint |
|--------|-------------|
| **Greenhouse** | `https://boards-api.greenhouse.io/v1/boards/{slug}/jobs/{id}/applications` |
| **Lever** | `https://api.lever.co/v0/postings/{id}/apply` |
| **Ashby** | `https://api.ashbyhq.com/applicationForm.submit` |
| **SmartRecruiters** | `https://api.smartrecruiters.com/v1/companies/{slug}/postings/{id}/questionnaire/apply` |
| **LinkedIn** | `null` (requiere extensión de navegador) |
| **Indeed** | `null` (requiere extensión de navegador) |
| **Workday** | `null` (requiere extensión de navegador) |

### Manejo de errores

- Validación de `WEBHOOK_SECRET` → 401 si no coincide
- Validación de campos requeridos → 400 si falta empresa/titulo/url
- Filtro regional → 200 con `{skipped: true}` si fuera de región
- Duplicados → `ON CONFLICT DO UPDATE` en jobs
- Errores de BD → 500 genérico

### Reintentos

No hay sistema de reintentos explícito para webhooks.  
El cron de Fast Sync (`runFastSync` cada 5 min) reprocesa jobs con `province_id IS NULL`, actuando como reintento.

---

## 5. Sincronización

### ¿Qué sincroniza?

El sistema sincroniza **jobs no vinculados a empresas** desde la tabla `jobs` hacia `companies` y `ontario_companies`/`quebec_companies`.

### Flujo de Sincronización

```mermaid
graph LR
    A[Scraped Jobs<br/>(webhook)] -->|Jobs sin company_id| B[Sync Job]
    B -->|raw_company_name| C{Existe en companies?}
    C -->|Sí| D[UPDATE job SET company_id]
    C -->|No| E[INSERT INTO companies]
    E --> D
    D --> F[JobClassifierService<br/>classifyJob()]
    F --> G[UPDATE job SET service_type_id]
```

### Módulos participantes

| Módulo | Archivo | Rol |
|--------|---------|-----|
| Sync Routes | `server/routes/sync.routes.ts` | Endpoint `POST /api/sync/scraped-jobs` |
| Workflow Service | `server/services/workflow.service.ts` | `syncJobs()` — mismo proceso batch |
| Cron Fast Sync | `server/automation/cron-jobs.ts` | `runFastSync()` cada 5 min |
| Job Classifier | `server/services/job-classifier.service.ts` | Clasificación IA en background |

### Tablas que actualiza

| Tabla | Operación |
|-------|-----------|
| `jobs` | `SET company_id, province_id, province_source, service_type_id` |
| `companies` | `INSERT` (si no existe) |
| `scraped_jobs` | `SELECT` (legacy, solo lectura) |

### Servicios que consume

- **`EnrichmentService`** — solo para workflow completo
- **`JobClassifierService`** — clasifica cada job vinculado
- **`province-helpers.ts`** — para búsqueda en tablas provinciales
- **`region-filter.ts`** — para filtrar jobs fuera de región configurada

---

## 6. Cron Jobs

Todos los cron jobs corren **in-process** mediante `setInterval`/`setTimeout`.  
No hay expresión cron tradicional ni daemon externo.

Archivo: `server/automation/cron-jobs.ts` (377 líneas)

| Cron | Archivo | Expresión (equivalente) | Frecuencia | Función ejecutada | Dependencias |
|------|---------|------------------------|------------|-------------------|-------------|
| **Geocoding** | `cron-jobs.ts:136-146` | `0 * * * *` | Cada 60 min (10s delay inicial) | `geocodePendingCompanies()` | Mapbox API o Nominatim |
| **Enrichment** | `cron-jobs.ts:164-182` | `* * * * *` (8s entre batches) | Cada 8s (5 empresas/batch, 3s delay inicial) | `enrichNextPending()` | EnrichmentService, JobClassifierService |
| **Fast Sync** | `cron-jobs.ts:157-160` | `*/5 * * * *` | Cada 5 min (30s delay inicial) | `runFastSync()` | slugify, province-helpers |
| **Campaign Auto** | `cron-jobs.ts:148-150` | `*/15 * * * *` | Cada 15 min (60s delay inicial) | `checkAndRunCampaigns()` | CampaignAutomationService |
| **Workflow** | `cron-jobs.ts:152-154` | `0 8,20 * * *` | Cada 15 min (check), ejecuta a las 08:00 y 20:00 UTC | `checkAndRunWorkflow()` | runWorkflowCycle |

### Detalle de cada cron

#### Geocoding (`geocodePendingCompanies`)
- Lee `ontario_companies` y `quebec_companies` donde `lat IS NULL`
- Usa Mapbox (paralelo, 10 concurrencia, 100ms entre chunks)
- Fallback a Nominatim (secuencial, 1.1s entre requests)
- Saltea direcciones fallidas en la misma ejecución
- **Posibles fallos:** Timeout de Mapbox, rate limiting de Nominatim

#### Enrichment (`enrichNextPending`)
- Desatasca companies en 'processing' por más de 5 min
- Solo enriquece companies con jobs vinculados
- Procesa 5 por ciclo con 1.2s entre cada uno
- Actualiza `enrichment_status`, datos enriquecidos, y sugerencias de servicios
- **Posibles fallos:** API keys expiradas, cuota de IA agotada

#### Fast Sync (`runFastSync`)
- Jobs con `province_id IS NULL` y `raw_company_name` no vacío
- Detecta provincia desde `location` (QC → quebec, etc.)
- Crea empresa en tabla provincial si no existe
- **Posibles fallos:** Datos inconsistentes, duplicados

#### Campaign Automation (`checkAndRunCampaigns`)
- Verifica `campaign_config.auto_enabled`
- Solo corre en la hora configurada (`auto_schedule_hour`, default 08:00 UTC)
- Una vez por día (verifica `auto_last_run_at`)
- **Posibles fallos:** MDirector autenticación, templates faltantes

#### Workflow (`checkAndRunWorkflow`)
- Corre en horas UTC fijas (08:00 y 20:00)
- Deduplica por slot horario
- Ejecuta ciclo completo: requeue → sync → enrich → copy → export
- **Posibles fallos:** Cualquier paso puede fallar individualmente (resultado PARTIAL)

---

## 7. Servicio Optimus Route

### ¿Qué es?

**Optimus_rutas** es un microservicio en **Python FastAPI** para optimización de rutas de visitas comerciales. Resuelve variantes del Problema del Viajante (TSP) usando Mapbox.

### Dónde está implementado

```
Optimus_rutas/
├── app/
│   ├── main.py                    # Entry point FastAPI
│   ├── models/
│   │   ├── db.py                  # Modelos SQLAlchemy
│   │   └── schemas.py             # Pydantic schemas
│   ├── routes/
│   │   ├── routes_endpoints.py    # CRUD de rutas
│   │   ├── geocoding_endpoints.py # Geocodificación
│   │   └── health_endpoints.py    # Health check
│   ├── services/
│   │   ├── route_optimizer.py     # Algoritmo TSP/VRP
│   │   ├── route_service.py       # Lógica de rutas
│   │   ├── distance_calculator.py # Distancias Mapbox
│   │   └── geocoding_service.py   # Geocodificación Mapbox
│   ├── repositories/              # Acceso a datos
│   └── utils/
│       ├── config.py              # Config desde env
│       ├── database.py            # Conexión asyncpg
│       └── logger.py              # Logging
├── alembic/                       # Migraciones BD
├── Dockerfile
└── requirements.txt
```

### Configuración

Variables de entorno en `Optimus_rutas/.env`:

```env
DATABASE_URL=postgresql+asyncpg://casaos:casaos@postgresql:5432/casaos
MAPBOX_TOKEN=pk.eyJ1...
```

### API que utiliza

| API | Propósito |
|-----|-----------|
| **Mapbox Matrix API** | Cálculo de distancias y tiempos entre puntos |
| **Mapbox Geocoding API** | Conversión direcciones → coordenadas |

### Flujo completo

```mermaid
sequenceDiagram
    participant CRM as CanTrack CRM
    participant Optimus as Optimus_rutas :8000
    participant Mapbox as Mapbox API
    participant DB as PostgreSQL

    CRM->>Optimus: POST /api/optimize {stops, start_address}
    Optimus->>Mapbox: Geocode addresses
    Mapbox-->>Optimus: Coordinates
    Optimus->>Mapbox: Distance Matrix
    Mapbox-->>Optimus: Distances & times
    Optimus->>Optimus: Solve TSP (nearest neighbor / 2-opt)
    Optimus-->>CRM: {ordered_stops, total_distance, total_time}
    CRM->>DB: Save optimized route
```

### Integración con el CRM

- CanTrack CRM llama a `POST /optimus/api/optimize` configurado vía `OPTIMUS_URL`
- Comparten la misma base de datos PostgreSQL
- Tablas compartidas: `routes`, `route_stops` (creadas por auto-migraciones de CanTrack)
- El CRM envía stops, Optimus devuelve orden optimizado

---

## 8. Scripts de Configuración

### Scripts npm (`package.json`)

| Script | Comando | Propósito |
|--------|---------|-----------|
| `dev` | `tsx server.ts` | Inicia servidor en modo desarrollo |
| `build` | `vite build` | Compila frontend para producción |
| `preview` | `vite preview` | Vista previa del build |
| `clean` | `rm -rf dist` | Limpia artefactos de build |
| `lint` | `tsc --noEmit` | Type-check sin emitir archivos |
| `test` | `vitest run` | Ejecuta todos los tests |
| `test:watch` | `vitest` | Tests en modo watch |

### Scripts CLI (`scripts/`)

Hay **30+ scripts** en la carpeta `scripts/`. Los principales:

| Script | Lenguaje | Propósito |
|--------|----------|-----------|
| `init-db.mjs` | JS | Inicializa BD desde schema.sql |
| `check-db.mjs` | JS | Verifica conexión a PostgreSQL |
| `check-schema.mjs` | JS | Verifica estructura de tablas |
| `enrich-companies.ts` | TS | Enriquecimiento manual de companies |
| `export-to-excel.ts` | TS | Exporta companies a Excel |
| `export-to-sheets.ts` | TS | Exporta companies a Google Sheets |
| `deploy-vps.sh` | Bash | Despliegue automatizado a VPS |
| `seed-mdirector-templates.ts` | TS | Siembra templates MDirector |
| `migrate-*.ts/.mjs` | Varios | Migraciones one-shot |
| `check-status.ts` | TS | Estado general del sistema |
| `validate-geographic-data.py` | Python | Validación de datos geográficos |

### Scripts Docker/Infra

| Archivo | Propósito |
|---------|-----------|
| `Dockerfile` | Build multi-etapa para producción |
| `docker-compose.yml` | Orquestación de 3 servicios |
| `nginx.conf` | Reverse proxy con rutas |
| `tunnel.py` | SSH tunnel para PostgreSQL remoto |
| `run-enrichment.ps1` | PowerShell script para Windows |
| `start-dev.ps1` | PowerShell script para desarrollo en Windows |

### ¿Existe un script de setup automático desde cero?

**No.** No existe un script que configure todo automáticamente.

Lo más cercano:
1. `scripts/init-db.mjs` — solo inicializa BD (requiere `.env` configurado)
2. `deploy-vps.sh` — scripts de despliegue manual paso a paso

**Lo que faltaría para un setup automático:**

Un script `setup.sh` que:
1. Verifique prerrequisitos (Node 22+, Docker, psql)
2. Copie `.env.example` → `.env` y solicite valores interactivamente
3. Ejecute `npm install`
4. Cree la BD y ejecute `schema.sql + seed.sql`
5. Inicie servicios Docker (PostgreSQL, Ollama)
6. Ejecute migraciones
7. Inicie el servidor
8. Verifique health endpoint

---

## 9. Seed Inicial

### Archivo `db/seed.sql` (69 líneas)

Contiene **55 empresas** de ejemplo con **1 vacante**.

### Datos Insertados

| Tabla | Registros | Propósito |
|-------|-----------|-----------|
| `companies` | 55 | Empresas semilla (Quala, Sezzle, MixRank, 3Pillar, etc.) |
| `jobs` | 1 | Vacante de ejemplo para Quala |

Las empresas incluyen datos como: nombre, slug, industria, ciudad, provincia, país, website, descripción.

### Datos creados por auto-migraciones (`server.ts:runMigrations()`)

| Tabla | Datos | Propósito |
|-------|-------|-----------|
| `campaign_config` | 1 fila con UUID fijo | Config singleton de campañas |

### Roles y Permisos

NO hay seed de roles. Los roles se definen en TypeScript:
```typescript
// server/domain/user/User.ts
export type UserRole = 'admin' | 'editor' | 'viewer';
```

El primer usuario se crea vía `POST /api/auth/setup` con rol `admin`.

### Estados y Tipos

| Dominio | Valores | Definido en |
|---------|---------|------------|
| `enrichment_status_enum` | pending, processing, db_matched, scraped, verified, failed, skipped | `db/schema.sql` + `server/domain/company/Company.ts` |
| `application_status_enum` | pending, reviewing, rejected, accepted, withdrawn | `db/schema.sql` |
| `candidate_status_enum` | Available, Interviewing, Placed, Inactive | `db/schema.sql` + `server/domain/candidate/Candidate.ts` |
| `job_source_enum` | linkedin, indeed, glassdoor, company_website, other | `db/schema.sql` + `server/domain/job/Job.ts` |
| `company_tipo` | verde, naranja, morado, rojo | `server.ts:runMigrations()` |
| `route_status` | draft, active, paused, completed, cancelled | `server.ts:runMigrations()` |
| `stop_status` | pending, visited, skipped, failed | `server.ts:runMigrations()` |

---

## 10. Dependencias entre Módulos

### Grafo de Dependencias

```mermaid
graph TD
    subgraph "Domain Layer"
        Company[company/]
        Job[job/]
        User[user/]
        Candidate[candidate/]
        Application[application/]
        Shared[shared/]
    end

    subgraph "Application Layer"
        Auth[application/auth/]
        CompanyUC[application/company/]
        JobUC[application/job/]
        CandidateUC[application/candidate/]
        ApplyUC[application/apply/]
        SyncUC[application/sync/]
    end

    subgraph "Services"
        Enrich[enrichment.service]
        Gemini[gemini.service]
        Groq[groq.service]
        Ollama[ollama.service]
        WebSearch[websearch.service]
        ProviderChain[ProviderChain]
        MDirector[mdirector.service]
        Sheets[google-sheets.service]
        EmailCamp[email-campaign.service]
        CampaignAuto[campaign-automation.service]
        JobClassifier[job-classifier.service]
        Workflow[workflow.service]
        Automation[automation.service]
        PortalDetect[portal-detector]
    end

    subgraph "Infrastructure"
        BaseRepo[BaseRepository]
        CompanyRepo[CompanyRepository]
        JobRepo[JobRepository]
        UserRepo[UserRepository]
        CandidateRepo[CandidateRepository]
        ProvinceRepo[ProvinceCompanyRepository]
    end

    subgraph "Routes"
        AuthR[auth.routes]
        CompanyR[companies.routes]
        JobR[jobs.routes]
        CampaignR[campaign.routes]
        CandidateR[candidates.routes]
        SyncR[sync.routes]
        WebhookR[webhook.routes]
        ExportR[export.routes]
        WorkflowR[workflow.routes]
        HealthR[health.routes]
    end

    subgraph "Cron Jobs"
        Geocoding[geocodePendingCompanies]
        EnrichCron[enrichNextPending]
        FastSync[runFastSync]
        CampaignCron[checkAndRunCampaigns]
        WorkflowCron[checkAndRunWorkflow]
    end

    subgraph "External"
        DB[(PostgreSQL)]
        GeminiAPI[Gemini AI]
        GroqAPI[Groq AI]
        OllamaAPI[Ollama Local]
        Mapbox[Mapbox API]
        DDG[DuckDuckGo]
        Wiki[Wikipedia]
        MDAPI[MDirector API]
        GSheets[Google Sheets API]
        Optimus[Optimus_rutas]
    end

    %% Routes → Use Cases
    AuthR --> Auth
    CompanyR --> CompanyUC
    JobR --> JobUC
    SyncR --> SyncUC
    CandidateR --> CandidateUC

    %% Routes → Services
    CompanyR --> Enrich
    CompanyR --> MDirector
    CompanyR --> JobClassifier
    CampaignR --> Sheets
    CampaignR --> MDirector
    CampaignR --> EmailCamp
    WebhookR --> JobClassifier
    SyncR --> JobClassifier
    WorkflowR --> Workflow

    %% Use Cases → Domain
    Auth --> User
    CompanyUC --> Company
    JobUC --> Job
    SyncUC --> Job
    CandidateUC --> Candidate

    %% Use Cases → Infrastructure
    Auth --> UserRepo
    CompanyUC --> CompanyRepo
    JobUC --> JobRepo
    CandidateUC --> CandidateRepo

    %% Services → AI Providers
    Enrich --> ProviderChain
    ProviderChain --> Gemini
    ProviderChain --> Groq
    ProviderChain --> Ollama
    ProviderChain --> WebSearch
    Gemini --> GeminiAPI
    Groq --> GroqAPI
    Ollama --> OllamaAPI
    WebSearch --> DDG
    WebSearch --> Wiki

    %% Services → External
    MDirector --> MDAPI
    Sheets --> GSheets
    Workflow --> Optimus

    %% Repositories → DB
    BaseRepo --> DB
    CompanyRepo --> DB
    JobRepo --> DB
    UserRepo --> DB
    ProvinceRepo --> DB

    %% Cron → Services
    Geocoding --> Mapbox
    EnrichCron --> Enrich
    EnrichCron --> JobClassifier
    FastSync --> ProvinceRepo
    CampaignCron --> CampaignAuto
    WorkflowCron --> Workflow

    %% Automation → Portal Detection
    Automation --> PortalDetect
```

---

## 11. Variables de Entorno

| Variable | Obligatoria | Valor ejemplo | Dónde se usa |
|----------|-------------|---------------|-------------|
| `PORT` | No | `3000` | `server/lib/config.ts`, `server.ts` |
| `ALLOWED_ORIGINS` | No | `http://localhost:5173,http://localhost:3000` | `server.ts` (CORS) |
| `APP_URL` | No | `http://187.124.237.242:3000` | Server |
| `NODE_ENV` | No | `development` | `server/lib/config.ts` |
| `DATABASE_URL` | **Sí** | `postgresql://user:pass@host:5432/db` | `server/lib/config.ts` (Pool) |
| `DATABASE_POOL_SIZE` | No | `10` | Server |
| `JWT_SECRET` | **Sí** | `<64-char-hex>` | `server/lib/config.ts` (firma JWT) |
| `WEBHOOK_SECRET` | **Sí** | `<64-char-hex>` | `server/routes/webhook.routes.ts` |
| `COOKIE_SECURE` | No | `false` | `server/utils/auth-helpers.ts` |
| `GEMINI_API_KEY` | No | `AIzaSy...` | `server/services/gemini.service.ts` |
| `GROQ_API_KEY` | No | `gsk_...` | `server/services/groq.service.ts` |
| `GROQ_MODEL` | No | `llama-3.1-8b-instant` | `server/services/groq.service.ts` |
| `OLLAMA_BASE_URL` | No | `http://ollama:11434` | `server/services/ollama.service.ts` |
| `OLLAMA_MODEL` | No | `qwen2:0.5b` | `server/services/ollama.service.ts` |
| `MDIRECTOR_USERNAME` | No | `107843` | `server/services/mdirector.service.ts` |
| `MDIRECTOR_PASSWORD` | No | `<hash>` | `server/services/mdirector.service.ts` |
| `MDIRECTOR_FROM_EMAIL` | No | `info@vsmservices.ca` | `server/services/mdirector.service.ts` |
| `MDIRECTOR_FROM_NAME` | No | `VSM Services` | `server/services/mdirector.service.ts` |
| `MDIRECTOR_REPLY_TO` | No | `info@vsmservices.ca` | `server/services/mdirector.service.ts` |
| `MAPBOX_TOKEN` | No | `pk.eyJ1...` | `server/automation/cron-jobs.ts` |
| `OPTIMUS_URL` | No | `http://optimus-rutas:8000` | Server |
| `ONTARIO_SHEETS_ID` | No | `1su_tF9...` | `server/services/google-sheets.service.ts` |
| `QUEBEC_SHEETS_ID` | No | `1wP72JY...` | `server/services/google-sheets.service.ts` |
| `GOOGLE_SERVICE_ACCOUNT_CREDENTIALS` | No | `{"type":"service_account"...}` | `server/services/google-sheets.service.ts` |
| `AUTOMATION_SUBMIT_ENABLED` | No | `false` | `server/services/automation.service.ts` |
| `REGION_FILTER` | No | `QC` / `ON` | `server/utils/region-filter.ts` |
| `AGENT_SKIP_HOURS` | No | `true` | Server |
| `ANTHROPIC_API_KEY` | No | `sk-ant-...` | Server |
| `LOG_LEVEL` | No | `debug` | `server/lib/logger.ts` |
| `DISABLE_HMR` | No | `true` | `vite.config.ts` |

---

## 12. Base de Datos

### Motor

PostgreSQL 17, sin ORM. Se usa el driver `pg` directamente.

### Tablas (27 tablas)

| # | Tabla | Propósito | Filas aprox |
|---|-------|-----------|-------------|
| 1 | `users` | Usuarios del sistema | ~5 |
| 2 | `companies` | Empresas enriquecidas (CRM) | ~200 |
| 3 | `company_tech_stack` | Stack tecnológico de empresas | 0 |
| 4 | `jobs` | Vacantes de trabajo | ~1,000 |
| 5 | `job_required_skills` | Habilidades requeridas | 0 |
| 6 | `user_saved_jobs` | Jobs guardados por usuario | 0 |
| 7 | `candidates` | Candidatos | ~50 |
| 8 | `candidate_skills` | Habilidades de candidatos | 0 |
| 9 | `applications` | Postulaciones | 0 |
| 10 | `scraped_jobs` | Jobs legacy del scraper | 0 |
| 11 | `ontario_companies` | Empresas de Ontario | ~8,055 |
| 12 | `quebec_companies` | Empresas de Quebec | ~15,676 |
| 13 | `email_campaign_log` | Historial de campañas | Variable |
| 14 | `email_suppression` | Emails bloqueados | Variable |
| 15 | `campaign_config` | Config singleton de campañas | 1 |
| 16 | `mdirector_template_map` | Mapeo region+work → template | Variable |
| 17 | `service_templates` | Plantillas HTML de servicios | Variable |
| 18 | `application_queue` | Cola de postulaciones automáticas | 0 |
| 19 | `routes` | Rutas de visita | Variable |
| 20 | `route_stops` | Paradas de ruta | Variable |
| 21 | `automation_log` | Log de automatización | Variable |
| 22 | `automation_alerts` | Alertas de automatización | Variable |
| 23 | `email_logs` | Log de emails enviados | Variable |
| 24 | `candidates` (duck?) | — | — |
| 25+ | Tablas de sistema | Extensiones, enums | — |

### Diagrama ER

```mermaid
erDiagram
    users ||--o{ email_logs : sends
    users ||--o{ application_queue : creates
    users ||--o{ routes : creates
    users {
        uuid id PK
        varchar email UK
        varchar password_hash
        varchar first_name
        varchar last_name
        varchar role
        boolean is_active
    }

    companies ||--o{ jobs : has
    companies ||--o{ email_logs : receives
    companies ||--o{ route_stops : visited
    companies ||--o{ email_campaign_log : targeted
    companies ||--o{ company_tech_stack : has
    companies {
        uuid id PK
        varchar name
        varchar slug UK
        varchar industry
        varchar company_size
        varchar enrichment_status
        varchar tipo
        text website
        text description
        timestamp enriched_at
    }

    jobs ||--o{ applications : receives
    jobs ||--o{ application_queue : queued
    jobs ||--o{ job_required_skills : requires
    jobs {
        uuid id PK
        uuid company_id FK
        varchar title
        varchar source
        text url
        varchar location
        varchar service_type_id
        uuid province_id FK
        varchar province_source
        boolean is_active
    }

    candidates ||--o{ candidate_skills : has
    candidates ||--o{ applications : submits
    candidates {
        uuid id PK
        varchar name
        varchar email
        varchar status
        text bio
    }

    applications {
        uuid id PK
        uuid job_id FK
        uuid candidate_id FK
        varchar status
    }

    ontario_companies ||--o{ jobs : linked
    ontario_companies {
        uuid id PK
        text nombre
        text telefono
        text correo
        text direccion
        text work
        varchar enrichment_status
        float lat
        float lng
    }

    quebec_companies {
        uuid id PK
        text nombre
        text telefono
        text correo
        text direccion
        text work
        varchar enrichment_status
        float lat
        float lng
    }

    routes ||--o{ route_stops : contains
    routes {
        uuid id PK
        varchar name
        varchar status
        float total_distance_km
        uuid created_by FK
    }

    route_stops {
        uuid id PK
        uuid route_id FK
        uuid company_id FK
        int order_index
        varchar address
        float lat
        float lng
        varchar status
    }

    campaign_config ||--o{ email_campaign_log : configures
    campaign_config {
        uuid id PK
        int new_company_days
        int resend_interval_days
        boolean auto_enabled
        int auto_schedule_hour
    }

    email_campaign_log {
        uuid id PK
        uuid company_id FK
        varchar company_name
        varchar company_email
        varchar work_label
        varchar mdirector_campaign_id
        varchar status
        timestamp sent_at
    }
```

### Índices principales

| Índice | Tabla | Columnas | Tipo |
|--------|-------|----------|------|
| `idx_jobs_url` | jobs | url | B-tree |
| `idx_jobs_company_title_dedup` | jobs | raw_company_name, title | Único parcial (is_active) |
| `idx_ontario_companies_nombre_unique` | ontario_companies | LOWER(nombre) | Único parcial (!is_duplicate) |
| `idx_quebec_companies_nombre_unique` | quebec_companies | LOWER(nombre) | Único parcial (!is_duplicate) |
| `idx_routes_status` | routes | status | B-tree |
| `idx_route_stops_route_id` | route_stops | route_id | B-tree |
| `idx_ecl_company_id` | email_campaign_log | company_id | B-tree |
| `idx_ecl_sent_at` | email_campaign_log | sent_at | B-tree |
| `idx_email_suppression_email` | email_suppression | LOWER(email) | Único parcial |
| `idx_app_queue_status` | application_queue | status | B-tree |

### Migraciones

**Auto-migraciones** (en `server.ts:runMigrations()`):
- Idempotentes (`ALTER TABLE ADD COLUMN IF NOT EXISTS`)
- Se ejecutan cada vez que inicia el servidor
- Crean tablas, columnas, tipos enum, índices

**Migraciones manuales** (en `db/migrations/`):
| Archivo | Propósito |
|---------|-----------|
| `003_triggers_and_indexes.sql` | Índices adicionales + triggers |
| `004_normalize_addresses.sql` | Normalización de direcciones |
| `005_fix_address_assignments.sql` | Corrección de asignaciones |
| `006_fulltext_indexes.sql` | Índices de búsqueda全文 |

### Constraints

- `fk_companies_jobs: jobs.company_id → companies.id`
- `fk_routes_created_by: routes.created_by → users.id`
- `fk_route_stops_route_id: route_stops.route_id → routes.id ON DELETE CASCADE`
- `fk_route_stops_company_id: route_stops.company_id → companies.id`
- `UNIQUE(route_id, order_index)` en route_stops
- `UNIQUE(region, work_label)` en mdirector_template_map
- `CHECK (email IS NOT NULL OR domain IS NOT NULL)` en email_suppression

---

## 13. APIs

### Endpoints de Autenticación

| Método | Ruta | Auth | Servicio | Parámetros | Respuesta |
|--------|------|------|----------|------------|-----------|
| POST | `/api/auth/login` | Público | Login | `{email, password}` | `{token, user}` |
| POST | `/api/auth/setup` | Público | Setup | `{email, password, firstName, lastName}` | `{token, user}` |
| POST | `/api/auth/logout` | Público | — | — | `{success}` |
| GET | `/api/auth/me` | JWT | GetCurrentUser | — | `{user}` |
| PATCH | `/api/auth/profile` | JWT | UpdateProfile | `{firstName, lastName}` | `{user}` |
| PATCH | `/api/auth/password` | JWT | ChangePassword | `{currentPassword, newPassword}` | `{success}` |

### Endpoints de Usuarios

| Método | Ruta | Auth | Parámetros | Respuesta |
|--------|------|------|------------|-----------|
| GET | `/api/users` | Admin | — | `[users]` |
| POST | `/api/users` | Admin | `{email, password, firstName, lastName, role}` | `{user}` |
| PATCH | `/api/users/:id/role` | Admin | `{role}` | `{user}` |
| DELETE | `/api/users/:id` | Admin | — | `{success}` |

### Endpoints de Companies

| Método | Ruta | Auth | Parámetros | Respuesta |
|--------|------|------|------------|-----------|
| GET | `/api/companies` | JWT | `?includeUnenriched=1` | `[Company]` |
| GET | `/api/companies/:id` | JWT | — | `Company` |
| POST | `/api/companies` | Admin/Editor | `{name, legal_name?, website?, industry?}` | `Company` |
| PATCH | `/api/companies/:id` | Admin/Editor | Campos en allowlist | `{success}` |
| DELETE | `/api/companies/:id` | Admin | — | `{success}` |
| POST | `/api/gemini/enrich` | Admin/Editor | `{companyId, companyName}` | `{success, source, data}` |
| POST | `/api/enrichment/process-next` | JWT | — | `{companyId, data, remaining}` |
| GET | `/api/enrichment/status` | JWT | — | `{pending, processing, scraped, db_matched}` |
| POST | `/api/companies/export` | JWT | `{ids?, serviceId?}` | Excel file |
| PATCH | `/api/companies/:id/tipo` | JWT | `{tipo}` | `{success}` |
| POST | `/api/companies/:id/send-offer` | Admin/Editor | `{toEmail, employeeTypeId, subject, ...}` | `{success}` |
| GET | `/api/companies/:id/email-logs` | JWT | — | `[EmailLog]` |
| POST | `/api/companies/:id/suggest-services` | Admin/Editor | — | `{success, data}` |
| GET | `/api/companies/:id/suggest-services` | JWT | — | `{success, data, _cached}` |

### Endpoints de Campañas

| Método | Ruta | Auth | Parámetros | Respuesta |
|--------|------|------|------------|-----------|
| GET | `/api/campaigns/config` | Admin/Editor | — | Config |
| PATCH | `/api/campaigns/config` | Admin | Campos de config | `{success}` |
| GET | `/api/campaigns/preview` | Admin/Editor | — | Preview |
| POST | `/api/campaigns/send` | Admin | `{contacts}` | Result |
| GET | `/api/campaigns/history` | Admin/Editor | `?limit=N` | History |
| GET | `/api/campaigns/sheet-companies` | JWT | — | `{total, companies}` |

### Endpoints de Webhook

| Método | Ruta | Auth | Parámetros | Respuesta |
|--------|------|------|------------|-----------|
| POST | `/api/webhook/scraper` | WEBHOOK_SECRET | `{fuente, titulo, empresa, url_postulacion}` | `{success, isNew, province}` |
| POST | `/api/webhook/enrich` | WEBHOOK_SECRET | `{limit?, delay?, sync?}` | `{success, message, pid}` |
| GET | `/api/webhook/enrich/status` | JWT | — | `{running, lastRun}` |

### Endpoints de Sincronización

| Método | Ruta | Auth | Parámetros | Respuesta |
|--------|------|------|------------|-----------|
| POST | `/api/sync/scraped-jobs` | JWT | — | `{synced, newCompanies, message}` |

### Endpoints de Salud

| Método | Ruta | Auth | Parámetros | Respuesta |
|--------|------|------|------------|-----------|
| GET | `/api/health` | Público | — | `{status: 'ok'}` |

---

## 14. Dependencias Externas

| API Externa | Tipo | Propósito | Autenticación | Archivo |
|------------|------|-----------|---------------|---------|
| **Google Gemini** | AI | Enriquecimiento primario de empresas | API Key | `server/services/gemini.service.ts` |
| **Groq** | AI | Enriquecimiento fallback (rápido/barato) | API Key | `server/services/groq.service.ts` |
| **Ollama** | AI Local | Enriquecimiento offline | URL local | `server/services/ollama.service.ts` |
| **DuckDuckGo** | Web Search | Enriquecimiento último recurso | Sin auth | `server/services/websearch.service.ts` |
| **Wikipedia** | Web Search | Enriquecimiento último recurso | Sin auth | `server/services/websearch.service.ts` |
| **MDirector** | Email Marketing | Campañas de correo | OAuth2 (user/pass) | `server/services/mdirector.service.ts` |
| **Google Sheets** | Spreadsheets | Exportación de datos | Service Account JWT | `server/services/google-sheets.service.ts` |
| **Mapbox** | Geocoding | Geocodificación de direcciones | Token | `server/automation/cron-jobs.ts` |
| **Nominatim (OSM)** | Geocoding | Geocodificación fallback | Sin auth (User-Agent) | `server/automation/cron-jobs.ts` |
| **PostgreSQL** | Database | Persistencia principal | Connection string | `server/lib/config.ts` |
| **Optimus_rutas** | Route Optimization | Optimización de rutas | Interno (HTTP) | `Optimus_rutas/` |

### Cómo se conectan

**Google Gemini**: SDK `@google/genai` con API Key
```typescript
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
```

**Groq**: API REST compatible con OpenAI
```typescript
fetch('https://api.groq.com/openai/v1/chat/completions', {
  headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }
});
```

**MDirector**: OAuth2 + REST API
```typescript
// Autenticación
POST https://app.mdirector.com/oauth2/token {username, password, grant_type}
// Operaciones
POST https://api.mdirector.com/api_list       (crear listas)
POST https://api.mdirector.com/api_campaign    (crear campañas)
POST https://api.mdirector.com/api_subscriber  (suscriptores)
POST https://api.mdirector.com/api_delivery    (envíos)
```

**Google Sheets**: Service Account JWT + googleapis SDK
```typescript
const auth = new JWT({ email, key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const sheets = google.sheets({ version: 'v4', auth });
```

**Mapbox**: REST API con token en querystring
```typescript
const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${MAPBOX_TOKEN}`;
```

**Optimus_rutas**: HTTP directo (localhost:8000 en Docker)
```typescript
const OPTIMUS_URL = process.env.OPTIMUS_URL || 'http://optimus-rutas:8000';
```

---

## 15. Flujo Completo del Sistema

### Ruta completa de un dato: desde el webhook hasta el frontend

```mermaid
flowchart LR
    A[Scraper Externo] -->|Webhook POST| B(Webhook Route)
    B --> C{¿Empresa existe?}
    C -->|No| D[Crear en provincia table]
    C -->|Sí| E[Usar companyId existente]
    D --> F[Insertar job]
    E --> F
    F --> G[Job Classifier<br/>clasifica en background]
    G --> H[(PostgreSQL)]
    
    H --> I{Cron FastSync<br/>cada 5 min}
    I -->|jobs sin province_id| J[Vincular a provincia]
    J --> H
    
    H --> K{Cron Enrichment<br/>cada 8s}
    K --> L[EnrichmentService]
    L --> M[AI Provider Chain]
    M --> N[Gemini → Groq → Ollama → WebSearch]
    N --> O[Actualizar datos empresa]
    O --> H
    
    H --> P{Cron Workflow<br/>08:00 / 20:00}
    P --> Q[exportToSheets]
    Q --> R[Google Sheets]
    
    H --> S{API Request<br/>Frontend}
    S -->|GET /api/campaigns/sheet-companies| T[Empresas del Sheet + BD]
    S -->|GET /api/jobs| U[Lista de vacantes]
    T --> V[React UI]
    U --> V
```

### Ciclo de vida de una empresa

```
Webhook recibe scraper job
  → findCompanyInBothTables() busca en ontario/quebec_companies
  → Si no existe: enrichAndInsertCompany() la crea con enrichment_status='pending'
  → Se inserta el job vinculado a esa empresa
  → FastSync cada 5 min: jobs con province_id IS NULL → los vincula
  → Enrichment cada 8s: toma empresa pending → AI enrichment → datos actualizados
  → Workflow 08/20 UTC: requeue → sync → enrich → copy → export
  → Campaign automation: empresa elegible → recibe email marketing
  → Geocoding: si no tiene lat/lng → se geocodifica
```

---

## 16. Mapa Completo de Dependencias

### Estructura de archivos con dependencias

```
server.ts
├── server/lib/config.ts          (dotenv, pg.Pool)
├── server/lib/logger.ts           (pino)
├── server/middleware/auth.middleware.ts   (jsonwebtoken, pg)
├── server/middleware/request-id.middleware.ts
├── server/middleware/audit-log.middleware.ts
├── server/middleware/request-logger.middleware.ts
├── server/automation/cron-jobs.ts
│   ├── server/services/campaign-automation.service.ts
│   │   ├── server/services/mdirector.service.ts
│   │   └── server/data/mdirectorSegments.ts
│   ├── server/services/workflow.service.ts
│   │   ├── server/services/enrichment.service.ts
│   │   ├── server/services/job-classifier.service.ts
│   │   ├── server/utils/slug.ts
│   │   └── server/utils/region-filter.ts
│   ├── server/utils/slug.ts
│   └── server/services/enrichment.service.ts
│       └── server/services/providers/
│           ├── ProviderChain.ts
│           ├── GeminiProvider.ts  → server/services/gemini.service.ts
│           ├── GroqProvider.ts    → server/services/groq.service.ts
│           ├── OllamaProvider.ts  → server/services/ollama.service.ts
│           └── WebSearchProvider.ts → server/services/websearch.service.ts
│
├── server/routes/*.routes.ts (15 archivos)
│   ├── server/middleware/auth.middleware.ts
│   ├── server/services/*.service.ts
│   ├── server/lib/config.ts
│   ├── server/data/serviceTypes.ts
│   ├── server/utils/region-filter.ts
│   └── server/utils/*.ts (varios)
│
└── server/infrastructure/database/*.ts
    └── server/domain/*/*.ts (entidades e interfaces)

src/ (Frontend)
├── src/main.tsx → src/App.tsx
├── src/App.tsx
│   ├── src/contexts/AuthContext.tsx
│   ├── src/services/apiClient.ts
│   ├── src/components/*.tsx (todos los componentes)
│   ├── src/types.ts
│   └── server/services/apiClient.ts
└── src/index.css (Tailwind)

Optimus_rutas/ (Microservicio Python)
├── app/main.py → app/routes/* → app/services/* → app/repositories/*
└── app/utils/database.py → PostgreSQL (asyncpg)
```

---

## 17. Guía para Nuevo Desarrollador

### Paso a Paso

#### 1. Clonar el proyecto

```bash
git clone <repo-url> cantrack
cd cantrack
```

#### 2. Instalar dependencias

```bash
npm install
```

Esto instala todas las dependencias de `package.json` (producción + desarrollo).

#### 3. Configurar variables de entorno

```bash
cp .env.example .env
```

Editar `.env` con al menos:

```env
# Mínimo requerido para arrancar
DATABASE_URL=postgresql://user:password@localhost:5432/cantrack
JWT_SECRET=<generar con: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">

# Opcionales pero recomendados
GEMINI_API_KEY=your-key-here
GROQ_API_KEY=your-key-here
```

#### 4. Inicializar base de datos

Opción A — PostgreSQL local:
```bash
createdb cantrack
psql -d cantrack -f db/schema.sql
psql -d cantrack -f db/seed.sql
```

Opción B — Script Node:
```bash
npx tsx scripts/init-db.mjs
```

#### 5. Verificar conexión

```bash
npx tsx scripts/check-db.mjs
```

#### 6. Iniciar backend

```bash
npm run dev
```

Esto arranca:
- Express en `http://localhost:3000`
- Cron jobs en background
- Vite dev server integrado

#### 7. Setup inicial

Abrir `http://localhost:3000/setup` y crear el primer usuario administrador.

#### 8. Verificar health

```bash
curl http://localhost:3000/api/health
# → {"status": "ok"}
```

#### 9. Ejecutar tests

```bash
npm test          # 104 tests
npm run lint      # 0 errores TypeScript
```

#### 10. Usar Docker (opcional)

```bash
docker-compose up -d
```

Esto levanta:
- CanTrack CRM en `:3000`
- Optimus_rutas en `:8000`
- Ollama en `:11434`

Requiere PostgreSQL externo (CasaOS o configurar local).

#### 11. Probar scraping

Simular webhook:
```bash
curl -X POST http://localhost:3000/api/webhook/scraper \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: tu-secret" \
  -d '{
    "fuente": "linkedin",
    "titulo": "Software Engineer",
    "empresa": "Test Corp",
    "url_postulacion": "https://linkedin.com/jobs/view/123"
  }'
```

#### 12. Ver sincronización

```bash
curl http://localhost:3000/api/sync/scraped-jobs \
  -H "Authorization: Bearer <token>"
```

#### 13. Ver enrichment queue

```bash
curl http://localhost:3000/api/enrichment/status \
  -H "Authorization: Bearer <token>"
# → {"pending": 0, "processing": 0, "scraped": 55, "db_matched": 0}
```

#### 14. Ver logs en tiempo real

```bash
# El servidor usa pino-pretty en desarrollo — logs coloreados en consola
# Para Docker:
docker-compose logs -f app
```

### Verificación de que todo funciona

- [ ] `npm run lint` → 0 errors
- [ ] `npm test` → 104 passed
- [ ] `curl localhost:3000/api/health` → 200 OK
- [ ] Login en browser → dashboard visible
- [ ] Webhook → job creado en BD
- [ ] Sincronización → empresa vinculada
- [ ] Enrichment → datos enriquecidos
- [ ] Services listados en frontend

---

## Apéndice A: Comandos Útiles

```bash
# Desarrollo
npm run dev              # Iniciar servidor
npm test                 # Tests
npm run lint             # Type-check

# BD
npx tsx scripts/check-db.mjs          # Verificar conexión
npx tsx scripts/check-status.ts       # Estado del sistema
npx tsx scripts/enrich-companies.ts   # Enriquecer companies manual
npx tsx scripts/export-to-excel.ts    # Exportar a Excel
npx tsx scripts/export-to-sheets.ts   # Exportar a Google Sheets

# Docker
docker-compose up -d     # Iniciar servicios
docker-compose logs -f   # Ver logs
docker-compose down      # Detener servicios

# SSH Tunnel (para BD remota)
python tunnel.py         # O: ssh -L 5434:127.0.0.1:5432 root@187.124.237.242 -N
```

---

## Apéndice B: Posibles Problemas y Soluciones

| Problema | Causa | Solución |
|----------|-------|----------|
| Server no arranca | `JWT_SECRET` no configurado | Generar con crypto.randomBytes(64).toString('hex') |
| BD connection failed | `DATABASE_URL` incorrecta o PostgreSQL no disponible | Verificar credenciales, crear BD |
| CORS errors | `ALLOWED_ORIGINS` no incluye el origen del frontend | Agregar URL al .env |
| AI enrichment no funciona | API keys no configuradas o cuota agotada | Verificar GEMINI_API_KEY / GROQ_API_KEY |
| MDirector campaigns fallan | Credenciales incorrectas | Verificar MDIRECTOR_USERNAME/PASSWORD |
| Geocoding no avanza | MAPBOX_TOKEN no configurado | Usa Nominatim (1 req/s) — más lento |
| TypeScript errors | Import sin extensión `.js` | Agregar `.js` a imports locales (ESM requirement) |
| Tests fallan | DATABASE_URL no configurada para tests de integración | Configurar BD de test |
| Docker no conecta a BD | Red `postgresql_default` no existe | Crear red externa o cambiar configuración |
