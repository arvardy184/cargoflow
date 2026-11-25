import { Role } from '@prisma/client';
import { createActor, createTestApp, resetDatabase, TEST_PASSWORD, TestApp } from './harness';

describe('Authentication (integration)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => resetDatabase(t.prisma));

  it('logs in with case-insensitive email, sets an httpOnly cookie and returns a bearer token', async () => {
    const admin = await createActor(t, Role.ADMIN, 'boss@test.local');
    const res = await t
      .http()
      .post('/api/auth/login')
      .send({ email: '  BOSS@Test.Local ', password: TEST_PASSWORD })
      .expect(200);

    expect(res.body).toMatchObject({
      user: { id: admin.id, email: 'boss@test.local', role: 'ADMIN', fullName: 'Test Admin' },
      accessToken: expect.any(String),
      expiresAt: '2030-01-15T16:00:00.000Z', // NOW + 8h from the fixed clock
    });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);

    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/cargoflow_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('authenticates /auth/me with the cookie or the bearer token', async () => {
    const ops = await createActor(t, Role.OPERATIONS);
    await t.http().get('/api/auth/me').set(ops.auth).expect(200);
    await t
      .http()
      .get('/api/auth/me')
      .set('Cookie', `cargoflow_session=${ops.token}`)
      .expect(200)
      .expect(({ body }) => expect(body.role).toBe('OPERATIONS'));
  });

  it('returns the same 401 for an unknown email and a wrong password', async () => {
    await createActor(t, Role.ADMIN, 'known@test.local');
    const wrongPassword = await t
      .http()
      .post('/api/auth/login')
      .send({ email: 'known@test.local', password: 'nope' })
      .expect(401);
    const unknownEmail = await t
      .http()
      .post('/api/auth/login')
      .send({ email: 'ghost@test.local', password: 'nope' })
      .expect(401);
    expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
    expect(wrongPassword.body.code).toBe('UNAUTHENTICATED');
  });

  it('rejects protected routes without or with a tampered token', async () => {
    const ops = await createActor(t, Role.OPERATIONS);
    await t.http().get('/api/shipments').expect(401);
    const tampered = ops.token.slice(0, -2) + (ops.token.endsWith('aa') ? 'bb' : 'aa');
    await t.http().get('/api/shipments').set('Authorization', `Bearer ${tampered}`).expect(401);
  });

  it('treats a token for a deleted user as an invalid session on /auth/me', async () => {
    const ops = await createActor(t, Role.OPERATIONS);
    await t.prisma.user.delete({ where: { id: ops.id } });
    await t.http().get('/api/auth/me').set(ops.auth).expect(401);
  });

  it('logout clears the cookie', async () => {
    const res = await t.http().post('/api/auth/logout').expect(204);
    expect(String(res.headers['set-cookie'])).toMatch(
      /cargoflow_session=;.*Expires=Thu, 01 Jan 1970/,
    );
  });
});

describe('Login rate limiting (integration)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ LOGIN_RATE_LIMIT_PER_MINUTE: '3' });
  });
  afterAll(() => t.close());

  it('answers 429 after the per-minute limit, without affecting other routes', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await t
        .http()
        .post('/api/auth/login')
        .send({ email: 'x@test.local', password: 'x' });
      statuses.push(res.status);
    }
    expect(statuses).toEqual([401, 401, 401, 429, 429]);
    await t.http().get('/api/health').expect(200);
  });
});
