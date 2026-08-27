import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { mockDependency } from '../../../../test/support/mock-dependency';
import { ANY_PERMISSIONS_KEY } from '../decorators/any-permissions.decorator';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() };

  const context = (permissions: string[]) =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => ({ user: { permissions } }) }),
    }) as unknown as ExecutionContext;

  const required = (all: string[] = [], any: string[] = []) => {
    reflector.getAllAndOverride.mockImplementation((key: string) =>
      key === PERMISSIONS_KEY ? all : key === ANY_PERMISSIONS_KEY ? any : [],
    );
  };

  let guard: PermissionsGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new PermissionsGuard(mockDependency<Reflector>(reflector));
  });

  it('mantém Permissions com semântica de exigir todas', () => {
    required(['users:read', 'users:approve']);

    expect(guard.canActivate(context(['users:read']))).toBe(false);
    expect(guard.canActivate(context(['users:read', 'users:approve']))).toBe(
      true,
    );
  });

  it('aceita qualquer permissão declarada por AnyPermissions', () => {
    required([], ['roles:manage', 'roles:assign']);

    expect(guard.canActivate(context(['roles:assign']))).toBe(true);
    expect(guard.canActivate(context(['users:read']))).toBe(false);
  });
});
