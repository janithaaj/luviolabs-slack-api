import { validateEnvironment } from './environment';

describe('validateEnvironment', () => {
  const valid = {
    MONGODB_URI: 'mongodb://localhost:27017/luvio',
    REDIS_URL: 'redis://localhost:6379',
    JWT_ACCESS_SECRET: 'a-secure-development-secret-with-32-characters',
    APP_WEB_URL: 'http://localhost:3000',
  };

  it('applies safe defaults', () => {
    expect(validateEnvironment(valid)).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4000,
      JWT_ACCESS_TTL: '15m',
    });
  });

  it('rejects weak signing secrets', () => {
    expect(() =>
      validateEnvironment({ ...valid, JWT_ACCESS_SECRET: 'short' }),
    ).toThrow('Invalid environment configuration');
  });
});
