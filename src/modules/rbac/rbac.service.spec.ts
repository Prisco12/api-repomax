import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { RbacService } from './rbac.service';
import { mockDependency } from '../../../test/support/mock-dependency';

describe('RbacService', () => {
  const prisma = {
    $transaction: jest.fn(),
    role: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
    permission: { findMany: jest.fn() },
    rolePermission: { deleteMany: jest.fn(), createMany: jest.fn() },
    userRole: { findFirst: jest.fn() },
    user: { count: jest.fn() },
  };
  const users = {
    incrementAuthorizationVersionByRoleId: jest.fn(),
    replaceRoles: jest.fn(),
    rolesForAudit: jest.fn(),
  };
  const audit = { record: jest.fn() };
  let service: RbacService;

  beforeEach(() => {
    jest.clearAllMocks();
    audit.record.mockResolvedValue(undefined);
    prisma.userRole.findFirst.mockResolvedValue({ userId: 'admin-id' });
    prisma.$transaction.mockImplementation((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );
    service = new RbacService(
      mockDependency<ConstructorParameters<typeof RbacService>[0]>(prisma),
      mockDependency<ConstructorParameters<typeof RbacService>[1]>(users),
      mockDependency<ConstructorParameters<typeof RbacService>[2]>(audit),
    );
  });

  it('converte violação de unicidade em conflito de role', async () => {
    prisma.role.create.mockRejectedValue({ code: 'P2002' });

    await expect(
      service.createRole('manager', undefined, 'admin-id'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('registra before e after ao criar uma role', async () => {
    prisma.role.create.mockResolvedValue({
      name: 'manager',
      description: null,
    });

    await service.createRole('manager', undefined, 'admin-id');

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        before: { exists: false },
        after: { name: 'manager', description: null },
      }),
    );
  });

  it('recusa alterar permissões de role inexistente', async () => {
    prisma.role.findUnique.mockResolvedValue(null);

    await expect(
      service.setRolePermissions('missing-role', ['users:read'], 'admin-id'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('registra permissões anteriores e posteriores', async () => {
    prisma.role.findUnique.mockResolvedValue({
      id: 'role-id',
      name: 'manager',
      permissions: [{ permission: { code: 'users:read' } }],
    });
    prisma.permission.findMany.mockResolvedValue([{ id: 'permission-read' }]);
    prisma.rolePermission.deleteMany.mockResolvedValue({ count: 1 });
    prisma.rolePermission.createMany.mockResolvedValue({ count: 1 });
    users.incrementAuthorizationVersionByRoleId.mockResolvedValue({ count: 1 });

    await service.setRolePermissions('manager', ['users:read'], 'admin-id');

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        before: { name: 'manager', permissions: ['users:read'] },
        after: { name: 'manager', permissions: ['users:read'] },
      }),
    );
  });

  it('registra roles anteriores e posteriores do usuário', async () => {
    prisma.role.findMany.mockResolvedValue([{ id: 'role-user', name: 'user' }]);
    users.rolesForAudit.mockResolvedValue({ userId: 'user-id', roles: [] });
    users.replaceRoles.mockResolvedValue('user-id');

    await service.setUserRoles('user-id', ['user'], 'admin-id');

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        before: { userId: 'user-id', roles: [] },
        after: { userId: 'user-id', roles: ['user'] },
      }),
    );
  });

  it('impede não administrador de atribuir o papel admin', async () => {
    prisma.userRole.findFirst.mockResolvedValue(null);
    users.rolesForAudit.mockResolvedValue({
      userId: 'user-id',
      roles: ['user'],
    });

    await expect(
      service.setUserRoles('user-id', ['admin'], 'manager-id'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(users.replaceRoles).not.toHaveBeenCalled();
  });

  it('oculta o papel admin da listagem para não administradores', async () => {
    prisma.userRole.findFirst.mockResolvedValue(null);
    prisma.role.findMany.mockResolvedValue([]);

    await service.listRoles('manager-id', false);

    expect(prisma.role.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { name: { not: 'admin' } } }),
    );
  });

  it('omite permissões da resposta para quem pode apenas atribuir papéis', async () => {
    prisma.userRole.findFirst.mockResolvedValue(null);
    prisma.role.findMany.mockResolvedValue([
      {
        name: 'user',
        description: 'Default user',
        permissions: [{ permission: { code: 'users:read' } }],
      },
    ]);

    await expect(service.listRoles('operator-id', false)).resolves.toEqual([
      { name: 'user', description: 'Default user' },
    ]);
  });

  it('impede remover o papel do último administrador', async () => {
    users.rolesForAudit.mockResolvedValue({
      userId: 'admin-id',
      roles: ['admin'],
    });
    prisma.user.count.mockResolvedValue(1);

    await expect(
      service.setUserRoles('admin-id', ['user'], 'admin-id'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(users.replaceRoles).not.toHaveBeenCalled();
  });
});
