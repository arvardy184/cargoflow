import {
  advance,
  BaseFixture,
  createShipment,
  createTestApp,
  nextContainerNumber,
  seedBase,
  shipmentPayload,
  TestApp,
} from './harness';

describe('Customers (integration)', () => {
  let t: TestApp;
  let f: BaseFixture;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    f = await seedBase(t, 1);
  });

  const newCustomer = {
    companyName: '  PT Samudra Biru  ',
    contactPerson: 'Budi Santoso',
    email: ' Budi@Samudra.Example ',
    phone: '+62 31 555 0199',
  };

  it('ADMIN creates a customer (normalised) and the action is audited', async () => {
    const res = await t
      .http()
      .post('/api/customers')
      .set(f.admin.auth)
      .send(newCustomer)
      .expect(201);
    expect(res.body).toMatchObject({
      companyName: 'PT Samudra Biru',
      email: 'budi@samudra.example',
      shipmentCount: 0,
    });
    const audit = await t.prisma.auditLog.findFirst({ where: { entityId: res.body.id } });
    expect(audit).toMatchObject({ entityType: 'CUSTOMER', action: 'CREATE', actorId: f.admin.id });
  });

  it('OPERATIONS can read but not create or update customers', async () => {
    await t.http().get('/api/customers').set(f.ops.auth).expect(200);
    await t.http().get(`/api/customers/${f.customer.id}`).set(f.ops.auth).expect(200);
    const denied = await t
      .http()
      .post('/api/customers')
      .set(f.ops.auth)
      .send(newCustomer)
      .expect(403);
    expect(denied.body.code).toBe('FORBIDDEN');
    await t
      .http()
      .patch(`/api/customers/${f.customer.id}`)
      .set(f.ops.auth)
      .send({ phone: '+62 21 555 9999' })
      .expect(403);
  });

  it('rejects a duplicate company name on create and rename', async () => {
    await t.http().post('/api/customers').set(f.admin.auth).send(newCustomer).expect(201);
    const dup = await t
      .http()
      .post('/api/customers')
      .set(f.admin.auth)
      .send(newCustomer)
      .expect(409);
    expect(dup.body).toMatchObject({
      code: 'DUPLICATE_RESOURCE',
      details: { fields: ['companyName'] },
    });
    await t
      .http()
      .patch(`/api/customers/${f.customer.id}`)
      .set(f.admin.auth)
      .send({ companyName: 'PT Samudra Biru' })
      .expect(409);
  });

  it('updates and audits only changed fields', async () => {
    const res = await t
      .http()
      .patch(`/api/customers/${f.customer.id}`)
      .set(f.admin.auth)
      .send({ phone: '+62 21 555 7777', contactPerson: 'Contact Person' })
      .expect(200);
    expect(res.body.phone).toBe('+62 21 555 7777');
    const audit = await t.prisma.auditLog.findFirst({
      where: { entityId: f.customer.id, action: 'UPDATE' },
    });
    expect(audit!.afterData).toEqual({ phone: '+62 21 555 7777' });
  });

  it('searches by company, contact or email and reports shipment counts', async () => {
    await t.http().post('/api/customers').set(f.admin.auth).send(newCustomer).expect(201);
    await createShipment(t, f.ops, shipmentPayload(f));
    const bySearch = await t
      .http()
      .get('/api/customers?search=samudra')
      .set(f.ops.auth)
      .expect(200);
    expect(bySearch.body.data.map((c: { companyName: string }) => c.companyName)).toEqual([
      'PT Samudra Biru',
    ]);
    const all = await t.http().get('/api/customers').set(f.ops.auth).expect(200);
    const seeded = all.body.data.find((c: { id: string }) => c.id === f.customer.id);
    expect(seeded.shipmentCount).toBe(1);
  });

  it('returns 404 for an unknown customer', async () => {
    await t.http().get('/api/customers/unknown').set(f.ops.auth).expect(404);
  });
});

describe('Containers (integration)', () => {
  let t: TestApp;
  let f: BaseFixture;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    f = await seedBase(t, 3);
  });

  it('registers a container with a normalised ISO 6346 number', async () => {
    const number = nextContainerNumber('ABC');
    const spaced = `${number.slice(0, 4).toLowerCase()} ${number.slice(4, 10)}-${number[10]}`;
    const res = await t
      .http()
      .post('/api/containers')
      .set(f.ops.auth)
      .send({ containerNumber: spaced, containerType: 'REEFER_40' })
      .expect(201);
    expect(res.body).toMatchObject({
      containerNumber: number,
      containerType: 'REEFER_40',
      isAvailable: true,
      activeShipment: null,
    });
    expect(
      await t.prisma.auditLog.count({ where: { entityId: res.body.id, entityType: 'CONTAINER' } }),
    ).toBe(1);
  });

  it('rejects an invalid check digit and a duplicate number', async () => {
    const bad = await t
      .http()
      .post('/api/containers')
      .set(f.ops.auth)
      .send({ containerNumber: 'CSQU3054384', containerType: 'DRY_20' })
      .expect(400);
    expect(bad.body.details[0].field).toBe('containerNumber');
    const dup = await t
      .http()
      .post('/api/containers')
      .set(f.ops.auth)
      .send({ containerNumber: f.containers[0].containerNumber, containerType: 'DRY_20' })
      .expect(409);
    expect(dup.body.code).toBe('DUPLICATE_RESOURCE');
  });

  it('tracks availability through the shipment lifecycle', async () => {
    const s = await createShipment(t, f.ops, shipmentPayload(f));
    const available = async () =>
      (
        await t.http().get('/api/containers?available=true').set(f.ops.auth).expect(200)
      ).body.data.map((c: { id: string }) => c.id);
    const inUse = await t.http().get('/api/containers?available=false').set(f.ops.auth).expect(200);

    expect(await available()).not.toContain(f.containers[0].id);
    expect(inUse.body.data).toMatchObject([
      { id: f.containers[0].id, isAvailable: false, activeShipment: { id: s.id, status: 'DRAFT' } },
    ]);

    await advance(t, f.ops, s.id, 'BOOKED', 'IN_TRANSIT', 'DELIVERED');
    expect(await available()).toContain(f.containers[0].id);
  });

  it('filters by type and number', async () => {
    await t
      .http()
      .post('/api/containers')
      .set(f.ops.auth)
      .send({ containerNumber: nextContainerNumber('RFR'), containerType: 'REEFER_20' })
      .expect(201);
    const reefers = await t
      .http()
      .get('/api/containers?containerType=REEFER_20')
      .set(f.ops.auth)
      .expect(200);
    expect(reefers.body.meta.total).toBe(1);
    const byNumber = await t.http().get('/api/containers?search=rfr').set(f.ops.auth).expect(200);
    expect(byNumber.body.data[0].containerNumber).toMatch(/^RFRU/);
  });
});
