import { ConfigService } from '@nestjs/config';
import { AuditRetentionService } from './audit-retention.service';
import { mockDependency } from '../../../test/support/mock-dependency';

describe('AuditRetentionService', () => {
  const prisma = {
    auditLog: {
      count: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  const redis = {
    client: { set: jest.fn(), eval: jest.fn() },
  };
  const metrics = {
    recordAuditRetentionSuccess: jest.fn(),
    recordAuditRetentionFailure: jest.fn(),
  };
  const logger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  };
  const values: Record<string, unknown> = {
    AUDIT_RETENTION_ENABLED: true,
    AUDIT_RETENTION_DRY_RUN: false,
    AUDIT_RETENTION_DAYS: 365,
    AUDIT_CLEANUP_BATCH_SIZE: 2,
    AUDIT_CLEANUP_MAX_BATCHES: 10,
  };
  const config = {
    getOrThrow: jest.fn((key: string) => values[key]),
  };
  let service: AuditRetentionService;

  beforeEach(() => {
    jest.clearAllMocks();
    values.AUDIT_RETENTION_ENABLED = true;
    values.AUDIT_RETENTION_DRY_RUN = false;
    redis.client.set.mockResolvedValue('OK');
    redis.client.eval.mockResolvedValue(1);
    service = new AuditRetentionService(
      mockDependency<ConstructorParameters<typeof AuditRetentionService>[0]>(
        prisma,
      ),
      mockDependency<ConstructorParameters<typeof AuditRetentionService>[1]>(
        redis,
      ),
      mockDependency<ConstructorParameters<typeof AuditRetentionService>[2]>(
        metrics,
      ),
      mockDependency<ConfigService>(config),
      mockDependency<ConstructorParameters<typeof AuditRetentionService>[4]>(
        logger,
      ),
    );
  });

  it('não acessa banco ou Redis quando a retenção está desativada', async () => {
    values.AUDIT_RETENTION_ENABLED = false;

    await expect(service.runRetention()).resolves.toMatchObject({
      skipped: true,
      reason: 'disabled',
    });
    expect(redis.client.set).not.toHaveBeenCalled();
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
  });

  it('conta candidatos sem excluir no modo de simulação', async () => {
    values.AUDIT_RETENTION_DRY_RUN = true;
    prisma.auditLog.count.mockResolvedValue(27);

    await expect(service.runRetention()).resolves.toMatchObject({
      dryRun: true,
      candidates: 27,
      deleted: 0,
    });
    expect(prisma.auditLog.deleteMany).not.toHaveBeenCalled();
    expect(metrics.recordAuditRetentionSuccess).toHaveBeenCalledWith(
      0,
      expect.any(Number),
    );
  });

  it('exclui registros antigos em lotes limitados', async () => {
    prisma.auditLog.findMany
      .mockResolvedValueOnce([{ id: 'one' }, { id: 'two' }])
      .mockResolvedValueOnce([{ id: 'three' }]);
    prisma.auditLog.deleteMany
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 1 });

    await expect(service.runRetention()).resolves.toMatchObject({
      skipped: false,
      deleted: 3,
      batches: 2,
    });
    expect(prisma.auditLog.deleteMany).toHaveBeenNthCalledWith(1, {
      where: { id: { in: ['one', 'two'] } },
    });
    expect(redis.client.eval).toHaveBeenCalled();
  });

  it('não executa quando outra instância possui o lock', async () => {
    redis.client.set.mockResolvedValue(null);

    await expect(service.runRetention()).resolves.toMatchObject({
      skipped: true,
      reason: 'distributed-lock',
    });
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
  });
});
