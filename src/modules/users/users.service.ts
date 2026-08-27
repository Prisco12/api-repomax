import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import {
  DEFAULT_ADMIN_ROLE,
  DEFAULT_USER_ROLE,
} from '../authorization/permission-catalog';
import { createPaginatedResult } from '../../common/types/pagination';
import { UserForAuthentication } from './domain/user-for-authentication';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(email: string, passwordHash: string) {
    const defaultRole = await this.prisma.role.findUnique({
      where: { name: DEFAULT_USER_ROLE },
      select: { id: true },
    });
    if (!defaultRole) {
      throw new ServiceUnavailableException(
        'Default user role is unavailable. Run the database seed.',
      );
    }
    return this.prisma.user.create({
      data: {
        email,
        passwordHash,
        roles: { create: { roleId: defaultRole.id } },
      },
      select: { id: true, email: true },
    });
  }

  findByEmailForAuth(email: string): Promise<UserForAuthentication | null> {
    return this.prisma.user.findUnique({
      where: { email },
      include: {
        roles: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
      },
    });
  }

  async hasCurrentAuthorizationVersion(id: string, version: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        isActive: true,
        accountStatus: true,
        authorizationVersion: true,
      },
    });
    return (
      !!user &&
      user.isActive &&
      user.accountStatus === 'APPROVED' &&
      user.authorizationVersion === version
    );
  }

  incrementAuthorizationVersionByRoleId(roleId: string) {
    return this.prisma.user.updateMany({
      where: { roles: { some: { roleId } } },
      data: { authorizationVersion: { increment: 1 } },
    });
  }

  async replaceRoles(id: string, roleIds: string[]) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');
    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId: id } }),
      this.prisma.userRole.createMany({
        data: roleIds.map((roleId) => ({ userId: id, roleId })),
      }),
      this.prisma.user.update({
        where: { id },
        data: { authorizationVersion: { increment: 1 } },
      }),
    ]);
    return id;
  }

  async rolesForAudit(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        roles: { include: { role: { select: { name: true } } } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return {
      userId: user.id,
      roles: user.roles.map((item) => item.role.name),
    };
  }

  findAccountTokenUser(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  setEmailVerificationToken(id: string, tokenHash: string, expiresAt: Date) {
    return this.prisma.user.update({
      where: { id },
      data: {
        emailVerificationTokenHash: tokenHash,
        emailVerificationTokenExpiresAt: expiresAt,
      },
    });
  }

  confirmEmail(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: {
        emailVerifiedAt: new Date(),
        emailVerificationTokenHash: null,
        emailVerificationTokenExpiresAt: null,
      },
    });
  }

  setPasswordResetToken(id: string, tokenHash: string, expiresAt: Date) {
    return this.prisma.user.update({
      where: { id },
      data: {
        passwordResetTokenHash: tokenHash,
        passwordResetTokenExpiresAt: expiresAt,
      },
    });
  }

  resetPassword(id: string, passwordHash: string) {
    return this.prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        passwordResetTokenHash: null,
        passwordResetTokenExpiresAt: null,
        authorizationVersion: { increment: 1 },
      },
    });
  }

  async me(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        isActive: true,
        accountStatus: true,
        reviewedAt: true,
        reviewedById: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async list(page: number, limit: number, actorId: string) {
    const actorIsAdmin = await this.isAdmin(actorId);
    const where = actorIsAdmin
      ? {}
      : { roles: { none: { role: { name: DEFAULT_ADMIN_ROLE } } } };
    const [users, totalItems] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          email: true,
          emailVerifiedAt: true,
          isActive: true,
          accountStatus: true,
          reviewedAt: true,
          reviewedById: true,
          createdAt: true,
          roles: { select: { role: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);
    return createPaginatedResult(
      users.map((user) => ({
        ...user,
        roles: user.roles.map(({ role }) => role.name),
      })),
      page,
      limit,
      totalItems,
    );
  }

  async listByApprovalStatus(
    page: number,
    limit: number,
    status?: 'PENDING' | 'APPROVED' | 'REJECTED',
  ) {
    const where = {
      ...(status ? { accountStatus: status } : {}),
      roles: { none: { role: { name: DEFAULT_ADMIN_ROLE } } },
    };
    const [users, totalItems] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          email: true,
          emailVerifiedAt: true,
          accountStatus: true,
          createdAt: true,
        },
        orderBy: { createdAt: status === 'PENDING' ? 'asc' : 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);
    return createPaginatedResult(users, page, limit, totalItems);
  }

  async reviewAccount(
    id: string,
    status: 'APPROVED' | 'REJECTED',
    actorId: string,
  ) {
    const before = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        accountStatus: true,
        roles: { select: { role: { select: { name: true } } } },
      },
    });
    if (!before) throw new NotFoundException('User not found');
    if (before.roles.some(({ role }) => role.name === DEFAULT_ADMIN_ROLE)) {
      throw new ForbiddenException(
        'Administrator accounts are not part of the approval workflow',
      );
    }

    const reviewedAt = new Date();
    const updated = await this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.update({
        where: { id },
        data: {
          accountStatus: status,
          reviewedAt,
          reviewedById: actorId,
          authorizationVersion: { increment: 1 },
        },
        select: {
          id: true,
          email: true,
          accountStatus: true,
          reviewedAt: true,
          reviewedById: true,
        },
      });
      await transaction.refreshToken.deleteMany({ where: { userId: id } });
      return user;
    });

    await this.audit.record({
      actorId,
      action: AuditAction.USER_APPROVAL_UPDATED,
      resource: 'users',
      resourceId: id,
      status: 'SUCCESS',
      before: {
        id: before.id,
        email: before.email,
        accountStatus: before.accountStatus,
      },
      after: updated,
    });
    return updated;
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
