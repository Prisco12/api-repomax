export const Permission = {
  USERS_READ: 'users:read',
  USERS_CREATE: 'users:create',
  USERS_UPDATE: 'users:update',
  USERS_DELETE: 'users:delete',
  ROLES_MANAGE: 'roles:manage',
  AUDIT_READ: 'audit:read',
} as const;

export type PermissionCode = (typeof Permission)[keyof typeof Permission];

export const DEFAULT_USER_ROLE = 'user';
export const DEFAULT_ADMIN_ROLE = 'admin';
