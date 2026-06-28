# Performance

## Database

- **Indexes**: All foreign keys, status columns, and common query filters are indexed
- **Connection pooling**: PostgreSQL pool with max 10 connections, 30s idle timeout
- **Query optimization**: Column allowlists prevent `SELECT *` in update paths
- **Batch processing**: Geocoding processes 100 companies per batch, enrichment 5 per cycle

## Background Processing

- **Geocoding**: Parallel requests with Mapbox (10 concurrency), sequential with Nominatim
- **Enrichment**: 5 companies per 8-second cycle with 1.2s delay between each
- **Campaign automation**: Runs once daily at configured hour
- **Workflow automation**: Twice daily (08:00 and 20:00 UTC)

## Frontend

- **Data polling**: 60-second interval for job/company updates
- **Enrichment queue**: Client-side processing with 1.5s delay between items
- **Lazy loading**: Components loaded on route change
- **Error resilience**: Graceful degradation when services unavailable

## Memory Management

- **Request body limit**: 1MB (express.json)
- **Cache**: In-memory cache for config lookups (file: `server/utils/cache.ts`)
- **Streaming**: Excel exports streamed via ExcelJS

## Bottlenecks

| Bottleneck | Current Solution | Future Improvement |
|---|---|---|
| AI enrichment (sequential) | 5 concurrent, 1.2s spacing | Queue worker pool |
| Geocoding (API rate limits) | Batch processing with delays | Dedicated geocoding service |
| Campaign sends (MDirector API) | Sequential per work-group | Parallel with rate limiting |
| Webhook processing | Inline processing | Message queue (RabbitMQ/Redis) |
| Frontend data loading | Polling every 60s | WebSocket real-time updates |

## Monitoring

Current: Console-based logging via Pino.

Recommended additions:
- Database query performance (pg_stat_statements)
- API endpoint latency tracking
- Background job duration metrics
- AI provider success/fail rates
