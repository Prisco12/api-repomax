import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomBytes, randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuthenticatedUser } from './domain/authenticated-user.interface';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditContext } from '../audit/audit.types';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { EmailService } from '../../infrastructure/email/email.service';
import { UserForAuthentication } from '../users/domain/user-for-authentication';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
    private readonly rateLimit: AuthRateLimitService,
    private readonly email: EmailService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(input: RegisterDto, context: AuditContext) {
    const email = input.email.trim().toLowerCase();
    if (await this.users.findByEmailForAuth(email))
      throw new ConflictException('Email already registered');
    const reservation = await this.rateLimit.reserveRegistration(
      context.ip ?? 'unknown',
    );
    let user;
    try {
      user = await this.users.create(email, await argon2.hash(input.password));
    } catch (error) {
      await this.rateLimit.releaseRegistration(reservation);
      throw error;
    }
    await this.audit.record({
      actorId: user.id,
      action: AuditAction.AUTH_REGISTER,
      resource: 'users',
      resourceId: user.id,
      status: 'SUCCESS',
      after: { email: user.email },
      ...context,
    });
    await this.sendEmailVerification(user.id, user.email);
    return { id: user.id, email: user.email, emailVerificationRequired: true };
  }

  async login(input: LoginDto, context: AuditContext) {
    const email = input.email.trim().toLowerCase();
    const ip = context.ip ?? 'unknown';
    await this.rateLimit.assertLoginAllowed(email, ip);
    const user = await this.users.findByEmailForAuth(email);
    if (
      !user ||
      !user.isActive ||
      !(await argon2.verify(user.passwordHash, input.password))
    ) {
      await this.rateLimit.recordLoginFailure(email, ip);
      await this.audit.record({
        action: AuditAction.AUTH_LOGIN_FAILED,
        resource: 'auth',
        status: 'FAILURE',
        after: { email },
        ...context,
      });
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!user.emailVerifiedAt)
      throw new ForbiddenException('Email verification required');
    await this.rateLimit.clearLoginFailures(email, ip);
    await this.deleteExpiredTokensForUser(user.id);
    const tokens = await this.issueTokens(this.toAuthenticatedUser(user));
    await this.audit.record({
      actorId: user.id,
      action: AuditAction.AUTH_LOGIN_SUCCESS,
      resource: 'auth',
      resourceId: user.id,
      status: 'SUCCESS',
      ...context,
    });
    return tokens;
  }

  async refresh(refreshToken: string, context: AuditContext) {
    const [tokenId, secret] = refreshToken.split('.');
    if (!tokenId || !secret)
      throw new UnauthorizedException('Invalid refresh token');
    const stored = await this.prisma.refreshToken.findUnique({
      where: { id: tokenId },
      include: {
        user: {
          include: {
            roles: {
              include: {
                role: {
                  include: { permissions: { include: { permission: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (
      !stored ||
      stored.revokedAt ||
      stored.expiresAt <= new Date() ||
      !stored.user.emailVerifiedAt ||
      !(await argon2.verify(stored.tokenHash, secret))
    )
      throw new UnauthorizedException('Invalid refresh token');
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    const tokens = await this.issueTokens(
      this.toAuthenticatedUser(stored.user),
    );
    await this.audit.record({
      actorId: stored.user.id,
      action: AuditAction.AUTH_REFRESH,
      resource: 'auth',
      resourceId: stored.user.id,
      status: 'SUCCESS',
      ...context,
    });
    return tokens;
  }

  async logout(refreshToken: string, actorId: string, context: AuditContext) {
    const [tokenId] = refreshToken.split('.');
    if (tokenId)
      await this.prisma.refreshToken.updateMany({
        where: { id: tokenId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    await this.audit.record({
      actorId,
      action: AuditAction.AUTH_LOGOUT,
      resource: 'auth',
      resourceId: actorId,
      status: 'SUCCESS',
      ...context,
    });
  }

  async verifyEmail(token: string, context: AuditContext) {
    const user = await this.validAccountToken(token, 'emailVerification');
    if (user.emailVerifiedAt) return;
    await this.users.confirmEmail(user.id);
    await this.audit.record({
      actorId: user.id,
      action: AuditAction.AUTH_EMAIL_VERIFIED,
      resource: 'users',
      resourceId: user.id,
      status: 'SUCCESS',
      ...context,
    });
  }

  async resendVerification(emailInput: string, context: AuditContext) {
    const email = emailInput.trim().toLowerCase();
    const user = await this.users.findByEmailForAuth(email);
    if (!user || !user.isActive || user.emailVerifiedAt) return;
    const delivered = await this.sendEmailVerification(user.id, user.email);
    await this.audit.record({
      actorId: user.id,
      action: AuditAction.AUTH_VERIFICATION_RESENT,
      resource: 'users',
      resourceId: user.id,
      status: delivered ? 'SUCCESS' : 'FAILURE',
      ...context,
    });
  }

  async forgotPassword(emailInput: string, context: AuditContext) {
    const email = emailInput.trim().toLowerCase();
    const user = await this.users.findByEmailForAuth(email);
    if (!user || !user.isActive || !user.emailVerifiedAt) return;
    const token = await this.createAccountToken(
      user.id,
      (hash, expiresAt) =>
        this.users.setPasswordResetToken(user.id, hash, expiresAt),
      60 * 60 * 1000,
    );
    const delivered = await this.deliverEmail(
      this.email.sendPasswordReset(user.email, token),
      'password reset',
    );
    await this.audit.record({
      actorId: user.id,
      action: AuditAction.AUTH_PASSWORD_RESET_REQUESTED,
      resource: 'users',
      resourceId: user.id,
      status: delivered ? 'SUCCESS' : 'FAILURE',
      ...context,
    });
  }

  async resetPassword(token: string, password: string, context: AuditContext) {
    const user = await this.validAccountToken(token, 'passwordReset');
    await this.users.resetPassword(user.id, await argon2.hash(password));
    await this.prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    await this.audit.record({
      actorId: user.id,
      action: AuditAction.AUTH_PASSWORD_RESET_COMPLETED,
      resource: 'users',
      resourceId: user.id,
      status: 'SUCCESS',
      ...context,
    });
  }

  private async sendEmailVerification(userId: string, email: string) {
    const token = await this.createAccountToken(
      userId,
      (hash, expiresAt) =>
        this.users.setEmailVerificationToken(userId, hash, expiresAt),
      24 * 60 * 60 * 1000,
    );
    return this.deliverEmail(
      this.email.sendVerification(email, token),
      'email verification',
    );
  }

  private async deliverEmail(delivery: Promise<unknown>, purpose: string) {
    try {
      const result = (await delivery) as { messageId?: string };
      this.logger.log(
        `${purpose} email accepted by SMTP${result?.messageId ? ` (${result.messageId})` : ''}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Unable to send ${purpose} email`,
        error instanceof Error ? error.stack : undefined,
      );
      return false;
    }
  }

  private async createAccountToken(
    userId: string,
    persist: (hash: string, expiresAt: Date) => Promise<unknown>,
    ttlMs: number,
  ) {
    const secret = randomBytes(32).toString('base64url');
    await persist(await argon2.hash(secret), new Date(Date.now() + ttlMs));
    return `${userId}.${secret}`;
  }

  private async validAccountToken(
    token: string,
    type: 'emailVerification' | 'passwordReset',
  ) {
    const separator = token.indexOf('.');
    if (separator < 1)
      throw new BadRequestException('Invalid or expired token');
    const userId = token.slice(0, separator);
    const secret = token.slice(separator + 1);
    const user = await this.users.findAccountTokenUser(userId);
    const hash =
      type === 'emailVerification'
        ? user?.emailVerificationTokenHash
        : user?.passwordResetTokenHash;
    const expiresAt =
      type === 'emailVerification'
        ? user?.emailVerificationTokenExpiresAt
        : user?.passwordResetTokenExpiresAt;
    if (
      !user ||
      !hash ||
      !expiresAt ||
      expiresAt <= new Date() ||
      !(await argon2.verify(hash, secret))
    )
      throw new BadRequestException('Invalid or expired token');
    return user;
  }

  async deleteExpiredTokens() {
    return this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
  }

  private async deleteExpiredTokensForUser(userId: string) {
    return this.prisma.refreshToken.deleteMany({
      where: { userId, expiresAt: { lte: new Date() } },
    });
  }

  private toAuthenticatedUser(user: UserForAuthentication): AuthenticatedUser {
    const permissions = user.roles.flatMap(({ role }) =>
      role.permissions.map(({ permission }) => permission.code),
    );
    return {
      id: user.id,
      email: user.email,
      permissions: [...new Set<string>(permissions)],
      authorizationVersion: user.authorizationVersion,
    };
  }

  private async issueTokens(user: AuthenticatedUser) {
    const accessToken = await this.jwt.signAsync(user);
    const id = randomUUID();
    const secret = randomBytes(48).toString('base64url');
    const expiresAt = new Date(
      Date.now() +
        this.config.getOrThrow<number>('JWT_REFRESH_TTL_DAYS') * 86_400_000,
    );
    await this.prisma.refreshToken.create({
      data: {
        id,
        tokenHash: await argon2.hash(secret),
        expiresAt,
        userId: user.id,
      },
    });
    return { accessToken, refreshToken: `${id}.${secret}`, user };
  }
}
