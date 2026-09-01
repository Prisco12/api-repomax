import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  LOG_PRETTY: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  METRICS_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  OTEL_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  OTEL_SERVICE_NAME: z.string().default('api-postgres'),
  OTEL_SERVICE_VERSION: z.string().default('0.1.0'),
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: z
    .string()
    .url()
    .default('http://localhost:4318/v1/traces'),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  MAIL_HOST: z.string().default('localhost'),
  MAIL_PORT: z.coerce.number().int().positive().default(1025),
  MAIL_FROM: z.string().min(3).default('no-reply@example.com'),
  MAIL_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  MAIL_USER: z.string().optional(),
  MAIL_PASSWORD: z.string().optional(),
  RATE_LIMIT_TTL_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  AUDIT_RETENTION_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  AUDIT_RETENTION_DRY_RUN: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  AUDIT_RETENTION_DAYS: z.coerce.number().int().min(30).default(365),
  AUDIT_CLEANUP_BATCH_SIZE: z.coerce
    .number()
    .int()
    .min(100)
    .max(5_000)
    .default(1_000),
  AUDIT_CLEANUP_MAX_BATCHES: z.coerce
    .number()
    .int()
    .min(1)
    .max(1_000)
    .default(100),
  FILE_STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  FILE_LOCAL_DIRECTORY: z.string().default('./uploads'),
  FILE_SIGNED_URL_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(86_400)
    .default(900),
  AWS_REGION: z.string().default('sa-east-1'),
  AWS_S3_BUCKET: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  DATABASE_URL: z.string().url(),
});

export function validateEnv(config: Record<string, unknown>) {
  return envSchema.parse(config);
}
