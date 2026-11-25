# ADR 0003 — Enforcing status transitions and audit consistency

- **Status:** Accepted
- **Date:** 2026-11-25

## Context

The shipment lifecycle is the core business rule: `DRAFT → BOOKED → IN_TRANSIT → DELIVERED`, no
skipping, no going back, `DELIVERED` final. Every transition must produce a `ShipmentEvent` and
an `AuditLog`, and a failure must leave nothing behind. Two operators can act on the same
shipment at the same time, and two creates can race for the same container.

## Decision

1. **One place for the rules.** `shipments/domain/shipment-lifecycle.ts` defines the transition
   table and editing rules as pure functions. `ShipmentsService.changeStatus` is the only code
   that writes `Shipment.status`. Create always writes `DRAFT`, and DTO whitelisting rejects any
   client-supplied `status`.
2. **One transaction per change.** Status update, event insert and audit insert run in one Prisma
   interactive transaction. `AuditService.record(tx, …)` takes the caller's transaction client,
   so it can't write outside it.
3. **Compare-and-set instead of read-then-write.**
   `UPDATE Shipment SET status = :next WHERE id = :id AND status = :current`. If another request
   changed the status after we read it, zero rows match → 409 `CONCURRENT_MODIFICATION` and the
   transaction rolls back. Field edits use the same idea with `(status, updatedAt)`.
4. **Row lock for container assignment, at READ COMMITTED.** A create (or a container change)
   locks the container row with `SELECT … FOR UPDATE`, then checks for an undelivered shipment
   on it. These transactions use `READ COMMITTED`.
5. **The UI never re-implements rules.** The detail endpoint returns `allowedTransitions` and
   `editableFields` computed by the same domain functions for the calling user, and the web app
   renders controls from them.

## Why READ COMMITTED for container assignment

The first implementation used MySQL's default REPEATABLE READ. An integration test that fires 5
concurrent creates for one container showed **all 5 succeeding**. The transaction's first read
(the customer existence check) fixed its snapshot _before_ it waited for the container lock. After
the lock was granted, the availability check still read that old snapshot and didn't see the
shipment the other transaction had just committed.

Making the check a locking read (`FOR SHARE`) fixed the race but introduced **deadlocks** between
creates for _different_ containers: with no matching rows, InnoDB takes gap locks. Two
transactions held compatible gap locks on the same gap, and each one's INSERT then waited on the
other's.

At READ COMMITTED every plain read sees the latest committed data, and InnoDB takes no gap locks
for these statements. The row lock serializes competing assignments, and the check after it is
always current. Both concurrency tests (same container → exactly one 201; different containers →
all succeed with unique numbers) pass consistently.

## Alternatives considered

- **Optimistic version column only:** handles lost updates on one row, but not the cross-row rule
  "one active shipment per container".
- **Database constraint:** MySQL has no partial unique indexes. A generated column
  (`activeContainerId = IF(status <> 'DELIVERED', containerId, NULL)`) with a unique index would
  work and is a reasonable hardening step. It wasn't adopted, to keep the schema conventional and
  Prisma-managed.
- **SERIALIZABLE everywhere:** correct, but turns ordinary reads into shared locks and increases
  deadlock risk across unrelated requests.
- **Application-level mutex:** only works with a single process; breaks as soon as there are two
  API instances.

## Consequences

- Concurrent transitions resolve deterministically: exactly one succeeds, the others get 409 and
  the UI refetches the true state.
- Audit and history can't drift from the shipment state. A test injects a failure into the audit
  write and checks that the status and event roll back.
- The isolation-level choice is local to two methods and documented on `CONTAINER_ASSIGNMENT_TX`.
