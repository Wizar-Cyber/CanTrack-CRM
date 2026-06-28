# Sequence Diagrams

## Authentication Flow

```mermaid
sequenceDiagram
    participant Client
    participant Express
    participant AuthMiddleware
    participant DB
    participant Logger

    Client->>Express: POST /api/auth/login {email, password}
    Express->>DB: SELECT * FROM users WHERE email=$1
    DB-->>Express: user row
    Express->>Express: bcrypt.compare(password, hash)
    alt Invalid credentials
        Express-->>Client: 401 {error: "Credenciales inválidas"}
    else Valid credentials
        Express->>Express: jwt.sign(payload, JWT_SECRET)
        Express->>Express: Set-Cookie: auth_token (httpOnly)
        Express-->>Client: 200 {token, user}
    end

    Note over Client,Express: Authenticated request

    Client->>Express: GET /api/companies (cookie: auth_token)
    Express->>AuthMiddleware: requireAuth
    AuthMiddleware->>AuthMiddleware: jwt.verify(token)
    AuthMiddleware->>DB: SELECT is_active FROM users WHERE id=$1
    DB-->>AuthMiddleware: active=true
    AuthMiddleware-->>Express: next() [req.user set]
    Express->>DB: SELECT * FROM companies WHERE ...
    DB-->>Express: companies[]
    Express-->>Client: 200 companies[]
```

## Company Enrichment Flow

```mermaid
sequenceDiagram
    participant Client
    participant Routes
    participant EnrichmentService
    participant ProviderChain
    participant Gemini
    participant Groq
    participant Ollama
    participant WebSearch
    participant DB

    Client->>Routes: POST /api/enrichment/process-next
    Routes->>DB: LOCK pending company WITH job
    DB-->>Routes: {id, name}
    
    Routes->>DB: SELECT industry, website, description
    DB-->>Routes: row (may be empty)
    
    alt Already has data
        Routes->>DB: UPDATE status='db_matched'
        Routes-->>Client: {source: 'db_matched'}
    else Needs enrichment
        Routes->>EnrichmentService: enrichCompany("Acme Inc")
        EnrichmentService->>ProviderChain: enrich("Acme Inc")
        
        ProviderChain->>Gemini: enrich("Acme Inc")
        Gemini-->>ProviderChain: partial data
        
        ProviderChain->>Groq: enrich("Acme Inc") (fill gaps)
        Groq-->>ProviderChain: additional data
        
        ProviderChain->>Ollama: enrich("Acme Inc") (fill gaps)
        Ollama-->>ProviderChain: additional data
        
        ProviderChain->>WebSearch: enrich("Acme Inc") (fill gaps)
        WebSearch-->>ProviderChain: additional data
        
        ProviderChain-->>EnrichmentService: merged data
        EnrichmentService-->>Routes: EnrichmentData
        
        Routes->>DB: UPDATE with enriched data
        Routes->>DB: UPDATE enrichment_status='scraped'
        
        Routes->>Routes: Auto-suggest services
        Routes->>DB: Schedule Excel export
        
        Routes-->>Client: {companyId, data, remaining}
    end
```

## Campaign Automation Flow

```mermaid
sequenceDiagram
    participant Cron
    participant CampaignService
    participant MDirector
    participant DB
    participant Logger

    Note over Cron: Every 15 minutes
    Cron->>CampaignService: checkAndRunCampaigns(pool)
    CampaignService->>DB: SELECT auto_enabled, schedule_hour
    DB-->>CampaignService: config
    
    alt Not enabled or wrong hour
        CampaignService-->>Cron: skip
    else Run campaign
        CampaignService->>DB: SELECT eligible companies
        
        loop Per region (Ontario, Quebec)
            loop Per work group
                CampaignService->>MDirector: subscribeContact(email, name, listId, segmentId)
                MDirector-->>CampaignService: OK
            end
            
            CampaignService->>MDirector: createDeliveryFromTemplate(name, templateId, segmentId)
            MDirector-->>CampaignService: {campaignId}
            
            CampaignService->>DB: UPDATE last_campaign_at
            CampaignService->>DB: INSERT INTO email_campaign_log
        end
        
        CampaignService->>DB: UPDATE auto_last_run_at = NOW()
        CampaignService-->>Cron: {ran: true, regions: [...]}
    end
```

## Geocoding Flow

```mermaid
sequenceDiagram
    participant Cron
    participant Geocoding
    participant Mapbox
    participant Nominatim
    participant DB

    Note over Cron: Every 60 minutes
    Cron->>Geocoding: geocodePendingCompanies(pool)
    
    loop Per table (ontario_companies, quebec_companies)
        Geocoding->>DB: SELECT with lat/lng IS NULL
        
        alt Mapbox configured
            par Parallel batch (10 concurrency)
                Geocoding->>Mapbox: geocodeAddress(addr, city, province)
                Mapbox-->>Geocoding: {lat, lng} or null
            end
        else Nominatim fallback
            loop Sequential (1 req/sec)
                Geocoding->>Nominatim: geocodeAddress(addr, city, province)
                Nominatim-->>Geocoding: {lat, lng} or null
            end
        end
        
        Geocoding->>DB: UPDATE lat, lng
    end
```

## Webhook Data Ingestion Flow

```mermaid
sequenceDiagram
    participant Scraper
    participant Webhook
    participant Sync
    participant JobClassifier
    participant DB

    Scraper->>Webhook: POST /api/webhook [jobs...]
    Webhook->>Webhook: Verify WEBHOOK_SECRET
    Webhook->>DB: INSERT scraped_jobs (batch)
    Webhook-->>Scraper: 200 {received: N}

    Note over Sync: Runs every 5 minutes (FastSync)
    
    Sync->>DB: SELECT unlinked jobs
    loop Per unlinked job
        Sync->>Sync: slugify(company_name)
        Sync->>DB: Match or create province company
        Sync->>DB: UPDATE job SET province_id
    end
    
    Sync->>JobClassifier: classify(job)
    JobClassifier->>JobClassifier: AI-based classification
    JobClassifier->>DB: UPDATE job SET service_type_id
    
    Note over Sync: Enrichment cron processes linked companies
```

## Route Planning Flow

```mermaid
sequenceDiagram
    participant Client
    participant Routes
    participant Optimus
    participant Mapbox
    participant DB

    Client->>Routes: POST /api/routes {name, stops, startAddr}
    Routes->>DB: INSERT route
    Routes->>DB: INSERT route_stops
    
    Routes->>Optimus: POST /optimize {stops, start}
    Optimus->>Mapbox: Geocode addresses
    Optimus->>Optimus: Solve TSP / VRP
    Optimus-->>Routes: {ordered_stops, distance, time}
    
    Routes->>DB: UPDATE route with optimization
    Routes->>DB: UPDATE stops with order
    
    Routes-->>Client: {route: optimizedRoute}
```

## Export to Google Sheets Flow

```mermaid
sequenceDiagram
    participant Cron
    participant Export
    participant GoogleSheets
    participant DB

    Note over Cron: After enrichment completes
    Export->>DB: SELECT enriched companies
    DB-->>Export: companies[]
    
    Export->>GoogleSheets: init() - auth service account
    GoogleSheets-->>Export: ready
    
    Export->>GoogleSheets: clearSheet(sheetId)
    Export->>GoogleSheets: appendRows(companies)
    
    Export->>DB: UPDATE sheets_exported_at
```
