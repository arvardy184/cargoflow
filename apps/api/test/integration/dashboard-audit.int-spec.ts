import { Role } from '@prisma/client';
import {
  advance,
  BaseFixture,
  createActor,
  createShipment,
  createTestApp,
  HOUR,
  hoursFromNow,
  NOW,
  resetDatabase,
  seedBase,
  shipmentPayload,
  TestApp,
} from './harness';

describe('Dashboard (integration)', () => {
  let t: TestApp;
  let f: BaseFixture;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    t.clock.set(NOW);
    f = await seedBase(t, 6);
  });
  afterEach(() => t.clock.set(NOW));

  const summary = async () =>
    (await t.http().get('/api/dashboard/summary').set(f.ops.auth).expect(200)).body;

  it('reports zeros and a null on-time rate for an empty database', async () => {
    const body = await summary();
    expect(body.kpis).toEqual({
      totalShipments: 0,
      activeShipments: 0,
      deliveredShipments: 0,
      overdueShipments: 0,
      onTimeDeliveredShipments: 0,
      onTimeDeliveryRate: null,
      statusBreakdown: { DRAFT: 0, BOOKED: 0, IN_TRANSIT: 0, DELIVERED: 0 },
    });
    expect(body.attention).toEqual({ total: 0, dueSoonWindowHours: 48, shipments: [] });
    expect(body.recentActivity).toEqual([]);
  });

  it('computes KPIs, attention list and recent activity in the database', async () => {
    const c = f.containers.map((x) => x.id);
    // ETAs relative to NOW: +10h, +30h, +100h, +200h, +20h, +40h
    const s = [];
    for (const [i, hours] of [10, 30, 100, 200, 20, 40].entries()) {
      s.push(
        await createShipment(
          t,
          f.ops,
          shipmentPayload(f, { containerId: c[i], estimatedDeliveryAt: hoursFromNow(hours) }),
        ),
      );
    }
    await advance(t, f.ops, s[1].id, 'BOOKED');
    await advance(t, f.ops, s[2].id, 'BOOKED', 'IN_TRANSIT');
    await advance(t, f.ops, s[4].id, 'BOOKED', 'IN_TRANSIT', 'DELIVERED'); // delivered at NOW, ETA +20h → on time
    await advance(t, f.ops, s[5].id, 'BOOKED', 'IN_TRANSIT');
    t.clock.set(new Date(NOW.getTime() + 50 * HOUR));
    await advance(t, f.ops, s[5].id, 'DELIVERED'); // delivered at +50h, ETA +40h → late

    // Evaluate at NOW+12h: s0 (ETA +10h, DRAFT) is overdue; s1 (+30h) is due within 48h.
    t.clock.set(new Date(NOW.getTime() + 12 * HOUR));
    const body = await summary();

    expect(body.kpis).toEqual({
      totalShipments: 6,
      activeShipments: 2, // s1 BOOKED + s2 IN_TRANSIT
      deliveredShipments: 2,
      overdueShipments: 1,
      onTimeDeliveredShipments: 1,
      onTimeDeliveryRate: 50,
      statusBreakdown: { DRAFT: 2, BOOKED: 1, IN_TRANSIT: 1, DELIVERED: 2 },
    });
    expect(body.attention.total).toBe(2);
    expect(
      body.attention.shipments.map((x: { id: string; attentionReason: string }) => [
        x.id,
        x.attentionReason,
      ]),
    ).toEqual([
      [s[0].id, 'OVERDUE'],
      [s[1].id, 'DUE_SOON'],
    ]);
    expect(body.recentActivity).toHaveLength(8);
    expect(body.recentActivity[0]).toMatchObject({
      newStatus: 'DELIVERED',
      shipment: { id: s[5].id },
    });
    expect(body.generatedAt).toBe(new Date(NOW.getTime() + 12 * HOUR).toISOString());
  });
});

describe('Audit log (integration)', () => {
  let t: TestApp;
  let f: BaseFixture;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    f = await seedBase(t, 2);
  });

  it('is ADMIN-only', async () => {
    const res = await t.http().get('/api/audit-logs').set(f.ops.auth).expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('lists newest first with actor and human-readable entity labels, filterable', async () => {
    const s = await createShipment(t, f.ops, shipmentPayload(f));
    await advance(t, f.ops, s.id, 'BOOKED');
    await t
      .http()
      .patch(`/api/customers/${f.customer.id}`)
      .set(f.admin.auth)
      .send({ phone: '+62 21 555 4321' })
      .expect(200);

    const all = await t.http().get('/api/audit-logs').set(f.admin.auth).expect(200);
    expect(all.body.meta.total).toBe(3);
    expect(all.body.data.map((a: { action: string }) => a.action)).toEqual([
      'UPDATE',
      'STATUS_CHANGE',
      'CREATE',
    ]);
    expect(all.body.data[0]).toMatchObject({
      entityType: 'CUSTOMER',
      entityLabel: expect.stringMatching(/^PT Uji/),
      actor: { id: f.admin.id, role: 'ADMIN' },
    });
    expect(all.body.data[2].entityLabel).toBe(s.shipmentNumber);

    const filtered = await t
      .http()
      .get(`/api/audit-logs?entityType=SHIPMENT&action=STATUS_CHANGE&actorId=${f.ops.id}`)
      .set(f.admin.auth)
      .expect(200);
    expect(filtered.body.data).toHaveLength(1);
    await t.http().get('/api/audit-logs?entityType=INVOICE').set(f.admin.auth).expect(400);
  });

  it('never stores credentials in audit snapshots', async () => {
    await resetDatabase(t.prisma);
    const admin = await createActor(t, Role.ADMIN);
    await t
      .http()
      .post('/api/customers')
      .set(admin.auth)
      .send({
        companyName: 'PT Aman',
        contactPerson: 'Ani',
        email: 'ani@aman.example',
        phone: '+62 21 555 0000',
      })
      .expect(201);
    const rows = await t.prisma.auditLog.findMany();
    expect(JSON.stringify(rows)).not.toMatch(/password|token/i);
  });
});
