import { Role } from '@prisma/client';
import { createActor, createTestApp, resetDatabase, TestApp } from './harness';

describe('HTTP pipeline (integration)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
  });
  afterAll(() => t.close());

  it('health check reports database connectivity without auth', async () => {
    await t.http().get('/api/health').expect(200, { status: 'ok', database: 'up' });
  });

  it('sets security headers and hides the framework', async () => {
    const res = await t.http().get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('allows CORS only for the configured web origin, with credentials', async () => {
    const allowed = await t
      .http()
      .options('/api/shipments')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'PATCH');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const denied = await t.http().get('/api/health').set('Origin', 'https://evil.example');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it.each([
    ['malformed JSON', '{"email":', 'application/json', 400, 'MALFORMED_REQUEST_BODY'],
    [
      'oversized body',
      JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(150_000) }),
      'application/json',
      413,
      'PAYLOAD_TOO_LARGE',
    ],
    [
      'unsupported charset',
      '{}',
      'application/json; charset=latin9',
      415,
      'UNSUPPORTED_MEDIA_TYPE',
    ],
  ])('maps %s to a clean error response', async (_label, payload, contentType, status, code) => {
    const res = await t
      .http()
      .post('/api/auth/login')
      .set('Content-Type', contentType)
      .send(payload)
      .expect(status);
    expect(res.body).toMatchObject({ statusCode: status, code, path: '/api/auth/login' });
    expect(res.body.message).not.toMatch(/JSON at position|stack/i);
  });

  it('returns structured field violations for invalid input', async () => {
    const res = await t.http().post('/api/auth/login').send({ email: 'not-an-email' }).expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.details.map((d: { field: string }) => d.field).sort()).toEqual([
      'email',
      'password',
    ]);
  });

  it('answers 404 with the standard body for unknown routes', async () => {
    const ops = await createActor(t, Role.OPERATIONS);
    const res = await t.http().get('/api/does-not-exist').set(ops.auth).expect(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('serves the OpenAPI document', async () => {
    const res = await t.http().get('/api/docs-json').expect(200);
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining([
        '/api/shipments',
        '/api/shipments/{id}/status',
        '/api/dashboard/summary',
      ]),
    );
  });
});
