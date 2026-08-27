import { SetMetadata } from '@nestjs/common';

export const ANY_PERMISSIONS_KEY = 'any_permissions';
export const AnyPermissions = (...permissions: string[]) =>
  SetMetadata(ANY_PERMISSIONS_KEY, permissions);
