import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { DEFAULT_ADMIN_ROLE } from '../authorization/permission-catalog';

@Injectable()
export class RbacService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  async listRoles(actorId: string, includePermissions: boolean) {
    const actorIsAdmin = await this.isAdmin(actorId);
    return this.prisma.role
      .findMany({
        where: actorIsAdmin ? undefined : { name: { not: DEFAULT_ADMIN_ROLE } },
        include: {
          permissions: { include: { permission: { select: { code: true } } } },
        },
        orderBy: { name: 'asc' },
      })
      .then((roles) =>
        roles.map((role) => ({
          name: role.name,
          description: role.description,
          ...(includePermissions
            ? {
                permissions: role.permissions.map(
                  (item) => item.permission.code,
                ),
              }
            : {}),
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
    if (roleName === DEFAULT_ADMIN_ROLE && !(await this.isAdmin(actorId))) {
      throw new ForbiddenException(
        'Only an administrator can modify the admin role',
      );
    }
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
    const before = await this.users.rolesForAudit(userId);
    const changesAdminRole =
      roleNames.includes(DEFAULT_ADMIN_ROLE) ||
      before.roles.includes(DEFAULT_ADMIN_ROLE);
    if (changesAdminRole && !(await this.isAdmin(actorId))) {
      throw new ForbiddenException(
        'Only an administrator can assign or remove the admin role',
      );
    }
    if (
      before.roles.includes(DEFAULT_ADMIN_ROLE) &&
      !roleNames.includes(DEFAULT_ADMIN_ROLE)
    ) {
      const adminCount = await this.prisma.user.count({
        where: { roles: { some: { role: { name: DEFAULT_ADMIN_ROLE } } } },
      });
      if (adminCount <= 1) {
        throw new ConflictException(
          'The last administrator cannot lose the admin role',
        );
      }
    }
    const roles = await this.prisma.role.findMany({
      where: { name: { in: roleNames } },
    });
    if (roles.length !== roleNames.length)
      throw new NotFoundException('One or more roles were not found');
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

  private async isAdmin(userId: string) {
    return Boolean(
      await this.prisma.userRole.findFirst({
        where: { userId, role: { name: DEFAULT_ADMIN_ROLE } },
        select: { userId: true },
      }),
    );
  }
}
