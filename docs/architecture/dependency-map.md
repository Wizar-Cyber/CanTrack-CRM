# Dependency Map

## Module Dependency Graph

```mermaid
graph TD
    Auth --> Users
    Auth --> JWT
    
    Jobs --> Companies
    Jobs --> Candidates
    Jobs --> Sync
    
    Companies --> Enrichment
    Companies --> Export
    
    Enrichment --> GeminiProvider
    Enrichment --> GroqProvider
    Enrichment --> OllamaProvider
    Enrichment --> WebSearchProvider
    
    Campaigns --> MDirectorService
    Campaigns --> EmailCampaignService
    Campaigns --> GoogleSheetsService
    
    Sync --> ScrapedJobs
    Sync --> JobClassifierService
    
    Routing --> Optimus_rutas
    
    Reports --> Companies
    Reports --> Jobs
    Reports --> Export
    
    Webhooks --> Sync
    Webhooks --> Jobs
```

## Service Dependencies

| Service | Depends On | Consumes |
|---|---|---|
| **Auth Routes** | UserRepository, JWT, bcrypt | — |
| **Company Routes** | CompanyRepository, EnrichmentService, MDirectorService | AI Providers |
| **Job Routes** | JobRepository | — |
| **Campaign Routes** | EmailCampaignService, MDirectorService, GoogleSheetsService | MDirector API |
| **Enrichment Routes** | EnrichmentService, JobClassifierService | Gemini, Groq, Ollama, WebSearch |
| **Sync Routes** | SyncScrapedJobs | Webhooks |
| **Workflow Routes** | WorkflowService | All services |
| **Export Routes** | GoogleSheetsService, ExcelJS | Google Sheets API |
| **Visits/Routes** | Optimus_rutas (API) | Mapbox |

## Event Flow

| Event | Producer | Consumer |
|---|---|---|
| Job Scraped | Webhook | Sync Service |
| Company Enriched | Enrichment Cron | Export Service |
| Geocode Complete | Geocoding Cron | Route Planner |
| Campaign Sent | Campaign Automation | Email Log |
| New Application | Automation | Application Queue |

## External API Dependencies

| API | Used By | Purpose |
|---|---|---|
| Gemini AI | EnrichmentService | Company data enrichment |
| Groq AI | EnrichmentService (fallback) | Company data enrichment |
| Ollama (local) | EnrichmentService (fallback) | Company data enrichment |
| MDirector API | MDirectorService | Email campaigns |
| Google Sheets API | GoogleSheetsService | Data export |
| Mapbox API | Cron Jobs | Geocoding addresses |
| DuckDuckGo/Wikipedia | WebSearchProvider | Web-based enrichment |
