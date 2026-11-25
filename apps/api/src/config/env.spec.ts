import { loadEnv } from './env';

const base = {
  DATABASE_URL: 'mysql://u:p@localhost:3307/db',
  JWT_SECRET: 'a-sufficiently-long-secret-value-for-tests-123',
};

describe('loadEnv', () => {
  it('applies defaults', () => {
    const env = loadEnv({ ...base });
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4000,
      JWT_EXPIRES_IN_SECONDS: 28800,
      COOKIE_SECURE: false,
      LOGIN_RATE_LIMIT_PER_MINUTE: 10,
    });
  });

  it('coerces numbers and booleans', () => {
    const env = loadEnv({ ...base, PORT: '5000', COOKIE_SECURE: 'true' });
    expect(env.PORT).toBe(5000);
    expect(env.COOKIE_SECURE).toBe(true);
  });

  it('lists every invalid variable', () => {
    expect(() => loadEnv({ JWT_SECRET: 'short' })).toThrow(/DATABASE_URL[\s\S]*JWT_SECRET/);
  });

  it('refuses the example secret in production', () => {
    expect(() =>
      loadEnv({
        ...base,
        NODE_ENV: 'production',
        JWT_SECRET: 'replace-with-a-long-random-development-secret-at-least-32-chars',
      }),
    ).toThrow(/example JWT_SECRET/);
  });
});
