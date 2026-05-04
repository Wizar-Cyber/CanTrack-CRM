-- ═══════════════════════════════════════════════════════════════════════
-- CanTrack CRM — Schema completo
-- Ejecutar en la BD: casaos (vía tunnel SSH)
-- Para aplicar: psql "postgresql://casaos:casaos@127.0.0.1:5434/casaos" -f db/schema.sql
-- ═══════════════════════════════════════════════════════════════════════

-- ── 0. Renombrar tabla del scraper para preservar datos ───────────────────────
ALTER TABLE IF EXISTS jobs RENAME TO scraped_jobs;

-- ── 1. Extensiones y tipos ENUM ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$ BEGIN
    CREATE TYPE enrichment_status_enum AS ENUM ('pending', 'processing', 'db_matched', 'scraped', 'verified', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Migración: agregar valores nuevos al enum si ya existe (idempotente)
DO $$ BEGIN
    ALTER TYPE enrichment_status_enum ADD VALUE IF NOT EXISTS 'processing';
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
    ALTER TYPE enrichment_status_enum ADD VALUE IF NOT EXISTS 'db_matched';
EXCEPTION WHEN others THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE application_status_enum AS ENUM ('Saved', 'Applied', 'Interview', 'Offer', 'Rejected', 'Placed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE candidate_status_enum AS ENUM ('Available', 'Interviewing', 'Placed', 'Inactive');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE job_source_enum AS ENUM ('linkedin', 'indeed', 'glassdoor', 'company_website', 'other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Crear tablas si no existen
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role VARCHAR(50) DEFAULT 'recruiter',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    legal_name VARCHAR(255),
    industry VARCHAR(100),
    company_size VARCHAR(50),
    hq_city VARCHAR(100),
    hq_province VARCHAR(100),
    hq_country VARCHAR(100),
    exact_address TEXT,
    phone VARCHAR(60),
    contact_email VARCHAR(255),
    website VARCHAR(255),
    description TEXT,
    known_ats_portal VARCHAR(100),
    enrichment_status enrichment_status_enum DEFAULT 'pending',
    enriched_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ── Migration: adjust companies table if already exists ───────────────────────
-- Remove obsolete columns (safe: IF EXISTS)
ALTER TABLE companies DROP COLUMN IF EXISTS sector;
ALTER TABLE companies DROP COLUMN IF EXISTS is_publicly_traded;
ALTER TABLE companies DROP COLUMN IF EXISTS stock_ticker;
ALTER TABLE companies DROP COLUMN IF EXISTS confidence_score;
ALTER TABLE companies DROP COLUMN IF EXISTS needs_manual_review;
-- Add new columns if they don't exist yet
ALTER TABLE companies ADD COLUMN IF NOT EXISTS phone VARCHAR(60);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255);

CREATE TABLE IF NOT EXISTS company_tech_stack (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    technology VARCHAR(100) NOT NULL,
    UNIQUE(company_id, technology)
);

CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE RESTRICT,
    title VARCHAR(255) NOT NULL,
    source job_source_enum NOT NULL,
    url TEXT NOT NULL,
    location VARCHAR(255),
    country VARCHAR(50),
    category VARCHAR(100),
    application_type VARCHAR(50),
    is_easy_apply BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS job_required_skills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    skill VARCHAR(100) NOT NULL,
    UNIQUE(job_id, skill)
);

CREATE TABLE IF NOT EXISTS user_saved_jobs (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    is_favorite BOOLEAN DEFAULT true,
    saved_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, job_id)
);

CREATE TABLE IF NOT EXISTS candidates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    role VARCHAR(150),
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(50),
    location VARCHAR(255),
    linkedin_url VARCHAR(255),
    resume_url TEXT,
    years_of_experience INTEGER,
    status candidate_status_enum DEFAULT 'Available',
    bio TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS candidate_skills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id UUID REFERENCES candidates(id) ON DELETE CASCADE,
    skill VARCHAR(100) NOT NULL,
    UNIQUE(candidate_id, skill)
);

CREATE TABLE IF NOT EXISTS applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID REFERENCES jobs(id) ON DELETE RESTRICT,
    candidate_id UUID REFERENCES candidates(id) ON DELETE RESTRICT,
    status application_status_enum DEFAULT 'Applied',
    applied_date DATE DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(job_id, candidate_id)
);

-- Tabla de datos crudos del scraper (preserva el histórico de scraping)
CREATE TABLE IF NOT EXISTS scraped_jobs (
    id SERIAL PRIMARY KEY,
    fuente VARCHAR(50),
    titulo TEXT,
    empresa TEXT,
    url_postulacion TEXT,
    keyword VARCHAR(100),
    fecha_creacion TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- ── Tabla: Ontario Companies (Datos importados de Excel)
-- Contiene base de datos de empresas de Ontario, Canadá
CREATE TABLE IF NOT EXISTS ontario_companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(255) NOT NULL,
    telefono VARCHAR(20),
    tipo VARCHAR(100),
    correo VARCHAR(255),
    direccion TEXT,
    provincia VARCHAR(100),
    region VARCHAR(100),
    ciudad VARCHAR(100),
    pueblo VARCHAR(100),
    work VARCHAR(100),
    descripcion TEXT,
    dominio_de_pagina VARCHAR(255),
    lista_de_llamadas TEXT,
    is_duplicate BOOLEAN DEFAULT FALSE,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índice para buscar por nombre (case-insensitive, para validar duplicados)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ontario_companies_nombre_unique 
    ON ontario_companies (LOWER(TRIM(nombre))) 
    WHERE is_duplicate = FALSE;

-- 3. Insertar las empresas (UPSERT para evitar duplicados)
INSERT INTO companies (name, slug, enrichment_status) VALUES
('Quala', 'quala', 'pending'),
('Sezzle', 'sezzle', 'pending'),
('MixRank', 'mixrank', 'pending'),
('NielsenIQ', 'nielseniq', 'pending'),
('Empresa Confidencial', 'empresa-confidencial', 'pending'),
('BairesDev', 'bairesdev', 'pending'),
('Positivo S+ Latam', 'positivo-s-latam', 'pending'),
('Inetum', 'inetum', 'pending'),
('Mindrift', 'mindrift', 'pending'),
('Centro Colombo Americano', 'centro-colombo-americano', 'pending'),
('Ayesa Colombia', 'ayesa-colombia', 'pending'),
('Canals', 'canals', 'pending'),
('Fusemachines', 'fusemachines', 'pending'),
('Lean Solutions Group', 'lean-solutions-group', 'pending'),
('Finaktiva', 'finaktiva', 'pending'),
('KAESER Compresores de Colombia S.A.S.', 'kaeser-compresores-de-colombia-s-a-s', 'pending'),
('Banco de Bogotá', 'banco-de-bogota', 'pending'),
('Inter Rapidísimo', 'inter-rapidisimo', 'pending'),
('Scotiabank', 'scotiabank', 'pending'),
('Banco Santander Colombia', 'banco-santander-colombia', 'pending'),
('SUMIMEDICAL SAS', 'sumimedical-sas', 'pending'),
('Asesoftware', 'asesoftware', 'pending'),
('Solvo Global Careers', 'solvo-global-careers', 'pending'),
('Universia Colombia', 'universia-colombia', 'pending'),
('Chaneme Comercial', 'chaneme-comercial', 'pending'),
('Grupo Falabella', 'grupo-falabella', 'pending'),
('Fracttal', 'fracttal', 'pending'),
('INDI Staffing Services', 'indi-staffing-services', 'pending'),
('Tracker de Colombia SAS - Gestión Humana', 'tracker-de-colombia-sas-gestion-humana', 'pending'),
('Aspen Pharma Group', 'aspen-pharma-group', 'pending'),
('POSTOBON S.A.', 'postobon-s-a', 'pending'),
('Avanzar Soluciones Financieras', 'avanzar-soluciones-financieras', 'pending'),
('LA ASCENSIÓN S.A.', 'la-ascension-s-a', 'pending'),
('Rootstrap', 'rootstrap', 'pending'),
('Worldpanel', 'worldpanel', 'pending'),
('CloudKitchens', 'cloudkitchens', 'pending'),
('symphony.is', 'symphony-is', 'pending'),
('AXA COLPATRIA', 'axa-colpatria', 'pending'),
('cloudFleet', 'cloudfleet', 'pending'),
('Rappi', 'rappi', 'pending'),
('JGB S.A.', 'jgb-s-a', 'pending'),
('Selpe Vagas', 'selpe-vagas', 'pending'),
('Inetum Colombia', 'inetum-colombia', 'pending'),
('Fygaro', 'fygaro', 'pending'),
('Wizeline', 'wizeline', 'pending'),
('Inetum Espana sucursal en Colombia', 'inetum-espana-sucursal-en-colombia', 'pending'),
('NGDS', 'ngds', 'pending'),
('FLEX PEEPS', 'flex-peeps', 'pending'),
('SoftwareOne', 'softwareone', 'pending'),
('Vikara.AI', 'vikara-ai', 'pending'),
('FiscalNote', 'fiscalnote', 'pending'),
('Digitalprogit', 'digitalprogit', 'pending'),
('TripleTen', 'tripleten', 'pending'),
('EPAM Systems, Inc.', 'epam-systems-inc', 'pending'),
('Stefanini Latam', 'stefanini-latam', 'pending')
ON CONFLICT (slug) DO NOTHING;

-- 4. Insertar las vacantes (Usando subqueries para obtener el ID de la empresa)
INSERT INTO jobs (company_id, title, source, url) VALUES
((SELECT id FROM companies WHERE slug = 'quala'), 'Recién egresados ¡Oportunidad para ingenieros de sistemas!', 'linkedin', 'https://co.linkedin.com/jobs/view/reci%C3%A9n-egresados-%C2%A1oportunidad-para-ingenieros-de-sistemas%21-at-quala-4360486345?position=1&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=7Rj%2F%2BfViG51xNmYCpgLEKw%3D%3D'),
((SELECT id FROM companies WHERE slug = 'sezzle'), 'Junior Software Engineer (Colombia)', 'linkedin', 'https://co.linkedin.com/jobs/view/junior-software-engineer-colombia-at-sezzle-4271082569?position=2&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=VH%2BuUHQcbMXi%2BpZ3spdt8Q%3D%3D'),
((SELECT id FROM companies WHERE slug = 'mixrank'), 'Junior Software Engineer - Remote (Colombia), Full-Time', 'linkedin', 'https://co.linkedin.com/jobs/view/junior-software-engineer-remote-colombia-full-time-at-mixrank-4385787948?position=3&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=W9Ng7EDWmXdWd1lPGNORfg%3D%3D'),
((SELECT id FROM companies WHERE slug = 'nielseniq'), 'Revenue Intelligence Analyst', 'linkedin', 'https://co.linkedin.com/jobs/view/revenue-intelligence-analyst-at-nielseniq-4385921836?position=4&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=S2lXcK6Wt6xDQPPAyQYj5g%3D%3D'),
((SELECT id FROM companies WHERE slug = 'empresa-confidencial'), 'Analista de datos financieros', 'linkedin', 'https://co.linkedin.com/jobs/view/analista-de-datos-financieros-at-empresa-confidencial-4386939289?position=5&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=vWWxv2mvFYKVl353vBLftw%3D%3D'),
((SELECT id FROM companies WHERE slug = 'bairesdev'), 'Desarrollador Python Junior - Trabajo Remoto', 'linkedin', 'https://co.linkedin.com/jobs/view/desarrollador-python-junior-trabajo-remoto-at-bairesdev-4385264550?position=6&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=qAdG8Ij3uU0LJ4c5qJ6exw%3D%3D'),
((SELECT id FROM companies WHERE slug = 'positivo-s-latam'), 'Aprendiz de sistemas', 'linkedin', 'https://co.linkedin.com/jobs/view/aprendiz-de-sistemas-at-positivo-s%2B-latam-4385579279?position=7&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=rdR%2BoOxPW1imAVESdOWUPg%3D%3D'),
((SELECT id FROM companies WHERE slug = 'bairesdev'), 'Analista de Datos - Trabajo Remoto', 'linkedin', 'https://co.linkedin.com/jobs/view/analista-de-datos-trabajo-remoto-at-bairesdev-4385294620?position=8&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=FOEcdUyUV1KA6U%2FyUrNpxQ%3D%3D'),
((SELECT id FROM companies WHERE slug = 'inetum'), 'Junior Data & IA', 'linkedin', 'https://co.linkedin.com/jobs/view/junior-data-ia-at-inetum-4384347389?position=9&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=bh6iB1P7zW7CXE7wN5cRfg%3D%3D'),
((SELECT id FROM companies WHERE slug = 'mindrift'), 'Data Scientist (Python & SQL) - Freelance AI Trainer', 'linkedin', 'https://co.linkedin.com/jobs/view/data-scientist-python-sql-freelance-ai-trainer-at-mindrift-4386732894?position=10&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=XE5nWqzI30wHKDBAcdUWyQ%3D%3D'),
((SELECT id FROM companies WHERE slug = 'centro-colombo-americano'), 'Coordinador(a) Junior de Business Intelligence', 'linkedin', 'https://co.linkedin.com/jobs/view/coordinador-a-junior-de-business-intelligence-at-centro-colombo-americano-4386944182?position=11&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=XQt3p9kl6n00XuF%2B2pOBPA%3D%3D'),
((SELECT id FROM companies WHERE slug = 'ayesa-colombia'), 'Data Analyst Junior', 'linkedin', 'https://co.linkedin.com/jobs/view/data-analyst-junior-at-ayesa-colombia-4384518289?position=12&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=Q1HdhHMmw%2FpSIAFZ6u9egw%3D%3D'),
((SELECT id FROM companies WHERE slug = 'mindrift'), 'Machine Learning Developer (Freelance)', 'linkedin', 'https://co.linkedin.com/jobs/view/machine-learning-developer-freelance-at-mindrift-4386737150?position=13&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=pQMd1AyI14HIVJ57e3Xugg%3D%3D'),
((SELECT id FROM companies WHERE slug = 'canals'), 'Junior Software Engineer', 'linkedin', 'https://co.linkedin.com/jobs/view/junior-software-engineer-at-canals-4334280216?position=14&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=l5ZkJ6l7G2ANO19rGEt0Fg%3D%3D'),
((SELECT id FROM companies WHERE slug = 'fusemachines'), 'Machine Learning Engineer / Data Scientist', 'linkedin', 'https://co.linkedin.com/jobs/view/machine-learning-engineer-data-scientist-at-fusemachines-4366196757?position=15&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=ffTRzO5kWCTkBs102pNELA%3D%3D'),
((SELECT id FROM companies WHERE slug = 'lean-solutions-group'), 'Business Intelligence Analyst', 'linkedin', 'https://co.linkedin.com/jobs/view/business-intelligence-analyst-at-lean-solutions-group-4386926840?position=16&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=lTaBqR4cRxWYAZZtLMc1iw%3D%3D'),
((SELECT id FROM companies WHERE slug = 'finaktiva'), 'Ingeniero de Datos Junior', 'linkedin', 'https://co.linkedin.com/jobs/view/ingeniero-de-datos-junior-at-finaktiva-4387210848?position=17&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=28%2FOmY5%2FW6hf1zdsNA3ZUw%3D%3D'),
((SELECT id FROM companies WHERE slug = 'kaeser-compresores-de-colombia-s-a-s'), 'Asistente de datos maestros', 'linkedin', 'https://co.linkedin.com/jobs/view/asistente-de-datos-maestros-at-kaeser-compresores-de-colombia-s-a-s-4384156824?position=18&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=NsB%2BRNBxfJ7PyKi93hKvfg%3D%3D'),
((SELECT id FROM companies WHERE slug = 'banco-de-bogota'), 'Analista de Productividad y Mejora Continua', 'linkedin', 'https://co.linkedin.com/jobs/view/analista-de-productividad-y-mejora-continua-at-banco-de-bogot%C3%A1-4379993689?position=19&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=33gMb7w%2BAltFef1AomxIZA%3D%3D'),
((SELECT id FROM companies WHERE slug = 'inter-rapidisimo'), 'Auxiliar de redes y datos', 'linkedin', 'https://co.linkedin.com/jobs/view/auxiliar-de-redes-y-datos-at-inter-rapid%C3%ADsimo-4384509895?position=20&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=cHnrtKDQpF4o6GBAPIN9nQ%3D%3D'),
((SELECT id FROM companies WHERE slug = 'bairesdev'), 'Data Engineer (Junior) - Remote Work', 'linkedin', 'https://co.linkedin.com/jobs/view/data-engineer-junior-remote-work-at-bairesdev-4385292754?position=21&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=dd97zSMvuyQZYQizSWUsSw%3D%3D'),
((SELECT id FROM companies WHERE slug = 'scotiabank'), 'Business Analyst Associate', 'linkedin', 'https://co.linkedin.com/jobs/view/business-analyst-associate-at-scotiabank-4385942101?position=22&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=kbSGZjhBY3tA%2F3yjV%2FbQyg%3D%3D'),
((SELECT id FROM companies WHERE slug = 'banco-santander-colombia'), 'Analista de operaciones', 'linkedin', 'https://co.linkedin.com/jobs/view/analista-de-operaciones-at-banco-santander-colombia-4374396900?position=23&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=57jlOgTtdTaVA1jm%2B6AUbA%3D%3D'),
((SELECT id FROM companies WHERE slug = 'bairesdev'), 'Recepcionista - Trabajo Remoto', 'linkedin', 'https://co.linkedin.com/jobs/view/recepcionista-trabajo-remoto-at-bairesdev-4385281479?position=24&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=BLjTeoSnrL1RLcbAI67XtQ%3D%3D'),
((SELECT id FROM companies WHERE slug = 'fusemachines'), 'Data Analyst', 'linkedin', 'https://co.linkedin.com/jobs/view/data-analyst-at-fusemachines-4335566657?position=25&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=fJVx2bs3d9Y6Q1cGbAthrQ%3D%3D'),
((SELECT id FROM companies WHERE slug = 'fusemachines'), 'Applied AI Engineer (Automation)', 'linkedin', 'https://co.linkedin.com/jobs/view/applied-ai-engineer-automation-at-fusemachines-4370810408?position=26&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=Qmupr2plMkiSEPxTq6uqUg%3D%3D'),
((SELECT id FROM companies WHERE slug = 'sumimedical-sas'), 'Analista junior sistemas de información', 'linkedin', 'https://co.linkedin.com/jobs/view/analista-junior-sistemas-de-informaci%C3%B3n-at-sumimedical-sas-4383714544?position=27&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=hD4K3ScKbXiHLZsqv2ss9g%3D%3D'),
((SELECT id FROM companies WHERE slug = 'asesoftware'), 'Analista de Datos Python', 'linkedin', 'https://co.linkedin.com/jobs/view/analista-de-datos-python-at-asesoftware-3865887394?position=28&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=s9BB8bT%2BpJhAdHr8xJewQw%3D%3D'),
((SELECT id FROM companies WHERE slug = 'solvo-global-careers'), 'Business Analyst', 'linkedin', 'https://co.linkedin.com/jobs/view/business-analyst-at-solvo-global-careers-4385907513?position=29&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=uugzpT2LLDcak76lOAntuA%3D%3D'),
((SELECT id FROM companies WHERE slug = 'sezzle'), 'Software Engineer Intern', 'linkedin', 'https://co.linkedin.com/jobs/view/software-engineer-intern-at-sezzle-4358531906?position=30&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=%2FtEe066lHw5fStBUqdrWMw%3D%3D'),
((SELECT id FROM companies WHERE slug = 'bairesdev'), 'Analista de Datos de Talento - Trabajo Remoto', 'linkedin', 'https://co.linkedin.com/jobs/view/analista-de-datos-de-talento-trabajo-remoto-at-bairesdev-4385947586?position=31&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=C%2BCNlcVu6Surc12hRhnyPQ%3D%3D'),
((SELECT id FROM companies WHERE slug = 'universia-colombia'), 'Junior Consultant', 'linkedin', 'https://co.linkedin.com/jobs/view/junior-consultant-at-universia-colombia-4385607818?position=32&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=SuZr8KsIeTSTsQAzcu37cw%3D%3D'),
((SELECT id FROM companies WHERE slug = 'chaneme-comercial'), 'Asistente de Datos Maestros', 'linkedin', 'https://co.linkedin.com/jobs/view/asistente-de-datos-maestros-at-chaneme-comercial-4385333780?position=33&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=iJ6ccdxIUIx1sx9eFLbi7w%3D%3D'),
((SELECT id FROM companies WHERE slug = 'empresa-confidencial'), 'Head of Data & Analytics', 'linkedin', 'https://co.linkedin.com/jobs/view/head-of-data-analytics-at-empresa-confidencial-4386556307?position=34&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=fT3ncAprad9Wpax%2BETaRug%3D%3D'),
((SELECT id FROM companies WHERE slug = 'inetum'), 'Programa Junior de Data & IA & IAGen', 'linkedin', 'https://co.linkedin.com/jobs/view/programa-junior-de-data-ia-iagen-at-inetum-4385165363?position=35&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=FIuE2YxXw8pwXWvRiMYEVA%3D%3D'),
((SELECT id FROM companies WHERE slug = 'grupo-falabella'), 'Analista de datos', 'linkedin', 'https://co.linkedin.com/jobs/view/analista-de-datos-at-grupo-falabella-4384395323?position=36&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=8nBPHQKwqleSbLo%2BiFcUcw%3D%3D'),
((SELECT id FROM companies WHERE slug = 'fracttal'), 'Python Developer', 'linkedin', 'https://co.linkedin.com/jobs/view/python-developer-at-fracttal-4362182963?position=37&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=yCdQivEsqmySQ89vudQddw%3D%3D'),
((SELECT id FROM companies WHERE slug = 'sezzle'), 'Product Data Intern', 'linkedin', 'https://co.linkedin.com/jobs/view/product-data-intern-at-sezzle-4377087211?position=38&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=WJahrd1NSjpQEgNdApzxrA%3D%3D'),
((SELECT id FROM companies WHERE slug = 'indi-staffing-services'), 'Python Developer (Junior) - Remote', 'linkedin', 'https://co.linkedin.com/jobs/view/python-developer-junior-remote-at-indi-staffing-services-4386786098?position=39&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=YJSrO9xMtV27QZXcD837yA%3D%3D'),
((SELECT id FROM companies WHERE slug = 'tracker-de-colombia-sas-gestion-humana'), 'Analista de Datos', 'linkedin', 'https://co.linkedin.com/jobs/view/analista-de-datos-at-tracker-de-colombia-sas-gesti%C3%B3n-humana-4385150277?position=40&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=9iV32Cmaq3Fqjktmt8XaKw%3D%3D'),
((SELECT id FROM companies WHERE slug = 'aspen-pharma-group'), 'ANALISTA DE DATOS', 'linkedin', 'https://co.linkedin.com/jobs/view/analista-de-datos-at-aspen-pharma-group-4385758467?position=41&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=zoC%2FWzH0RTSC%2FhlITIQ19g%3D%3D'),
((SELECT id FROM companies WHERE slug = 'fracttal'), 'Python Developer', 'linkedin', 'https://co.linkedin.com/jobs/view/python-developer-at-fracttal-4362173582?position=42&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=BonLbwIDQelulWaG4mf6YA%3D%3D'),
((SELECT id FROM companies WHERE slug = 'postobon-s-a'), 'Aprendiz técnico o tecnólogo', 'linkedin', 'https://co.linkedin.com/jobs/view/aprendiz-t%C3%A9cnico-o-tecn%C3%B3logo-at-postobon-s-a-4385578297?position=43&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=%2FYKkpMgdrlkI07z20X7mow%3D%3D'),
((SELECT id FROM companies WHERE slug = 'avanzar-soluciones-financieras'), 'Desarrollador de Sofware', 'linkedin', 'https://co.linkedin.com/jobs/view/desarrollador-de-sofware-at-avanzar-soluciones-financieras-4384812280?position=44&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=%2FlZO4YrJBvuShNkt4O20EA%3D%3D'),
((SELECT id FROM companies WHERE slug = 'mindrift'), 'Senior Python Systems Developer - Functional Testing Project', 'linkedin', 'https://co.linkedin.com/jobs/view/senior-python-systems-developer-functional-testing-project-at-mindrift-4386736651?position=45&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=tKxUlPm4sSrgP5zNeUuT2g%3D%3D'),
((SELECT id FROM companies WHERE slug = 'la-ascension-s-a'), 'Analista de Datos', 'linkedin', 'https://co.linkedin.com/jobs/view/analista-de-datos-at-la-ascensi%C3%B3n-s-a-4388138870?position=46&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=womMhRWvCquB1N7gGk8ReA%3D%3D'),
((SELECT id FROM companies WHERE slug = 'rootstrap'), 'Ssr Python Developer', 'linkedin', 'https://co.linkedin.com/jobs/view/ssr-python-developer-at-rootstrap-4212868533?position=47&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=xvpO0iqC5K3eh87CN8igzw%3D%3D'),
((SELECT id FROM companies WHERE slug = 'worldpanel'), 'Data Analyst', 'linkedin', 'https://co.linkedin.com/jobs/view/data-analyst-at-worldpanel-4381845520?position=48&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=yQNt2JSRBtZkam2DQxIEtQ%3D%3D'),
((SELECT id FROM companies WHERE slug = 'inetum'), 'Programador Junior- Data Engineering', 'linkedin', 'https://co.linkedin.com/jobs/view/programador-junior-data-engineering-at-inetum-4311749229?position=49&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=FFz%2B13%2BeOOSlsXQc2qYd%2Fw%3D%3D'),
((SELECT id FROM companies WHERE slug = 'inetum'), 'Programador Junior- Data Engineering', 'linkedin', 'https://co.linkedin.com/jobs/view/programador-junior-data-engineering-at-inetum-4317504278?position=50&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=8TrFmU%2F53iUh1omQkCNibw%3D%3D'),
((SELECT id FROM companies WHERE slug = 'cloudkitchens'), 'Jr Strategy & Planning Associate, CloudKitchens - Bogota', 'linkedin', 'https://co.linkedin.com/jobs/view/jr-strategy-planning-associate-cloudkitchens-bogota-at-cloudkitchens-4351307716?position=51&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=BLBcPwrGRrzd4MJrBEg5Ug%3D%3D'),
((SELECT id FROM companies WHERE slug = 'symphony-is'), 'Backend Engineer (Python)', 'linkedin', 'https://co.linkedin.com/jobs/view/backend-engineer-python-at-symphony-is-4339822853?position=52&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=98TJZoKxg6A3MJyTSXE%2F%2FA%3D%3D'),
((SELECT id FROM companies WHERE slug = 'axa-colpatria'), 'Profesional Jr. Data Management', 'linkedin', 'https://co.linkedin.com/jobs/view/profesional-jr-data-management-at-axa-colpatria-4353181223?position=53&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=Lr0J5vo50LMMbq8STH1Zrw%3D%3D'),
((SELECT id FROM companies WHERE slug = 'mindrift'), 'Automotive Engineer with Python - Freelance AI Trainer', 'linkedin', 'https://co.linkedin.com/jobs/view/automotive-engineer-with-python-freelance-ai-trainer-at-mindrift-4386915272?position=54&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=rV17L7bUIT43kano3K%2BMAw%3D%3D'),
((SELECT id FROM companies WHERE slug = 'mindrift'), 'Automotive Engineering & Python Expert - Freelance AI Trainer', 'linkedin', 'https://co.linkedin.com/jobs/view/automotive-engineering-python-expert-freelance-ai-trainer-at-mindrift-4386726944?position=55&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=%2FmYEJ4lq64myBjWUCBCJ1w%3D%3D'),
((SELECT id FROM companies WHERE slug = 'cloudfleet'), '🚀 Python Backend Developer | 100% Remoto', 'linkedin', 'https://co.linkedin.com/jobs/view/%F0%9F%9A%80-python-backend-developer-100%25-remoto-at-cloudfleet-4387470464?position=56&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=FgvYpvvDzAEoGN%2BQS%2FuzAQ%3D%3D'),
((SELECT id FROM companies WHERE slug = 'rappi'), 'Data Analyst - Finance', 'linkedin', 'https://co.linkedin.com/jobs/view/data-analyst-finance-at-rappi-4382742269?position=57&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=32HqinaHmKnE5eZs9yNM3w%3D%3D'),
((SELECT id FROM companies WHERE slug = 'postobon-s-a'), 'Aprendiz de sistemas de Gestión', 'linkedin', 'https://co.linkedin.com/jobs/view/aprendiz-de-sistemas-de-gesti%C3%B3n-at-postobon-s-a-4247534946?position=58&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=RJJehv%2FrYRqYdMGGCT7ing%3D%3D'),
((SELECT id FROM companies WHERE slug = 'jgb-s-a'), 'Analista de datos', 'linkedin', 'https://co.linkedin.com/jobs/view/analista-de-datos-at-jgb-s-a-4379130020?position=59&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=0alep22d6b1GDzQNyQ0Ovg%3D%3D'),
((SELECT id FROM companies WHERE slug = 'selpe-vagas'), 'Programa de Estágio G.Start 2026', 'linkedin', 'https://co.linkedin.com/jobs/view/programa-de-est%C3%A1gio-g-start-2026-at-selpe-vagas-4312284863?position=60&pageNum=0&refId=dPx862tco%2BJWB7jyOwYvxA%3D%3D&trackingId=apte00dXaMp%2BRr92teNTzg%3D%3D'),
((SELECT id FROM companies WHERE slug = 'inetum-colombia'), 'Programador Junior- Data Engineering', 'indeed', 'https://co.indeed.com/rc/clk?jk=c9cfcbfd49406166&bb=C8kIGRNaphhJh4NxzdQoqvJW3IXQzET0WGrEs1wzvk3-7hZR0LxLVst-zl-nCj8hi-YfgcE5SqOuanu9yvO7ulUYFbclwZxya5xuP_ZPPAGNBD40tv89Q4oLS5uhCy6ZN8lgMLV3KHY%3D&xkcb=SoDk67M3lIZgQ3QpZh0JbzkdCdPP&fccid=e463fc7104734a53&vjs=3'),
((SELECT id FROM companies WHERE slug = 'fygaro'), 'Back-End Developer (Python)- REMOTE', 'indeed', 'https://co.indeed.com/rc/clk?jk=f6f9c7eac0708d49&bb=C8kIGRNaphhJh4NxzdQoqn6hY1DVxjmgkvRtj6NVPcGZED08tOtDLfSvEz5UjVA0b4zMH2FSDx7SO9Fc_4n8s7f7lF0cCWmad4qVq2iEYaTvpkEZ_Og_JvgrKuJ58nnk7Mqj8-egv-8%3D&xkcb=SoBQ67M3lIZgQ3QpZh0IbzkdCdPP&fccid=8e44a4c19e240d22&vjs=3'),
((SELECT id FROM companies WHERE slug = 'wizeline'), 'Mid Level Data Scientist (Python)', 'indeed', 'https://co.indeed.com/rc/clk?jk=bf042a08fb2d2d60&bb=C8kIGRNaphhJh4NxzdQoqloaIQKruSE6epGDy6-6fdBG5ucZ5BD6ZQkdvZsP25Dxga8a1GbS56zB4bvkJUhJnpX8z6ohaEn7X1EAE2ckfV-ZVJ-2QWifO2YoINO1sD5t276SJjWJHdo%3D&xkcb=SoDe67M3lIZgQ3QpZh0PbzkdCdPP&fccid=da33cac326f2a81b&vjs=3'),
((SELECT id FROM companies WHERE slug = 'inetum-espana-sucursal-en-colombia'), 'Programa Junior de Data & IA & IAGen', 'indeed', 'https://co.indeed.com/rc/clk?jk=b96568e83ffaa0cb&bb=C8kIGRNaphhJh4NxzdQoqigy89ddzHKEezFQjU8unl96QZs9eeTs8H-viyxaqmwzXMGy663nABk5seLplAqC2C_dcB6fW7nlpJ3I0UzrfXo3-ZE-R5nxo6D0QL3S-P0OykPQFraTbqs%3D&xkcb=SoBq67M3lIZgQ3QpZh0ObzkdCdPP&fccid=e463fc7104734a53&vjs=3'),
((SELECT id FROM companies WHERE slug = 'ngds'), 'Junior Data and Analytics Analyst', 'indeed', 'https://co.indeed.com/rc/clk?jk=44e0cf6f271021d7&bb=C8kIGRNaphhJh4NxzdQoqoNdj_yLRRvKM9kTN9BWRL7CmKDhpYT5sKeryscmCB5GkufDUj1RgkS2_Jwxdb422EF5eexnvAp1Yom44B0g16urGzl3cBmaYRpnLG0wcfdX3ueFlBwklRs%3D&xkcb=SoD367M3lIZgQ3QpZh0NbzkdCdPP&fccid=32f1132b75608513&vjs=3'),
((SELECT id FROM companies WHERE slug = 'flex-peeps'), 'Full-Stack Developer Python, React, FastAPI – 100% Remote', 'indeed', 'https://co.indeed.com/rc/clk?jk=48ebbb6b0612d49c&bb=C8kIGRNaphhJh4NxzdQoqjBaLXkIHR0rarXC0HBlbx2Ur0S_HauzkG6PUTmkA0b6t_Idyusi5PfNEnQzI06TgmcXy2nYurTJlXTEHZLU1cz4RuS9CjuXPuNpYn0NaxhdNkSysXjSfP0%3D&xkcb=SoBD67M3lIZgQ3QpZh0MbzkdCdPP&fccid=bbed392e7a3bef84&cmp=Flex-Peeps&ti=Full+stack+developer&vjs=3'),
((SELECT id FROM companies WHERE slug = 'softwareone'), 'Aprendiz de Automatización con Python (Productivo/lectivo)', 'indeed', 'https://co.indeed.com/rc/clk?jk=af15da7f2639f071&bb=C8kIGRNaphhJh4NxzdQoqtXxdhuDtTM4hJNGU80X1Y60VrF_46hzZhshmieOtKLnlNhXE4GRpTmXSSnTQ6D3eWtvUOtYlcrDm4NdZquMH-jkUJ7dLMP_zrNB54qUWSQ6D-YjMicMqc4%3D&xkcb=SoCq67M3lIZgQ3QpZh0DbzkdCdPP&fccid=087aaf21c7121482&vjs=3'),
((SELECT id FROM companies WHERE slug = 'softwareone'), 'Aprendiz de Automatización con Python (lectivo)', 'indeed', 'https://co.indeed.com/rc/clk?jk=97a2a985e10ee3d2&bb=C8kIGRNaphhJh4NxzdQoqrbFSg0seCICgfGMeVWpXXxHINIH9Gt6iDRRe_5pI1bENPHKj1CgUoel9St0a7a_B1eMNEM1l0TD16lc35qpjpowLek3WF1jhnpzFiXmj0unwcdr9K0xKtc%3D&xkcb=SoAe67M3lIZgQ3QpZh0CbzkdCdPP&fccid=087aaf21c7121482&vjs=3'),
((SELECT id FROM companies WHERE slug = 'vikara-ai'), 'AI Engineer', 'indeed', 'https://co.indeed.com/rc/clk?jk=b94f81b88561a10c&bb=C8kIGRNaphhJh4NxzdQoqqAqCm-AG0d_ioPw5y_J3UlvtfEc2pf9_fSo8qE27XLrh1MwpYFlHn5dgscByy_mCksuEwDV__omlSMs5wpn4VjBJ_bBzPrLUZc3lOIuvIBZdMfEKXh0uwg%3D&xkcb=SoCD67M3lIZgQ3QpZh0BbzkdCdPP&fccid=2a33d5a286f7826f&cmp=Vikara.AI&ti=Ai+developer&vjs=3'),
((SELECT id FROM companies WHERE slug = 'fiscalnote'), 'Junior Data Analyst', 'indeed', 'https://co.indeed.com/rc/clk?jk=aa60883fbf8ecd13&bb=C8kIGRNaphhJh4NxzdQoqpx2-vas9vThCgbKlC6xEHLBMMOM1P2TcO9fYbg-9_u9GR492nSYieYFiN-cXY6iIMxNd8Wzkv5_03xaKt570Usz0X7a4eeatZI9MI-EGHsOSAK3eF2DdGA%3D&xkcb=SoA367M3lIZgQ3QpZh0AbzkdCdPP&fccid=d55ba0bc1050147f&vjs=3'),
((SELECT id FROM companies WHERE slug = 'digitalprogit'), 'ETL Developer (SSIS + SQL + Python) – Proyecto 6 meses', 'indeed', 'https://co.indeed.com/rc/clk?jk=32b18fe005d2da51&bb=C8kIGRNaphhJh4NxzdQoqqO5QYYB2qmnxNMrulWePAX_mpBBiOaOht6lGMKUge3Pvr1FvQnnRPAnFjya8G8LgFmWyGPvHUCtBk_IrgIrtvA3kmEzGMcfrWVUy5xWAUTGy6i_cfqEjKQ%3D&xkcb=SoC567M3lIZgQ3QpZh0HbzkdCdPP&fccid=c10732e3f4b9dff1&cmp=Digitalprogit&ti=Python+developer&vjs=3'),
((SELECT id FROM companies WHERE slug = 'fracttal'), 'Python Developer', 'indeed', 'https://co.indeed.com/rc/clk?jk=8c03ae307864f054&bb=C8kIGRNaphhJh4NxzdQoqqAqCm-AG0d_QFI0Yecb7jy-AEcdFVJ3GjGLWJY8ScHHMAWts3_HaA0JXhMWmabB2sRd2CCegXM3Z2obMH0qreed1PurMVUnez0O1U2n4Yy2q70pY4a33L0%3D&xkcb=SoAN67M3lIZgQ3QpZh0GbzkdCdPP&fccid=28dcbf1b7a7f0d26&vjs=3'),
((SELECT id FROM companies WHERE slug = 'tripleten'), 'Data Analytics Teaching Experts LATAM', 'indeed', 'https://co.indeed.com/rc/clk?jk=54e69c271d7a5c05&bb=C8kIGRNaphhJh4NxzdQoqqO5QYYB2qmnxBS80JhIR0L4VV5XYLhoKX4CdxOd-Nc69qk6MS6c94pXnq3-ZfI8XwbBOLGH2kqYuVMVJUaMWOi171tUQ1UZMrF-AmZvm2QIdOuvu28dKJI%3D&xkcb=SoCQ67M3lIZgQ3QpZh0FbzkdCdPP&fccid=b23997f96b43abbb&vjs=3'),
((SELECT id FROM companies WHERE slug = 'tripleten'), 'Data Analytics Teaching Experts LATAM', 'indeed', 'https://co.indeed.com/viewjob?jk=abcdef0123456789'),
((SELECT id FROM companies WHERE slug = 'epam-systems-inc'), 'Python Developer', 'indeed', 'https://co.indeed.com/rc/clk?jk=b7a93941379c6585&bb=C8kIGRNaphhJh4NxzdQoqjlRuW23t90yV2EzlYbTqxDFlzQD7TYNV_qxcqWlKpVz3NGIrqVzpq4lNYKGo2tIUClPHrfDVuPEOAdKYl7pU0gjBC1vSGiH9OvfcLP9gqAIl_wr0h-yHcQ%3D&xkcb=SoAk67M3lIZgQ3QpZh0EbzkdCdPP&fccid=532afac41b2663f7&vjs=3'),
((SELECT id FROM companies WHERE slug = 'stefanini-latam'), 'QA Automation', 'indeed', 'https://co.indeed.com/rc/clk?jk=25f5df54bdc20bab&bb=C8kIGRNaphhJh4NxzdQoqvCYLGF5fBWCG52xkLNtjlPZNlnnxsKx6PdhqDsSXo9UXzEroQGD2uAbqSDrlcwJKNw_bVyzQgmLQeBOOdlEFA6sK2UfTE_9IbDOkyR4URakEv0jPPrjMWo%3D&xkcb=SoAD67M3lIZgQ3QpZh0bbzkdCdPP&fccid=0082619c33c67b45&vjs=3');

-- ============================================================================
-- ÍNDICES de rendimiento
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_jobs_company_id ON jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source);
CREATE INDEX IF NOT EXISTS idx_jobs_is_active ON jobs(is_active);
CREATE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug);
CREATE INDEX IF NOT EXISTS idx_companies_enrichment_status ON companies(enrichment_status);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_candidates_status ON candidates(status);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_job_id ON applications(job_id);
CREATE INDEX IF NOT EXISTS idx_applications_candidate_id ON applications(candidate_id);
CREATE INDEX IF NOT EXISTS idx_scraped_jobs_fuente ON scraped_jobs(fuente);
CREATE INDEX IF NOT EXISTS idx_scraped_jobs_fecha ON scraped_jobs(fecha_creacion DESC);

-- ============================================================================
-- MIGRACIÓN: Importar datos del scraper a las tablas del CRM
-- Inserta en companies y jobs CRM los registros de scraped_jobs
-- que aún no existan (idempotente).
-- ============================================================================

-- 1. Crear empresas nuevas detectadas por el scraper (upsert por slug)
INSERT INTO companies (name, slug, enrichment_status)
SELECT DISTINCT
    empresa AS name,
    lower(regexp_replace(translate(empresa,
        'áéíóúÁÉÍÓÚàèìòùÀÈÌÒÙäëïöüÄËÏÖÜñÑçÇ',
        'aeiouAEIOUaeiouAEIOUaeiouAEIOUnncc'
    ), '[^a-z0-9]+', '-', 'g')) AS slug,
    'pending' AS enrichment_status
FROM scraped_jobs
WHERE empresa IS NOT NULL AND empresa <> ''
ON CONFLICT (slug) DO NOTHING;

-- 2. Importar ofertas del scraper como jobs del CRM
INSERT INTO jobs (company_id, title, source, url, created_at)
SELECT
    c.id,
    sj.titulo,
    CASE
        WHEN lower(sj.fuente) = 'linkedin' THEN 'linkedin'::job_source_enum
        WHEN lower(sj.fuente) = 'indeed'   THEN 'indeed'::job_source_enum
        WHEN lower(sj.fuente) = 'glassdoor' THEN 'glassdoor'::job_source_enum
        ELSE 'other'::job_source_enum
    END,
    sj.url_postulacion,
    COALESCE(sj.fecha_creacion, NOW())
FROM scraped_jobs sj
JOIN companies c ON c.slug = lower(regexp_replace(translate(sj.empresa,
    'áéíóúÁÉÍÓÚàèìòùÀÈÌÒÙäëïöüÄËÏÖÜñÑçÇ',
    'aeiouAEIOUaeiouAEIOUaeiouAEIOUnncc'
), '[^a-z0-9]+', '-', 'g'))
WHERE sj.url_postulacion IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM jobs j WHERE j.url = sj.url_postulacion
  );

