import { ServiceUnavailableException } from '@nestjs/common';
import { UsersService } from './users.service';
import { mockDependency } from '../../../test/support/mock-dependency';

describe('UsersService', () => {
  const prisma = {
    role: { findUnique: jest.fn() },
    user: { create: jest.fn() },
  };
  let service: UsersService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UsersService(
      mockDependency<ConstructorParameters<typeof UsersService>[0]>(prisma),
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
    prisma.user.create.mockResolvedValue({ id: 'user-id', email: 'user@example.com' });

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
});
