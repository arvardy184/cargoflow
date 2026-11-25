import { AuditService } from '../../src/audit/audit.service';
import {
  advance,
  BaseFixture,
  createShipment,
  createTestApp,
  DAY,
  HOUR,
  NOW,
  seedBase,
  shipmentPayload,
  TestApp,
} from './harness';

describe('Shipment lifecycle (integration)', () => {
  let t: TestApp;
  let f: BaseFixture;
  let id: string;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    t.clock.set(NOW);
    f = await seedBase(t);
    id = (await createShipment(t, f.ops, shipmentPayload(f))).id;
  });

  const transition = (status: string, remarks?: string) =>
    t.http().patch(`/api/shipments/${id}/status`).set(f.ops.auth).send({ status, remarks });

  it('walks DRAFT → BOOKED → IN_TRANSIT → DELIVERED with history and audit', async () => {
    await transition('BOOKED', 'Booking confirmed').expect(200);
    await transition('IN_TRANSIT').expect(200);
    t.clock.set(new Date(NOW.getTime() + 2 * DAY)); // before the +72h ETA
    const delivered = await transition('DELIVERED', '  Received by consignee  ').expect(200);

    expect(delivered.body).toMatchObject({
      status: 'DELIVERED',
      actualDeliveryAt: new Date(NOW.getTime() + 2 * DAY).toISOString(),
      deliveryPerformance: 'ON_TIME',
      allowedTransitions: [],
      editableFields: [],
    });

    const events = await t.http().get(`/api/shipments/${id}/events`).set(f.ops.auth).expect(200);
    expect(
      events.body.map((e: { previousStatus: string | null; newStatus: string }) => [
        e.previousStatus,
        e.newStatus,
      ]),
    ).toEqual([
      [null, 'DRAFT'],
      ['DRAFT', 'BOOKED'],
      ['BOOKED', 'IN_TRANSIT'],
      ['IN_TRANSIT', 'DELIVERED'],
    ]);
    expect(events.body[1]).toMatchObject({
      remarks: 'Booking confirmed',
      changedBy: { id: f.ops.id, role: 'OPERATIONS' },
    });
    expect(events.body[3].remarks).toBe('Received by consignee');

    const audit = await t.prisma.auditLog.findMany({
      where: { entityId: id, action: 'STATUS_CHANGE' },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit).toHaveLength(3);
    expect(audit[2]).toMatchObject({
      beforeData: { status: 'IN_TRANSIT' },
      afterData: { status: 'DELIVERED' },
    });
  });

  it('marks a delivery after the ETA as LATE', async () => {
    await advance(t, f.ops, id, 'BOOKED', 'IN_TRANSIT');
    t.clock.set(new Date(NOW.getTime() + 72 * HOUR + 1));
    const res = await transition('DELIVERED').expect(200);
    expect(res.body.deliveryPerformance).toBe('LATE');
  });

  it.each([
    ['skipping a step', [], 'IN_TRANSIT'],
    ['going backwards', ['BOOKED'], 'DRAFT'],
    ['repeating the current status', ['BOOKED'], 'BOOKED'],
    ['leaving the terminal status', ['BOOKED', 'IN_TRANSIT', 'DELIVERED'], 'IN_TRANSIT'],
  ])('rejects %s with 409 and leaves no trace', async (_label, path, target) => {
    await advance(t, f.ops, id, ...path);
    const eventsBefore = await t.prisma.shipmentEvent.count({ where: { shipmentId: id } });
    const auditBefore = await t.prisma.auditLog.count({ where: { entityId: id } });

    const res = await transition(target).expect(409);
    expect(res.body).toMatchObject({
      code: 'INVALID_STATUS_TRANSITION',
      details: { requestedStatus: target },
    });

    expect(await t.prisma.shipmentEvent.count({ where: { shipmentId: id } })).toBe(eventsBefore);
    expect(await t.prisma.auditLog.count({ where: { entityId: id } })).toBe(auditBefore);
  });

  it('rejects an unknown target status and an unknown shipment', async () => {
    await transition('LOST').expect(400);
    await t
      .http()
      .patch('/api/shipments/unknown/status')
      .set(f.ops.auth)
      .send({ status: 'BOOKED' })
      .expect(404);
  });

  it('applies exactly one of several concurrent identical transitions', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        t.http().patch(`/api/shipments/${id}/status`).set(f.ops.auth).send({ status: 'BOOKED' }),
      ),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409, 409, 409, 409]);
    for (const r of results.filter((x) => x.status === 409)) {
      expect(['CONCURRENT_MODIFICATION', 'INVALID_STATUS_TRANSITION']).toContain(r.body.code);
    }
    expect(
      await t.prisma.shipmentEvent.count({ where: { shipmentId: id, newStatus: 'BOOKED' } }),
    ).toBe(1);
    expect(
      await t.prisma.auditLog.count({ where: { entityId: id, action: 'STATUS_CHANGE' } }),
    ).toBe(1);
  });

  it('rolls back status and event when the audit write fails (single transaction)', async () => {
    const audit = t.app.get(AuditService);
    const spy = jest.spyOn(audit, 'record').mockRejectedValueOnce(new Error('audit store down'));
    try {
      const res = await transition('BOOKED').expect(500);
      expect(res.body.code).toBe('INTERNAL_ERROR');
      expect(JSON.stringify(res.body)).not.toMatch(/audit store down/);
    } finally {
      spy.mockRestore();
    }
    const shipment = await t.prisma.shipment.findUniqueOrThrow({ where: { id } });
    expect(shipment.status).toBe('DRAFT');
    expect(await t.prisma.shipmentEvent.count({ where: { shipmentId: id } })).toBe(1);
  });

  it('concurrent edits either apply (and are audited) or fail with CONCURRENT_MODIFICATION', async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        t
          .http()
          .patch(`/api/shipments/${id}`)
          .set(f.ops.auth)
          .send({ notes: `edit ${i}` }),
      ),
    );
    const applied = results.filter((r) => r.status === 200);
    const rejected = results.filter((r) => r.status !== 200);
    expect(applied.length).toBeGreaterThanOrEqual(1);
    for (const r of rejected) {
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('CONCURRENT_MODIFICATION');
    }
    // No lost update goes unrecorded: each applied edit has exactly one audit entry.
    expect(await t.prisma.auditLog.count({ where: { entityId: id, action: 'UPDATE' } })).toBe(
      applied.length,
    );
  });
});
