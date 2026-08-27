import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { ANY_PERMISSIONS_KEY } from '../decorators/any-permissions.decorator';
import { AuthenticatedUser } from '../../auth/domain/authenticated-user.interface';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredAll = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const requiredAny = this.reflector.getAllAndOverride<string[]>(
      ANY_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredAll?.length && !requiredAny?.length) return true;
    const user = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>().user;
    const permissions = user?.permissions ?? [];
    const hasAll =
      !requiredAll?.length ||
      requiredAll.every((permission) => permissions.includes(permission));
    const hasAny =
      !requiredAny?.length ||
      requiredAny.some((permission) => permissions.includes(permission));
    return hasAll && hasAny;
  }
}
