# CanTrack CRM — Documentación Técnica

> Última actualización: 24 de marzo de 2026

---

## 1. Visión General

CanTrack CRM es un sistema SaaS de seguimiento de empleo y auto-aplicación. Consume vacantes de un **scraper externo** que alimenta la BD directamente, enriquece automáticamente los datos de las empresas usando **Gemini AI**, y expone todo en un frontend React.

### Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + Vite + TailwindCSS + Framer Motion |
| Backend | Express (Node.js) vía `npx tsx server.ts` |
| Base de datos | PostgreSQL (servidor remoto `187.124.237.242`) |
| AI | Google Gemini API (`gemini-2.0-flash-lite`) |
| Auth | JWT (`jsonwebtoken`) + bcryptjs |
| ORM | `pg` (driver nativo, queries SQL directas) |

---

## 2. Infraestructura

### Acceso a la Base de Datos

La BD está en un servidor remoto y se accede mediante **túnel SSH**:

```bash
# Activar túnel (dejar corriendo en background)
ssh -L 5434:127.0.0.1:5433 root@187.124.237.242 -N

# El servidor Node se conecta via:
DATABASE_URL=postgresql://casaos:casaos@127.0.0.1:5434/casaos
```

> **IMPORTANTE:** El túnel SSH debe estar activo antes de arrancar el servidor.

### Variables de entorno (`.env`)

```env
DATABASE_URL=postgresql://casaos:casaos@127.0.0.1:5434/casaos
JWT_SECRET=<clave-secreta-jwt>
WEBHOOK_SECRET=<clave-para-webhook-del-scraper>
GEMINI_API_KEY=<clave-api-gemini>
```

### Arrancar el servidor

```bash
npx tsx server.ts
# Puerto: 3000 (API + Frontend Vite en el mismo proceso)
```

---

## 3. Esquema de Base de Datos

### Tablas principales

#### `scraped_jobs` — Tabla legada del scraper (nombre original: `jobs`)
> Fue renombrada para liberar el nombre `jobs` al CRM.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | SERIAL | Clave primaria |
| `fuente` | VARCHAR | `linkedin`, `indeed`, etc. |
| `titulo` | TEXT | Título del puesto |
| `empresa` | TEXT | Nombre de la empresa (texto libre) |
| `url_postulacion` | TEXT | URL de la vacante |
| `keyword` | VARCHAR | Palabra clave usada para el scraping |
| `fecha_creacion` | TIMESTAMP | Cuándo fue scrapeada |

#### `jobs` — Tabla CRM de vacantes

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | UUID | Clave primaria |
| `company_id` | UUID (FK) | Empresa asociada. `NULL` = aún no vinculada |
| `raw_company_name` | VARCHAR(255) | Nombre de empresa tal como vino del scraper |
| `title` | VARCHAR(255) | Título del puesto |
| `source` | `job_source_enum` | `linkedin` \| `indeed` \| `glassdoor` \| `company_website` \| `other` |
| `url` | TEXT | URL de postulación (único implicito por sync) |
| `location` | VARCHAR | Ubicación (nullable) |
| `country` | VARCHAR | País (nullable) |
| `category` | VARCHAR | Categoría (nullable) |
| `application_type` | VARCHAR | Tipo de aplicación (nullable) |
| `is_easy_apply` | BOOLEAN | ¿Tiene Easy Apply? |
| `is_active` | BOOLEAN | Soft-delete |
| `created_at` / `updated_at` | TIMESTAMP TZ | Auditoría |

> **`raw_company_name`** fue añadida mediante migración (`scripts/migrate-add-raw-company.mjs`). Permite que el scraper inserte vacantes sin conocer el UUID de la empresa.

#### `companies` — Tabla de empresas

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | UUID | Clave primaria |
| `name` | VARCHAR(255) | Nombre normalizado |
| `slug` | VARCHAR(255) UNIQUE | Identificador URL-safe (sin acentos) |
| `legal_name` | VARCHAR | Razón social |
| `industry` | VARCHAR | Industria (ej. "Technology") |
| `sector` | VARCHAR | Sector (ej. "Software") |
| `company_size` | VARCHAR | Rango: `"1-10"` … `"10001+"` |
| `is_publicly_traded` | BOOLEAN | ¿Cotiza en bolsa? |
| `stock_ticker` | VARCHAR | Ticker bursátil |
| `hq_city` / `hq_province` / `hq_country` | VARCHAR | Ubicación HQ |
| `exact_address` | TEXT | Dirección completa |
| `website` | VARCHAR | URL oficial |
| `description` | TEXT | Descripción (2-3 frases, generada por Gemini) |
| `known_ats_portal` | VARCHAR | Portal ATS conocido |
| `confidence_score` | INTEGER (0-100) | Confianza del enriquecimiento |
| `needs_manual_review` | BOOLEAN | `true` si `confidence_score < 60` |
| `enrichment_status` | `enrichment_status_enum` | Estado del enriquecimiento |
| `enriched_at` | TIMESTAMP TZ | Cuándo fue enriquecida |

**`enrichment_status_enum` valores:**

| Valor | Significado |
|-------|-------------|
| `pending` | Recién creada, aún no procesada |
| `processing` | El queue la está procesando ahora mismo |
| `db_matched` | Ya tenía datos en BD (no se llamó a Gemini) |
| `scraped` | Enriquecida exitosamente por Gemini |
| `verified` | Revisada y aprobada manualmente |
| `failed` | Gemini falló y requiere revisión |

---

## 4. Flujo de Datos End-to-End

```
┌──────────────────────────────────────────────────────────────────┐
│  SCRAPER EXTERNO (otro servidor)                                 │
│                                                                  │
│  INSERT INTO jobs (title, source, url, raw_company_name)         │
│  -- company_id queda NULL, el CRM lo resuelve automáticamente    │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼ cada 10 segundos
┌──────────────────────────────────────────────────────────────────┐
│  POST /api/sync/scraped-jobs  (llamado desde App.tsx)            │
│                                                                  │
│  1. Lee jobs WHERE company_id IS NULL AND raw_company_name ≠ ''  │
│  2. Por cada vacante sin vincular:                               │
│     a) Genera slug desde raw_company_name (normalizado)          │
│     b) ¿Existe la empresa en companies por slug?                 │
│        → SÍ: obtiene el UUID                                     │
│        → NO: crea company (status = 'pending') y obtiene UUID    │
│     c) UPDATE jobs SET company_id = <uuid>                       │
│                                                                  │
│  3. También absorbe scraped_jobs legados no migrados (fallback)  │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼ companies con status = 'pending'
┌──────────────────────────────────────────────────────────────────┐
│  POST /api/enrichment/process-next  (queue desde App.tsx)        │
│                                                                  │
│  1. Toma UNA empresa pending (FOR UPDATE SKIP LOCKED)            │
│  2. Marca como 'processing'                                      │
│  3. ¿Ya tiene industry/website/description?                      │
│     → SÍ: marca 'db_matched', no llama a Gemini                  │
│     → NO: llama GeminiService.enrichCompany(name)               │
│  4. Guarda los datos en companies                                │
│  5. Marca 'scraped' (o 'failed' si Gemini falla)                │
│  6. Responde { done: false, data, remaining }                    │
│                                                                  │
│  App.tsx espera 1.5s y llama de nuevo hasta done: true           │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  GET /api/jobs  →  Frontend muestra vacantes + datos de empresa  │
│                                                                  │
│  SELECT j.*, COALESCE(c.name, j.raw_company_name) AS company_name│
│         c.industry, c.website, c.enrichment_status, ...         │
│  FROM jobs j LEFT JOIN companies c ON j.company_id = c.id        │
│  -- LEFT JOIN: también muestra vacantes aún no vinculadas        │
└──────────────────────────────────────────────────────────────────┘
```

---

## 5. API REST

### Autenticación

Todos los endpoints protegidos requieren header:
```
Authorization: Bearer <jwt_token>
```

Los tokens expiran en **8 horas**.

---

### Auth

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| `POST` | `/api/auth/setup` | No | Crea el primer admin (solo si no hay usuarios) |
| `POST` | `/api/auth/login` | No | Login. Devuelve `{ token, user }` |
| `GET` | `/api/auth/me` | Sí | Datos del usuario autenticado |
| `PATCH` | `/api/auth/profile` | Sí | Actualizar nombre |
| `POST` | `/api/auth/change-password` | Sí | Cambiar contraseña |

---

### Jobs (Vacantes)

| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| `GET` | `/api/jobs` | Todos | Lista todas las vacantes activas con datos de empresa (LEFT JOIN) |
| `GET` | `/api/jobs/:id` | Todos | Detalle de una vacante |
| `POST` | `/api/jobs` | admin, editor | Crear vacante. Acepta `company_id` O `raw_company_name` |
| `PATCH` | `/api/jobs/:id` | admin, editor | Actualizar campos de la vacante |
| `DELETE` | `/api/jobs/:id` | admin, editor | Soft-delete (`is_active = false`) |

**`POST /api/jobs` — dos modos:**

```jsonc
// Modo A: con empresa ya conocida
{
  "company_id": "uuid",
  "title": "Senior Dev",
  "source": "linkedin",
  "url": "https://..."
}

// Modo B: scraper sin UUID (el sync lo vinculará)
{
  "raw_company_name": "Quala",
  "title": "Ing. de Sistemas",
  "source": "linkedin",
  "url": "https://..."
}
```

---

### Companies (Empresas)

| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| `GET` | `/api/companies` | Todos | Lista todas las empresas |
| `GET` | `/api/companies/:id` | Todos | Detalle de una empresa |
| `POST` | `/api/companies` | admin, editor | Crear empresa manualmente |
| `PATCH` | `/api/companies/:id` | admin, editor | Actualizar campos (allowlist segura) |
| `DELETE` | `/api/companies/:id` | admin | Eliminar (falla si tiene jobs asociados) |

---

### Sincronización y Enriquecimiento

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| `POST` | `/api/sync/scraped-jobs` | Sí | Vincula vacantes sin `company_id` y absorbe `scraped_jobs` legacy |
| `POST` | `/api/enrichment/process-next` | Sí | Procesa UNA empresa `pending` con Gemini |
| `GET` | `/api/enrichment/status` | Sí | Conteo por status de enriquecimiento |
| `POST` | `/api/gemini/enrich` | admin, editor | Enriquece una empresa específica por ID |

---

### Webhook (Scraper externo)

```
POST /api/webhook/scraper
Header: x-webhook-secret: <WEBHOOK_SECRET>

Body:
{
  "fuente": "linkedin",
  "titulo": "Ing. de Sistemas",
  "empresa": "Quala",
  "url_postulacion": "https://..."
}
```

El scraper puede usar este endpoint **o** insertar directamente en la tabla `jobs` via SQL. Ambos caminos son soportados.

---

### Stats

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| `GET` | `/api/stats` | Sí | Conteos reales del dashboard |

**Respuesta:**
```json
{
  "total_jobs": 2968,
  "total_companies": 799,
  "enriched_companies": 234,
  "pending_enrichment": 565,
  "needs_review": 12,
  "total_applications": 0
}
```

---

## 6. Seguridad

| Medida | Implementación |
|--------|---------------|
| SQL injection | Parameterized queries (`$1, $2, ...`) + column allowlist |
| Auth | JWT verificado en cada request protegido |
| Rate limiting | Login: 10 req/15min — Setup: 3 req/hora |
| Roles | `admin` > `editor` > `recruiter` |
| Webhook | Header `x-webhook-secret` obligatorio |
| Passwords | `bcrypt` con 12 rounds de salt |

**Column allowlists** (previenen escritura arbitraria en PATCH):

```typescript
ALLOWED_COMPANY_COLUMNS = { enrichment_status, industry, sector, hq_city, hq_province,
  hq_country, exact_address, website, description, known_ats_portal, confidence_score,
  needs_manual_review, company_size, is_publicly_traded, stock_ticker, legal_name, name }

ALLOWED_JOB_COLUMNS = { title, url, location, country, category,
  application_type, is_easy_apply, is_active, raw_company_name }
```

---

## 7. Frontend — Estado y Polling

```
App.tsx (AppContent)
│
├── Estado global: jobs[], companies[], enrichingIds, isLoading
│
├── useEffect — fetchData() cada 10 segundos:
│   1. POST /api/sync/scraped-jobs   ← absorbe vacantes nuevas del scraper
│   2. GET /api/jobs                 ← carga vacantes con datos de empresa
│   3. GET /api/companies            ← carga empresas
│
└── useEffect — Enrichment queue:
    - Se activa cuando hay companies con enrichmentStatus = 'pending'
    - Llama POST /api/enrichment/process-next en loop
    - Espera 1.5s entre llamadas para no saturar Gemini
    - Actualiza el estado local con los datos devueltos
```

---

## 8. Servicio Gemini

**Archivo:** `server/services/gemini.service.ts`

- Modelo: `gemini-2.0-flash-lite`
- Patrón lazy singleton: solo instancia `GoogleGenAI` si `GEMINI_API_KEY` está presente
- Si la cuota se agota (HTTP 429) o el modelo falla, devuelve `{ confidence_score: 0 }` sin romper el queue

**Datos que retorna por empresa:**

```typescript
{
  industry: string,          // "Technology", "Manufacturing", etc.
  sector: string,            // "Software", "Consumer Goods", etc.
  company_size: string,      // "51-200", "1001-5000", etc.
  hq_city: string,
  hq_country: string,
  website: string,           // "https://..."
  description: string,       // 2-3 frases
  is_publicly_traded: boolean,
  confidence_score: number   // 0-100
}
```

---

## 9. Scripts de Utilidad

| Script | Descripción |
|--------|-------------|
| `scripts/check-db.mjs` | Muestra conteo de filas por tabla y muestra de `scraped_jobs` |
| `scripts/check-schema.mjs` | Muestra columnas de `jobs` y `scraped_jobs` con muestra de datos |
| `scripts/migrate-enum.mjs` | Añade `processing` y `db_matched` al enum (ya ejecutado) |
| `scripts/migrate-scraped-jobs.mjs` | Migró `scraped_jobs` → `companies` + `jobs` (ya ejecutado) |
| `scripts/migrate-add-raw-company.mjs` | Añade `raw_company_name` a `jobs` y hace backfill (ya ejecutado) |

---

## 10. Estado Actual de la BD

| Tabla | Filas | Notas |
|-------|-------|-------|
| `jobs` | 2968 | Todas con `company_id` y `raw_company_name` |
| `companies` | 799 | Creadas desde `scraped_jobs` — mayoría `pending` |
| `scraped_jobs` | 2968 | Tabla legada, conservada por compatibilidad |
| `users` | 1 | Admin inicial |

---

## 11. Pendiente / Roadmap

| Feature | Estado |
|---------|--------|
| Módulo Candidatos | Datos mock — pendiente implementación real |
| Auto-Apply (Playwright) | `AutomationService` simulado — pendiente bot real |
| Notificaciones enriquecimiento | No implementado |
| Paginación en `/api/jobs` | No implementado (carga todo) |
| Índice en `jobs.url` | Recomendado para la query de sync |
