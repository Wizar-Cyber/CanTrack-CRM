# Security

## Authentication

- **JWT tokens** signed with HS256 (32+ char secret)
- **httpOnly cookies** prevent XSS token theft
- **Bearer header** fallback for API clients
- **bcrypt** password hashing (12 rounds)
- **Account lockout** after 5 failed attempts (15 min)
- **Session verification** on every request (DB active check)

## Authorization

- Role-based: `admin`, `editor`, `viewer`
- Column allowlists prevent mass assignment attacks
- Dynamic SQL uses parameterized queries (never string interpolation)
- Users cannot self-delete or self-change role

## Network Security

- Helmet security headers (HSTS, X-Frame-Options, etc.)
- CORS restricted to configured origins
- Rate limiting on all API routes
- No exposed stack traces in production

## Data Protection

- Passwords hashed with bcrypt (never stored in plaintext)
- JWT secrets stored as environment variables (never in code)
- Database credentials in `.env` only
- API keys for external services in `.env` only

## Webhook Security

- Shared `WEBHOOK_SECRET` validates incoming webhook requests
- Rate limited to 10 requests/hour
- Payload validation before processing

## Infrastructure

- Docker containers run as non-root user (`nodejs`)
- Nginx reverse proxy handles TLS termination
- Docker Compose isolates services on internal network
- PostgreSQL firewall rules restrict access

## Audit Trail

- `email_campaign_log` tracks all campaign sends
- `automation_log` records background job activity
- `automation_alerts` captures anomalies
- Audit middleware logs suspicious activity

## Best Practices Checklist

- [ ] JWT_SECRET is at least 32 characters
- [ ] DATABASE_URL uses strong password
- [ ] WEBHOOK_SECRET is strong and unique
- [ ] COOKIE_SECURE=true in production
- [ ] ALLOWED_ORIGINS restricted to known domains
- [ ] REGION_FILTER validates against whitelist
- [ ] All SQL uses parameterized queries
- [ ] Rate limiting configured
- [ ] .env never committed to git
- [ ] Docker containers run as non-root
