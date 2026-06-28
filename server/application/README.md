# Application Layer

Use cases that orchestrate domain logic and infrastructure. Each use case represents a single business operation.

## Modules

| Module | Files | Description |
|---|---|---|
| `auth/` | Login, Setup, ChangePassword, ManageUsers, GetCurrentUser, UpdateProfile | Authentication & user management |
| `company/` | CreateCompany, GetCompanies, EnrichCompany, UpdateCompany, DeleteCompany, ExportCompanies, SendCompanyOffer | Company operations |
| `job/` | CreateJob, JobUseCases | Job listing management |
| `candidate/` | CandidateUseCases | Candidate management |
| `apply/` | ApplicationUseCases | Application processing |
| `sync/` | SyncScrapedJobs | Data synchronization |

## Pattern

Each use case:
1. Receives validated input from the route handler
2. Calls domain services or repositories
3. Returns a result (or throws DomainError on failure)
4. Is testable in isolation with mocked dependencies
