import { AuditService } from './audit.service';
import { mockDependency } from '../../../test/support/mock-dependency';
import { runWithRequestContext } from '../../common/context/request-context';

describe('AuditService', () => {
  const prisma = {
    $transaction: jest.fn(),
    auditLog: { findMany: jest.fn(), count: jest.fn(), create: jest.fn() },
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

  it('inclui o contexto da requisição em registros de auditoria', async () => {
    prisma.auditLog.create.mockResolvedValue({ id: 'log-id' });

    await runWithRequestContext(
      {
        requestId: 'request-id',
        ip: '127.0.0.1',
        userAgent: 'RepoMax test',
      },
      () =>
        service.record({
          action: 'PRODUCT_UPDATED',
          resource: 'products',
          resourceId: 'product-id',
          status: 'SUCCESS',
        }),
    );

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        requestId: 'request-id',
        ip: '127.0.0.1',
        userAgent: 'RepoMax test',
      }),
    });
  });
});
