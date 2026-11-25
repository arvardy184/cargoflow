# ADR 0002 — MySQL 8 with Prisma

- **Status:** Accepted
- **Date:** 2026-11-25

## Context

The data is relational and strongly connected: shipments reference customers, containers and
users; events and audit records reference shipments and users. We need foreign keys, unique
constraints, transactions with row locking, and aggregation for the dashboard.

## Decision

Use **MySQL 8.4** (InnoDB) as the only datastore and **Prisma 6** as the data-access layer:

- `schema.prisma` is the single schema definition; `prisma migrate` produces versioned SQL
  migrations (`apps/api/prisma/migrations`).
- Typed queries for normal access. Tagged-template raw SQL (still parameterized) only where Prisma
  has no API: `SELECT … FOR UPDATE` row locks and the `INSERT … ON DUPLICATE KEY UPDATE`
  sequence counter.
- Interactive transactions (`prisma.$transaction(async (tx) => …)`) for multi-row writes, with
  an explicit isolation level where it matters (ADR 0003).

## Alternatives considered

- **PostgreSQL:** equally suitable (and it could express "one undelivered shipment per container"
  as a partial unique index). MySQL 8 was a requirement of the brief. The rule is enforced in the
  application under a row lock instead.
- **TypeORM:** decorators fit Nest well, but its migration generation and type safety for query
  results are weaker. Prisma's generated client catches field and relation mistakes at compile time.
- **Query builder only (Knex/Kysely):** more control, more boilerplate. Not needed for this domain.

## Consequences

- Strong typing end to end; a schema change shows every affected query as a compile error.
- Prisma has no API for locking reads or upserts with expressions, so those two places use raw
  SQL. They are documented in the service where they occur.
- Prisma's `@default(now())` and `@updatedAt` write UTC; the MySQL server runs at `+00:00`, so
  stored times are UTC regardless of host time zone.
- Integration tests run against a real MySQL database (`cargoflow_test`), because locking,
  isolation and constraint behavior can't be faithfully mocked.
