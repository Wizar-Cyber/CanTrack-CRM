-- ═══════════════════════════════════════════════════════════════════════
-- CanTrack CRM — Seed data (empresas iniciales + jobs de ejemplo)
-- Ejecutar DESPUÉS de schema.sql
-- ═══════════════════════════════════════════════════════════════════════

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

INSERT INTO jobs (company_id, title, source, url)
SELECT c.id, 'Recién egresados ¡Oportunidad para ingenieros de sistemas!', 'linkedin',
  'https://co.linkedin.com/jobs/view/reci%C3%A9n-egresados-%C2%A1oportunidad-para-ingenieros-de-sistemas%21-at-quala-4360486345'
FROM companies c WHERE c.slug = 'quala' AND NOT EXISTS (
  SELECT 1 FROM jobs WHERE url = 'https://co.linkedin.com/jobs/view/reci%C3%A9n-egresados-%C2%A1oportunidad-para-ingenieros-de-sistemas%21-at-quala-4360486345'
);
