import { ConflictException, NotFoundException } from '@nestjs/common';
import { RbacService } from './rbac.service';
import { mockDependency } from '../../../test/support/mock-dependency';

describe('RbacService', () => {
  const prisma = {
    $transaction: jest.fn(),
    role: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
    permission: { findMany: jest.fn() },
    rolePermission: { deleteMany: jest.fn(), createMany: jest.fn() },
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
    prisma.role.create.mockResolvedValue({ name: 'manager', description: null });

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
});
