import { validateEnv } from './env.schema';

describe('environment schema', () => {
  const required = {
    JWT_ACCESS_SECRET: 'a-secure-secret-with-at-least-32-characters',
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/test',
  };

  it('aplica padrões seguros para retenção de auditoria', () => {
    expect(validateEnv(required)).toMatchObject({
      AUDIT_RETENTION_ENABLED: true,
      AUDIT_RETENTION_DRY_RUN: false,
      AUDIT_RETENTION_DAYS: 365,
      AUDIT_CLEANUP_BATCH_SIZE: 1_000,
      AUDIT_CLEANUP_MAX_BATCHES: 100,
    });
  });

  it('recusa retenção inferior a 30 dias', () => {
    expect(() =>
      validateEnv({ ...required, AUDIT_RETENTION_DAYS: '29' }),
    ).toThrow();
  });
});
