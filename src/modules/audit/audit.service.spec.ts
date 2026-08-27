import { AuditService } from './audit.service';
import { mockDependency } from '../../../test/support/mock-dependency';

describe('AuditService', () => {
  const prisma = {
    $transaction: jest.fn(),
    auditLog: { findMany: jest.fn(), count: jest.fn() },
  };
  let service: AuditService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );
    service = new AuditService(
      mockDependency<ConstructorParameters<typeof AuditService>[0]>(prisma),
    );
  });

  it('normaliza beforeData/afterData e retorna paginação com filtros', async () => {
    prisma.auditLog.findMany.mockResolvedValue([
      {
        id: 'log-id',
        actorId: 'admin-id',
        action: 'RBAC_ROLE_CREATED',
        resource: 'roles',
        resourceId: 'manager',
        status: 'SUCCESS',
        beforeData: { exists: false },
        afterData: { name: 'manager' },
        requestId: null,
        ip: null,
        userAgent: null,
        createdAt: new Date('2026-08-25T12:00:00.000Z'),
      },
    ]);
    prisma.auditLog.count.mockResolvedValue(7);

    const result = await service.list(2, 3, { status: 'SUCCESS' });

    expect(prisma.auditLog.count).toHaveBeenCalledWith({
      where: { status: 'SUCCESS' },
    });
    expect(result).toMatchObject({
      data: [
        {
          id: 'log-id',
          before: { exists: false },
          after: { name: 'manager' },
        },
      ],
      pagination: {
        page: 2,
        limit: 3,
        totalItems: 7,
        totalPages: 3,
        hasNextPage: true,
        hasPreviousPage: true,
      },
    });
  });
});
