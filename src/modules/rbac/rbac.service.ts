import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';

@Injectable()
export class RbacService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  listRoles() {
    return this.prisma.role
      .findMany({
        include: {
          permissions: { include: { permission: { select: { code: true } } } },
        },
        orderBy: { name: 'asc' },
      })
      .then((roles) =>
        roles.map((role) => ({
          name: role.name,
          description: role.description,
          permissions: role.permissions.map((item) => item.permission.code),
        })),
      );
  }

  listPermissions() {
    return this.prisma.permission.findMany({
      select: { code: true, description: true },
      orderBy: { code: 'asc' },
    });
  }

  async createRole(
    name: string,
    description: string | undefined,
    actorId: string,
  ) {
    try {
      const role = await this.prisma.role.create({
        data: { name, description },
        select: { name: true, description: true },
      });
      await this.audit.record({
        actorId,
        action: AuditAction.RBAC_ROLE_CREATED,
        resource: 'roles',
        resourceId: role.name,
        status: 'SUCCESS',
        before: { exists: false },
        after: role,
      });
      return role;
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      )
        throw new ConflictException('Role already exists');
      throw error;
    }
  }

  async setRolePermissions(roleName: string, codes: string[], actorId: string) {
    const role = await this.prisma.role.findUnique({
      where: { name: roleName },
      include: {
        permissions: {
          include: { permission: { select: { code: true } } },
        },
      },
    });
    if (!role) throw new NotFoundException('Role not found');
    const before = {
      name: role.name,
      permissions: role.permissions.map((item) => item.permission.code),
    };
    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: codes } },
    });
    if (permissions.length !== codes.length)
      throw new ServiceUnavailableException(
        'Permissions are not synchronized. Run the database seed.',
      );
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId: role.id } }),
      this.prisma.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId: role.id,
          permissionId: permission.id,
        })),
      }),
      this.users.incrementAuthorizationVersionByRoleId(role.id),
    ]);
    const result = { name: role.name, permissions: codes };
    await this.audit.record({
      actorId,
      action: AuditAction.RBAC_ROLE_PERMISSIONS_UPDATED,
      resource: 'roles',
        resourceId: role.id,
        status: 'SUCCESS',
        before,
        after: result,
    });
    return result;
  }

  async setUserRoles(userId: string, roleNames: string[], actorId: string) {
    const roles = await this.prisma.role.findMany({
      where: { name: { in: roleNames } },
    });
    if (roles.length !== roleNames.length)
      throw new NotFoundException('One or more roles were not found');
    const before = await this.users.rolesForAudit(userId);
    const id = await this.users.replaceRoles(
      userId,
      roles.map((role) => role.id),
    );
    const result = { userId: id, roles: roleNames };
    await this.audit.record({
      actorId,
      action: AuditAction.RBAC_USER_ROLES_UPDATED,
      resource: 'users',
        resourceId: id,
        status: 'SUCCESS',
        before,
        after: result,
    });
    return result;
  }
}
