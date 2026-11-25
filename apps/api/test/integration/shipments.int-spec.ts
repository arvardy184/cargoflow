import {
  Actor,
  advance,
  BaseFixture,
  createCustomer,
  createShipment,
  createTestApp,
  DAY,
  hoursFromNow,
  NOW,
  seedBase,
  shipmentPayload,
  TestApp,
} from './harness';

describe('Shipments — create, read, edit (integration)', () => {
  let t: TestApp;
  let f: BaseFixture;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    f = await seedBase(t);
  });

  describe('create', () => {
    it('creates a DRAFT with a sequential number, initial event and audit record', async () => {
      const first = await createShipment(t, f.ops, shipmentPayload(f, { notes: '  fragile  ' }));
      const second = await createShipment(
        t,
        f.ops,
        shipmentPayload(f, { containerId: f.containers[1].id }),
      );

      expect(first).toMatchObject({
        shipmentNumber: 'CF-2030-00001', // year comes from the injected clock
        status: 'DRAFT',
        notes: 'fragile',
        isOverdue: false,
        deliveryPerformance: null,
        allowedTransitions: ['BOOKED'],
        createdBy: { id: f.ops.id },
      });
      expect(second.shipmentNumber).toBe('CF-2030-00002');

      const events = await t.prisma.shipmentEvent.findMany({ where: { shipmentId: first.id } });
      expect(events).toMatchObject([
        { previousStatus: null, newStatus: 'DRAFT', changedById: f.ops.id },
      ]);
      const audit = await t.prisma.auditLog.findMany({ where: { entityId: first.id } });
      expect(audit).toMatchObject([
        { action: 'CREATE', entityType: 'SHIPMENT', actorId: f.ops.id },
      ]);
    });

    it('ignores a client-supplied status (mass assignment) by rejecting unknown fields', async () => {
      const res = await t
        .http()
        .post('/api/shipments')
        .set(f.ops.auth)
        .send({ ...shipmentPayload(f), status: 'DELIVERED' })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(await t.prisma.shipment.count()).toBe(0);
    });

    it.each([
      [
        'same origin and destination',
        { destination: ' jakarta  (tanjung priok) ' },
        400,
        'INVALID_ROUTE',
      ],
      ['ETA in the past', { estimatedDeliveryAt: hoursFromNow(-1) }, 400, 'INVALID_ETA'],
      ['ETA exactly now', { estimatedDeliveryAt: NOW.toISOString() }, 400, 'INVALID_ETA'],
      ['non-ISO ETA', { estimatedDeliveryAt: '15/01/2030' }, 400, 'VALIDATION_ERROR'],
      ['unknown customer', { customerId: 'missing' }, 400, 'RELATED_RESOURCE_NOT_FOUND'],
      ['unknown container', { containerId: 'missing' }, 400, 'RELATED_RESOURCE_NOT_FOUND'],
    ])('rejects %s', async (_label, overrides, status, code) => {
      const res = await t
        .http()
        .post('/api/shipments')
        .set(f.ops.auth)
        .send(shipmentPayload(f, overrides));
      expect(res.status).toBe(status);
      expect(res.body.code).toBe(code);
      expect(await t.prisma.shipment.count()).toBe(0);
      // A failed create must not consume a sequence number.
      expect(await t.prisma.sequenceCounter.count()).toBe(0);
    });

    it('refuses a container already on an undelivered shipment, and frees it after delivery', async () => {
      const first = await createShipment(t, f.ops, shipmentPayload(f));
      const blocked = await t
        .http()
        .post('/api/shipments')
        .set(f.ops.auth)
        .send(shipmentPayload(f))
        .expect(409);
      expect(blocked.body.code).toBe('CONTAINER_UNAVAILABLE');
      expect(blocked.body.message).toContain(first.shipmentNumber);

      await advance(t, f.ops, first.id, 'BOOKED', 'IN_TRANSIT', 'DELIVERED');
      await createShipment(t, f.ops, shipmentPayload(f));
    });

    it('serialises concurrent creates for the same container: exactly one wins', async () => {
      const attempts = await Promise.all(
        Array.from({ length: 5 }, () =>
          t.http().post('/api/shipments').set(f.ops.auth).send(shipmentPayload(f)),
        ),
      );
      const statuses = attempts.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 409, 409, 409, 409]);
      expect(
        attempts
          .filter((r) => r.status === 409)
          .every((r) => r.body.code === 'CONTAINER_UNAVAILABLE'),
      ).toBe(true);
      expect(await t.prisma.shipment.count({ where: { containerId: f.containers[0].id } })).toBe(1);
    });

    it('allocates unique, gap-free numbers under concurrent creates', async () => {
      const results = await Promise.all(
        f.containers.map((c) =>
          createShipment(t, f.ops, shipmentPayload(f, { containerId: c.id })),
        ),
      );
      const numbers = results.map((s) => s.shipmentNumber).sort();
      expect(numbers).toEqual(['CF-2030-00001', 'CF-2030-00002', 'CF-2030-00003', 'CF-2030-00004']);
    });
  });

  describe('read', () => {
    it('returns 404 for an unknown id', async () => {
      const res = await t.http().get('/api/shipments/unknown').set(f.ops.auth).expect(404);
      expect(res.body.code).toBe('NOT_FOUND');
      await t.http().get('/api/shipments/unknown/events').set(f.ops.auth).expect(404);
    });

    it('tailors editableFields and allowedTransitions to the caller role', async () => {
      const s = await createShipment(t, f.ops, shipmentPayload(f));
      const asOps = await t.http().get(`/api/shipments/${s.id}`).set(f.ops.auth).expect(200);
      const asAdmin = await t.http().get(`/api/shipments/${s.id}`).set(f.admin.auth).expect(200);
      expect(asOps.body.editableFields).not.toContain('customerId');
      expect(asAdmin.body.editableFields).toContain('customerId');
    });
  });

  describe('list', () => {
    beforeEach(async () => {
      // 4 shipments: 1 overdue (DRAFT, ETA moved into the past), 1 BOOKED, 1 DELIVERED, 1 DRAFT.
      const other = await createCustomer(t, 'CV Lain');
      const a = await createShipment(
        t,
        f.ops,
        shipmentPayload(f, {
          containerId: f.containers[0].id,
          estimatedDeliveryAt: hoursFromNow(24),
        }),
      );
      const b = await createShipment(
        t,
        f.ops,
        shipmentPayload(f, {
          containerId: f.containers[1].id,
          estimatedDeliveryAt: hoursFromNow(96),
        }),
      );
      const c = await createShipment(
        t,
        f.ops,
        shipmentPayload(f, {
          containerId: f.containers[2].id,
          estimatedDeliveryAt: hoursFromNow(48),
        }),
      );
      await createShipment(
        t,
        f.ops,
        shipmentPayload(f, {
          containerId: f.containers[3].id,
          customerId: other.id,
          estimatedDeliveryAt: hoursFromNow(120),
        }),
      );
      await advance(t, f.ops, b.id, 'BOOKED');
      await advance(t, f.ops, c.id, 'BOOKED', 'IN_TRANSIT', 'DELIVERED');
      void a;
      t.clock.set(new Date(NOW.getTime() + 2 * DAY)); // a (ETA +24h) is now overdue; c was delivered
    });
    afterEach(() => t.clock.set(NOW));

    const list = (qs: string) =>
      t
        .http()
        .get(`/api/shipments?${qs}`)
        .set(f.ops.auth)
        .expect(200)
        .then((r) => r.body);

    it('paginates with stable metadata', async () => {
      const page1 = await list('pageSize=3&page=1');
      const page2 = await list('pageSize=3&page=2');
      expect(page1.meta).toEqual({ page: 1, pageSize: 3, total: 4, totalPages: 2 });
      expect(page2.data).toHaveLength(1);
      const ids = [...page1.data, ...page2.data].map((s: { id: string }) => s.id);
      expect(new Set(ids).size).toBe(4);
    });

    it('filters by status, customer, overdue and shipment-number search', async () => {
      expect((await list('status=BOOKED')).meta.total).toBe(1);
      expect((await list(`customerId=${f.customer.id}`)).meta.total).toBe(3);

      const overdue = await list('overdue=true');
      expect(overdue.data).toHaveLength(1);
      expect(overdue.data[0]).toMatchObject({ shipmentNumber: 'CF-2030-00001', isOverdue: true });
      expect((await list('overdue=false')).meta.total).toBe(3);

      expect((await list('search=cf-2030-0000')).meta.total).toBe(4);
      expect((await list('search=00003')).data[0].shipmentNumber).toBe('CF-2030-00003');
    });

    it('sorts by ETA in both directions', async () => {
      const asc = await list('sortBy=estimatedDeliveryAt&sortOrder=asc');
      const etas = asc.data.map((s: { estimatedDeliveryAt: string }) => s.estimatedDeliveryAt);
      expect(etas).toEqual([...etas].sort());
      const desc = await list('sortBy=estimatedDeliveryAt&sortOrder=desc');
      expect(desc.data.map((s: { id: string }) => s.id)).toEqual(
        asc.data.map((s: { id: string }) => s.id).reverse(),
      );
    });

    it('rejects invalid query parameters', async () => {
      await t.http().get('/api/shipments?status=LOST').set(f.ops.auth).expect(400);
      await t.http().get('/api/shipments?overdue=yes').set(f.ops.auth).expect(400);
    });
  });

  describe('edit', () => {
    let draftId: string;

    beforeEach(async () => {
      draftId = (await createShipment(t, f.ops, shipmentPayload(f))).id;
    });

    const patch = (actor: Actor, body: object, id = draftId) =>
      t.http().patch(`/api/shipments/${id}`).set(actor.auth).send(body);

    it('DRAFT: updates route, container and notes, auditing only changed fields', async () => {
      const res = await patch(f.ops, {
        origin: 'Medan (Belawan)',
        destination: 'Surabaya (Tanjung Perak)', // unchanged → not audited
        containerId: f.containers[1].id,
        notes: 'Handle with care',
      }).expect(200);
      expect(res.body).toMatchObject({
        origin: 'Medan (Belawan)',
        container: { id: f.containers[1].id },
      });

      const audit = await t.prisma.auditLog.findFirst({
        where: { entityId: draftId, action: 'UPDATE' },
      });
      expect(Object.keys(audit!.afterData as object).sort()).toEqual([
        'containerId',
        'notes',
        'origin',
      ]);
      expect(audit!.beforeData).toMatchObject({ origin: 'Jakarta (Tanjung Priok)', notes: null });
    });

    it('a no-op update writes no audit record', async () => {
      await patch(f.ops, { origin: 'Jakarta (Tanjung Priok)' }).expect(200);
      expect(await t.prisma.auditLog.count({ where: { action: 'UPDATE' } })).toBe(0);
    });

    it('clears notes with null and rejects an empty patch', async () => {
      await patch(f.ops, { notes: 'x' }).expect(200);
      const cleared = await patch(f.ops, { notes: null }).expect(200);
      expect(cleared.body.notes).toBeNull();
      const empty = await patch(f.ops, {}).expect(400);
      expect(empty.body.code).toBe('VALIDATION_ERROR');
    });

    it('DRAFT: only ADMIN may re-assign the customer', async () => {
      const other = await createCustomer(t);
      const denied = await patch(f.ops, { customerId: other.id }).expect(403);
      expect(denied.body.code).toBe('FORBIDDEN_FIELD');
      await patch(f.admin, { customerId: other.id }).expect(200);
    });

    it('re-validates the route against the stored counterpart', async () => {
      const res = await patch(f.ops, { destination: 'jakarta (tanjung priok)' }).expect(400);
      expect(res.body.code).toBe('INVALID_ROUTE');
    });

    it('refuses to move onto a container in use; keeping its own container is fine', async () => {
      await createShipment(t, f.ops, shipmentPayload(f, { containerId: f.containers[1].id }));
      const res = await patch(f.ops, { containerId: f.containers[1].id }).expect(409);
      expect(res.body.code).toBe('CONTAINER_UNAVAILABLE');
      await patch(f.ops, { containerId: f.containers[0].id }).expect(200);
    });

    it('BOOKED: ETA and notes are editable, other fields are locked', async () => {
      await advance(t, f.ops, draftId, 'BOOKED');
      await patch(f.ops, { estimatedDeliveryAt: hoursFromNow(200), notes: 'delayed' }).expect(200);
      const locked = await patch(f.admin, { origin: 'Bitung' }).expect(409);
      expect(locked.body.code).toBe('FIELD_NOT_EDITABLE');
      const pastEta = await patch(f.ops, { estimatedDeliveryAt: hoursFromNow(-5) }).expect(400);
      expect(pastEta.body.code).toBe('INVALID_ETA');
    });

    it('DELIVERED: read-only for everyone', async () => {
      await advance(t, f.ops, draftId, 'BOOKED', 'IN_TRANSIT', 'DELIVERED');
      const res = await patch(f.admin, { notes: 'late note' }).expect(409);
      expect(res.body.code).toBe('SHIPMENT_LOCKED');
    });

    it('returns 404 when editing an unknown shipment', async () => {
      await patch(f.ops, { notes: 'x' }, 'unknown').expect(404);
    });
  });
});
