import { AuditService } from './audit.service';
import { mockDependency } from '../../../test/support/mock-dependency';
import { runWithRequestContext } from '../../common/context/request-context';

describe('AuditService', () => {
  const prisma = {
    $transaction: jest.fn(),
    auditLog: { findMany: jest.fn(), count: jest.fn(), create: jest.fn() },
    user: { findMany: jest.fn() },
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
    prisma.user.findMany.mockResolvedValue([
      { id: 'admin-id', email: 'admin@example.com' },
    ]);

    const result = await service.list(2, 3, { status: 'SUCCESS' });

    expect(prisma.auditLog.count).toHaveBeenCalledWith({
      where: { status: 'SUCCESS' },
    });
    expect(result).toMatchObject({
      data: [
        {
          id: 'log-id',
          actor: { id: 'admin-id', email: 'admin@example.com' },
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
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['admin-id'] } },
      select: { id: true, email: true },
    });
  });

  it('não consulta usuários quando os eventos foram gerados pelo sistema', async () => {
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.auditLog.count.mockResolvedValue(0);

    await service.list(1, 20, {});

    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('filtra os eventos por trecho do e-mail do ator', async () => {
    prisma.user.findMany.mockResolvedValueOnce([{ id: 'admin-id' }]);
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.auditLog.count.mockResolvedValue(0);

    await service.list(1, 20, { actorEmail: 'ADMIN@EXAMPLE' });

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        email: { contains: 'ADMIN@EXAMPLE', mode: 'insensitive' },
      },
      select: { id: true },
    });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { actorId: { in: ['admin-id'] } },
      }),
    );
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
