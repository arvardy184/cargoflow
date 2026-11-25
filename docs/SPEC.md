# CargoFlow — Master Implementation Specification

> Source of truth for requirements. Saved from the original master prompt so new sessions can continue without re-pasting it. Current state lives in `/PROGRESS.md`.

## Role & working style

Act as an autonomous Senior Full-Stack Engineer / Architect / Tech Lead / QA. Deliver a **working, portfolio-ready** application — not a plan or scaffold. Execute, verify, fix, continue. Create/edit files, install deps, run migrations, build, test, debug inside the project workspace. Don't delete unrelated files or run destructive commands outside the project. Inspect files before modifying. Make reasonable decisions independently; ask only when blocked on credentials/authorization/real user decisions. If a tool is unavailable, state it and continue with what's possible.

---

## 1. Business context

**CargoFlow — Enterprise Logistics Operations Platform.** Internal logistics management app for operations teams to: register/manage shipping orders; track shipments through milestones; monitor ETAs; identify overdue shipments; keep status history; analyze performance; manage customers and shipment records; keep audit trails; apply role-based authorization.

Scenario: a logistics company moves container shipments between Indonesian cities/ports. Today it uses spreadsheets/chat → statuses hard to monitor centrally, delays not visible, changes untraceable, no reliable reporting, business rules inconsistently enforced.

**Original demonstration project using synthetic data. Do not claim affiliation with Samudera Indonesia, PSI, or their systems.**

## 2. Audience & engineering expectations

Target roles: Application Developer, Software Engineer, Full-Stack, Backend, Enterprise Application Engineer. Demonstrate: BRD → software, architecture, REST APIs, relational DB design, backend validation/business rules, frontend, authn/authz, transactions/integrity, testing/debugging, documentation, delivery, security awareness, maintainability.

Avoid overengineering. **Prioritize a complete, working vertical slice over an impressive unfinished architecture.**

## 3. Tech stack

- **Frontend:** Next.js App Router, TypeScript strict, React, Tailwind CSS, shadcn/ui, React Hook Form, Zod, TanStack Query (if appropriate), responsive.
- **Backend:** NestJS, TypeScript strict, REST, Prisma, DTO validation, DI, modular, Swagger/OpenAPI, JWT, RBAC, centralized exception handling.
- **Database:** MySQL 8, Prisma migrations, FKs/constraints, indexes, transactions for multi-record mutations, seed script.
- **Infra:** Docker Compose (MySQL), env config, GitHub Actions (lint, typecheck, test, build), ESLint + Prettier, consistent scripts.
- Use stable, mutually compatible versions. No microservices/Kubernetes/Redis/event brokers. **Modular monolith.**

## 4. Project structure

```
cargoflow/
  apps/web/  apps/api/
  packages/shared/ (only if genuinely useful)
  docs/ BRD.md PRD.md ARCHITECTURE.md ERD.md API.md TEST_PLAN.md ADR/
  infrastructure/  .github/workflows/  docker-compose.yml  .env.example  README.md
```
Understandable to another engineer in ~15 minutes. Avoid premature abstraction.

## 5. Roles

**ADMIN:** view all shipments; create; edit shipment info; update status; manage customers; view dashboard; view shipment histories; view audit records.

**OPERATIONS:** view shipments; create; edit permitted fields; update status; view dashboard; view history. **Cannot** access audit-log endpoints or perform admin operations.

Authorization enforced on the **backend** (401/403), not just hidden buttons. Seed synthetic demo accounts for both roles. Never commit real credentials/secrets; demo credentials documented as development-only.

## 6. Domain model (required entities)

- **User:** id, fullName, email (unique), passwordHash, role, createdAt, updatedAt
- **Customer:** id, companyName, contactPerson, email, phone, createdAt, updatedAt
- **Container:** id, containerNumber (unique), containerType, createdAt, updatedAt
- **Shipment:** id, shipmentNumber (unique, human-readable), customerId, containerId, origin, destination, estimatedDeliveryAt, actualDeliveryAt?, status, notes?, createdById, createdAt, updatedAt
- **ShipmentEvent:** id, shipmentId, previousStatus?, newStatus, changedById, remarks?, createdAt
- **AuditLog:** id, actorId, entityType, entityId, action, beforeData?, afterData?, createdAt

Suitable types, relations, unique constraints, indexes. Document extra entities. Timestamps in UTC, convert in frontend. Don't store derivable values.

## 7. Shipment business rules (most important)

State machine: **DRAFT → BOOKED → IN_TRANSIT → DELIVERED**
1. New shipments start DRAFT. 2. DRAFT→BOOKED only. 3. BOOKED→IN_TRANSIT only. 4. IN_TRANSIT→DELIVERED only. 5. DELIVERED terminal. 6. Repeated/invalid transitions rejected. 7. Status never modified bypassing domain rules. 8. Every transition creates a ShipmentEvent. 9. Every transition creates an AuditLog. 10. Status change + event + audit committed atomically. 11. Failed transactions leave no partial records. 12. Only authorized users transition.

Status is controlled by backend rules, never trusted from arbitrary client input.

**Overdue** = estimatedDeliveryAt < now AND status ≠ DELIVERED. A **derived** condition, not a status. On-time for delivered = actualDeliveryAt vs estimatedDeliveryAt. Document on-time rate formula; handle empty datasets. Current time injectable in tests.

**Validation:** customer exists; container exists; origin/destination non-empty and different; valid ETA; clear business error on invalid transition; duplicate container numbers rejected; unauthorized modifications rejected. Define consistent editing rules for BOOKED/IN_TRANSIT shipments. UI communicates validation failures clearly.

## 8. API endpoints

- Auth: `POST /api/auth/login`, `GET /api/auth/me`
- Customers: `GET/POST /api/customers`, `GET/PATCH /api/customers/:id`
- Containers: `GET/POST /api/containers`
- Shipments: `GET/POST /api/shipments`, `GET/PATCH /api/shipments/:id`, `PATCH /api/shipments/:id/status`, `GET /api/shipments/:id/events`
- Dashboard: `GET /api/dashboard/summary`
- Audit: `GET /api/audit-logs`

Shipment list: pagination, search by shipment number, filter by status, customer, overdue; sort by createdAt and ETA. Proper status codes (400/401/403/404/409/500), centralized error formatting, Swagger. Never return passwords/hashes/tokens/sensitive internals.

## 9. Frontend

Polished, production-style B2B dashboard: light neutral backgrounds, navy/blue accents, professional typography, clear hierarchy, spacious, consistent, accessible contrast + keyboard, responsive desktop/tablet, usable mobile. No flashy animation.

Pages:
- **A. Login** — email/password, validation, loading, meaningful errors, protected routes.
- **B. Dashboard** — total, active, delivered, overdue, on-time rate, recent activity, shipments requiring attention. KPIs from backend only.
- **C. Shipment list** — search, status filter, overdue filter, pagination, sorting, colored status, ETA, view-detail actions.
- **D. Create shipment** — customer select, container select, origin, destination, ETA, notes, validation, loading, success/error feedback.
- **E. Shipment detail** — number, customer, container, route, status, ETA + actual delivery, overdue indicator, event timeline, authorized transition controls, audit info where permitted.
- **F. Customers** — list, create, edit, validation.
- **G. Audit log (admin)** — actor, entity, action, timestamp, change info.

Every important view: loading, empty, error, success, validation, confirmation where needed, responsive. No dead buttons, no fake controls, no hardcoded KPIs, no placeholder pages called finished.

## 10. Backend architecture

Modules: auth, users, customers, containers, shipments, dashboard, audit, prisma. Separate controllers / DTOs / services / domain logic / persistence. Transactions for status mutations. Prevent inconsistent concurrent transitions where practical; document + test the strategy. Structured logging, safe error handling, never log passwords/tokens. CORS for local dev and deployment.

## 11. Security

Modern password hashing; JWT with expiry; server-side authz; input validation; env-based secrets; secure errors; safe DB access; no plaintext passwords; no hardcoded prod secrets; basic login abuse protection; protect shipments and audit logs from unauthorized access. Choose and document a token storage strategy with trade-offs. Don't call it production-secure. Do a basic security review before finishing.

## 12. Automated testing (mandatory)

- **Unit:** valid/invalid transitions, terminal behavior, overdue detection, on-time calculation, validation edge cases, dashboard calculation logic.
- **Integration/API:** login success/failure, unauthorized requests, role restrictions, shipment creation, status updates, event creation, audit logging, invalid requests, filtering/pagination. Isolated test DB; never destructively reset a non-test DB.
- **Frontend:** form validation, status display, API error handling, shipment list rendering.
- **E2E (if practical):** Login → Create Shipment → Update Status → View Timeline.

No meaningless tests.

## 13. Database quality

PKs/FKs, unique constraints, indexes, pagination, UTC timestamps, transactional writes, seed data, clear migrations. Inspect actual SQL for dashboard aggregation and shipment list filters (EXPLAIN). Don't load all shipments into memory for dashboard — use MySQL aggregation. Document 1–2 indexing decisions in ARCHITECTURE.md.

## 14. Seed data

~2 users, 8–12 customers, 15–25 containers, 30–50 shipments, events, audit records. Fictional names. Include draft, booked, in-transit, delivered, overdue, on-time, delayed. Timestamps relative to execution date. All records respect domain rules. Repeatable in dev.

## 15. Documentation

- **BRD.md:** background, problem, objectives, stakeholders, roles, business requirements, rules, scope/exclusions, acceptance criteria.
- **PRD.md:** overview, personas, user stories, functional + non-functional requirements, workflows, MVP boundaries.
- **ARCHITECTURE.md:** components, FE/BE communication, auth flow, DB decisions, error handling, transaction strategy, security, Mermaid diagram.
- **ERD.md:** Mermaid ER diagram matching the actual schema.
- **API.md:** usage, auth, example requests (Swagger also available).
- **TEST_PLAN.md:** strategy, critical scenarios, edge cases, commands, verified results, known gaps.
- **ADRs:** why NestJS modular monolith; why MySQL + Prisma; how transitions + audit consistency are enforced.

Docs must reflect the real implementation.

## 16. README

Overview; business problem; key features; tech stack; architecture overview; screenshots section; local setup; env vars; migration + seed; demo login; running tests; API docs; example workflow; engineering challenges/decisions; limitations + future work. No invented deployment URLs, no fabricated screenshots or test results — if screenshots aren't captured, label the section with what needs capturing.

## 17. Phases

- **0 Environment inspection** — dir, files, git, Node, package manager, Docker, configs. Preserve existing work.
- **1 Requirements & foundation** — BRD/PRD, architecture, repo structure, both apps, infra, env examples, scripts; validate both apps start.
- **2 Database & backend** — schema, migrations, auth, authz, customers, containers, shipment CRUD, state machine, audit, dashboard, Swagger; run backend tests; fix.
- **3 Frontend** — login, layout, dashboard, list, create, detail, timeline, customers, audit view; real API integration, no hardcoded data.
- **4 QA** — lint, typecheck, unit, integration, frontend tests, production builds; fix; inspect user flows (browser if available, otherwise state what's unverified).
- **5 Portfolio readiness** — README, architecture docs, ERD, API docs, test report, GitHub Actions, demo instructions, screenshots if possible.

## 18. Optional Phase 6 — Laravel "Logistics Rate Quotation Service"

Only after core works and critical tests pass. Synthetic rate records, quotation calculation, REST API, validation, structured responses. Integrate with NestJS via adapter/service over the API boundary (no shared tables). Don't add distributed complexity to the shipment workflow. If it risks the core, defer and document honestly.

## 19. Engineering standards

Clean, readable code; strict TS; consistent naming; small cohesive functions; clear errors; separation of concerns; no duplicated business rules; meaningful tests; DB integrity; functional UI; no unused placeholder modules; no silent error swallowing; no fabricated claims or fake test results; no hardcoded credentials; no unsupported production-readiness claims. Comments explain decisions, not obvious code.

## 20. Working style

Per phase: inspect → smallest viable approach → implement → run → observe output → fix → verify → record → continue. Don't stop after planning. Don't ask permission for routine local dev. Don't claim done without verification. Diagnose failed commands; don't retry the same failing command unchanged. Concise checkpoint reports (completed, files, commands, tests, remaining, blockers). If interrupted, update `PROGRESS.md` with exact state and resume commands.

## 21. Priorities (deadline-driven, for job applications)

- **P0:** auth, shipment CRUD, state transitions, MySQL persistence, basic frontend.
- **P1:** dashboard, audit trail, tests, documentation, improved UX.
- **P2:** GitHub Actions, enhanced reporting, portfolio presentation, more tests.
- **P3:** Laravel module, deployment enhancements.

Never sacrifice P0 for P2/P3.

## 22. Definition of Done

Frontend runs; backend runs; MySQL works; migration works; seed works; demo login works; RBAC works; shipment creation works; listing + filtering work; detail works; valid transitions work; invalid rejected; events persist; audit logs persist; overdue detection works; dashboard shows real API data; frontend shows meaningful errors; lint + typecheck pass; required tests pass; production builds pass; README has reproducible setup; architecture + DB docs match code. List anything incomplete — don't claim finished if critical functions are broken.

## 23. Final report

- A. Implementation summary
- B. Architecture
- C. Features (completed vs incomplete)
- D. Verification results (actual commands + outcomes)
- E. How to run
- F. Demo credentials (dev-only)
- G. Known limitations
- H. Portfolio presentation: GitHub repo description; project summary; 3–4 CV bullets (implemented functionality only); 2-minute demo script; 5 likely interview questions with discussion points.
