import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { Logger } from 'nestjs-pino';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { MetricsService } from '../../infrastructure/observability/metrics.service';

const LOCK_KEY = 'audit:retention:lock';
const LOCK_TTL_MS = 30 * 60 * 1_000;

@Injectable()
export class AuditRetentionService {
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly metrics: MetricsService,
    private readonly config: ConfigService,
    private readonly logger: Logger,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async scheduledCleanup() {
    await this.runRetention();
  }

  async runRetention() {
    if (!this.config.getOrThrow<boolean>('AUDIT_RETENTION_ENABLED')) {
      return { skipped: true, reason: 'disabled', deleted: 0 };
    }
    if (this.running) {
      return { skipped: true, reason: 'already-running', deleted: 0 };
    }

    const lockToken = randomUUID();
    const startedAt = Date.now();
    this.running = true;
    let acquired = false;
    try {
      acquired =
        (await this.redis.client.set(
          LOCK_KEY,
          lockToken,
          'PX',
          LOCK_TTL_MS,
          'NX',
        )) === 'OK';
      if (!acquired) {
        return { skipped: true, reason: 'distributed-lock', deleted: 0 };
      }

      const retentionDays = this.config.getOrThrow<number>(
        'AUDIT_RETENTION_DAYS',
      );
      const batchSize = this.config.getOrThrow<number>(
        'AUDIT_CLEANUP_BATCH_SIZE',
      );
      const maxBatches = this.config.getOrThrow<number>(
        'AUDIT_CLEANUP_MAX_BATCHES',
      );
      const dryRun = this.config.getOrThrow<boolean>('AUDIT_RETENTION_DRY_RUN');
      const cutoff = new Date(
        Date.now() - retentionDays * 24 * 60 * 60 * 1_000,
      );

      if (dryRun) {
        const candidates = await this.prisma.auditLog.count({
          where: { createdAt: { lt: cutoff } },
        });
        const durationMs = Date.now() - startedAt;
        this.metrics.recordAuditRetentionSuccess(0, durationMs / 1_000);
        this.logger.log(
          { candidates, cutoff, retentionDays, dryRun: true, durationMs },
          'Audit retention dry run completed',
        );
        return { skipped: false, dryRun: true, candidates, deleted: 0 };
      }

      let deleted = 0;
      let batches = 0;
      while (batches < maxBatches) {
        const candidates = await this.prisma.auditLog.findMany({
          where: { createdAt: { lt: cutoff } },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
          take: batchSize,
        });
        if (candidates.length === 0) break;

        const result = await this.prisma.auditLog.deleteMany({
          where: { id: { in: candidates.map(({ id }) => id) } },
        });
        deleted += result.count;
        batches += 1;
        if (candidates.length < batchSize) break;
      }

      const durationMs = Date.now() - startedAt;
      this.metrics.recordAuditRetentionSuccess(deleted, durationMs / 1_000);
      this.logger.log(
        { deleted, batches, cutoff, retentionDays, durationMs },
        'Audit retention completed',
      );
      return { skipped: false, dryRun: false, deleted, batches };
    } catch (error) {
      this.metrics.recordAuditRetentionFailure();
      this.logger.error(
        { err: error },
        'Audit retention failed; the next scheduled run will retry',
      );
      return { skipped: true, reason: 'error', deleted: 0 };
    } finally {
      if (acquired) {
        await this.releaseLock(lockToken);
      }
      this.running = false;
    }
  }

  private async releaseLock(lockToken: string) {
    try {
      await this.redis.client.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1,
        LOCK_KEY,
        lockToken,
      );
    } catch (error) {
      this.logger.warn(
        { err: error },
        'Unable to release audit retention lock',
      );
    }
  }
}
