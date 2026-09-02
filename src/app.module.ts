import { Module, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { validateEnv } from './config/env.schema';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { UsersModule } from './modules/users/users.module';
import { AuditModule } from './modules/audit/audit.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { Request } from 'express';
import { RedisModule } from './infrastructure/redis/redis.module';
import { RateLimitModule } from './modules/rate-limit/rate-limit.module';
import { ObservabilityModule } from './infrastructure/observability/observability.module';
import { traceLogContext } from './infrastructure/observability/trace-context';
import { CategoriesModule } from './modules/categories/categories.module';
import { ProductsModule } from './modules/products/products.module';

const isProduction = process.env.NODE_ENV === 'production';
const prettyLogs = process.env.LOG_PRETTY
  ? process.env.LOG_PRETTY === 'true'
  : !isProduction;

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        errorMessage: 'Too many requests. Please try again later.',
        storage: new ThrottlerStorageRedisService(
          config.getOrThrow<string>('REDIS_URL'),
        ),
        throttlers: [
          {
            name: 'default',
            ttl: config.getOrThrow<number>('RATE_LIMIT_TTL_MS'),
            limit: config.getOrThrow<number>('RATE_LIMIT_MAX'),
          },
        ],
      }),
    }),
    LoggerModule.forRoot({
      forRoutes: [{ path: '/*path', method: RequestMethod.ALL }],
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        quietReqLogger: true,
        genReqId: (request, response) => {
          const incomingId = request.headers['x-request-id'];
          const requestId =
            typeof incomingId === 'string' && incomingId.length > 0
              ? incomingId
              : randomUUID();

          (request as Request).requestId = requestId;
          response.setHeader('x-request-id', requestId);
          return requestId;
        },
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers.set-cookie',
            'res.headers.location',
          ],
          censor: '[Redacted]',
        },
        mixin: () => ({
          service: process.env.OTEL_SERVICE_NAME ?? 'api-postgres',
          environment: process.env.NODE_ENV ?? 'development',
          ...traceLogContext(),
        }),
        transport: prettyLogs
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                singleLine: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname',
              },
            }
          : undefined,
      },
    }),
    HealthModule,
    AuthModule,
    DatabaseModule,
    RedisModule,
    RateLimitModule,
    ObservabilityModule,
    AuditModule,
    RbacModule,
    UsersModule,
    CategoriesModule,
    ProductsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
