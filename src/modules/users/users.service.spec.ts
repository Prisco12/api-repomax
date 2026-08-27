import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { mockDependency } from '../../../test/support/mock-dependency';

describe('UsersService', () => {
  const prisma = {
    $transaction: jest.fn(),
    role: { findUnique: jest.fn() },
    user: {
      create: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: { deleteMany: jest.fn() },
    userRole: { findFirst: jest.fn() },
  };
  const audit = { record: jest.fn() };
  let service: UsersService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UsersService(
      mockDependency<ConstructorParameters<typeof UsersService>[0]>(prisma),
      mockDependency<ConstructorParameters<typeof UsersService>[1]>(audit),
    );
  });

  it('recusa criar usuário quando a role padrão ainda não foi semeada', async () => {
    prisma.role.findUnique.mockResolvedValue(null);

    await expect(
      service.create('user@example.com', 'password-hash'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('atribui automaticamente a role user ao criar usuário', async () => {
    prisma.role.findUnique.mockResolvedValue({ id: 'role-user' });
    prisma.user.create.mockResolvedValue({
      id: 'user-id',
      email: 'user@example.com',
    });

    await service.create('user@example.com', 'password-hash');

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        email: 'user@example.com',
        passwordHash: 'password-hash',
        roles: { create: { roleId: 'role-user' } },
      },
      select: { id: true, email: true },
    });
  });

  it('aprova cadastro, invalida sessões e registra auditoria', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'user@example.com',
      accountStatus: 'PENDING',
      roles: [],
    });
    prisma.user.update.mockResolvedValue({
      id: 'user-id',
      email: 'user@example.com',
      accountStatus: 'APPROVED',
      reviewedAt: new Date(),
      reviewedById: 'admin-id',
    });
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
    prisma.$transaction.mockImplementation(async (callback) =>
      callback(prisma),
    );

    await service.reviewAccount('user-id', 'APPROVED', 'admin-id');

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountStatus: 'APPROVED',
          reviewedById: 'admin-id',
        }),
      }),
    );
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-id' },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'admin-id',
        action: 'USER_APPROVAL_UPDATED',
      }),
    );
  });

  it('permite reconsiderar um cadastro rejeitado', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'user@example.com',
      accountStatus: 'REJECTED',
      roles: [],
    });
    prisma.user.update.mockResolvedValue({
      id: 'user-id',
      email: 'user@example.com',
      accountStatus: 'APPROVED',
      reviewedAt: new Date(),
      reviewedById: 'admin-id',
    });
    prisma.$transaction.mockImplementation(async (callback) =>
      callback(prisma),
    );

    await expect(
      service.reviewAccount('user-id', 'APPROVED', 'admin-id'),
    ).resolves.toEqual(expect.objectContaining({ accountStatus: 'APPROVED' }));
  });

  it('filtra a lista de validação por cadastros rejeitados', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);
    prisma.$transaction.mockImplementation((operations) =>
      Promise.all(operations),
    );

    await service.listByApprovalStatus(1, 20, 'REJECTED');

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          accountStatus: 'REJECTED',
          roles: { none: { role: { name: 'admin' } } },
        },
      }),
    );
  });

  it('oculta administradores da listagem para um operador comum', async () => {
    prisma.userRole.findFirst.mockResolvedValue(null);
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);
    prisma.$transaction.mockImplementation((operations) =>
      Promise.all(operations),
    );

    await service.list(1, 20, 'operator-id');

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { roles: { none: { role: { name: 'admin' } } } },
      }),
    );
  });

  it('impede alterar aprovação de uma conta administrativa pela API', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'admin-id',
      email: 'admin@example.com',
      accountStatus: 'APPROVED',
      roles: [{ role: { name: 'admin' } }],
    });

    await expect(
      service.reviewAccount('admin-id', 'REJECTED', 'other-admin-id'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
