# ADR 0001 — NestJS modular monolith

- **Status:** Accepted
- **Date:** 2026-11-25

## Context

CargoFlow serves one operations team. Its core workflow is a shipment lifecycle where a status
change, its history event and its audit record must succeed or fail together. The team is small,
the deadline is short, and the system must be easy to understand within minutes.

## Decision

Build the backend as **one NestJS application** with one module per business area (`auth`,
`customers`, `containers`, `shipments`, `dashboard`, `audit`) and one MySQL database. Business
rules live in framework-free `domain/` files (pure functions). Services own transactions.
Controllers only translate HTTP.

The web app is a separate Next.js application that calls the API over HTTP through a same-origin
rewrite.

## Alternatives considered

- **Microservices** (shipments, audit, customers as separate services): rejected. Writing the
  audit record in the same transaction as the change would need distributed transactions or an
  outbox and broker. That's far more moving parts for no benefit at this scale.
- **Next.js only** (route handlers + server actions, no separate API): fewer deployables, but it
  mixes UI and domain code and gives weaker structure for DI, guards, validation and OpenAPI
  generation. A separate API also serves non-browser clients (Swagger, scripts) cleanly.
- **Express without a framework:** less magic, but we'd hand-build DI, guards, validation pipes
  and Swagger, which NestJS provides in a consistent, widely known shape.

## Consequences

- One deployable API and one database transaction scope: the consistency rules are simple
  (see ADR 0003).
- Module boundaries are enforced by convention and Nest modules, not by the network. A module
  could be extracted later if it ever needed independent scaling; nothing suggests it will.
- Global guards (`JwtAuthGuard`, `RolesGuard`) and a global exception filter apply uniformly to
  every route. New endpoints are authenticated by default and must opt out with `@Public()`.
