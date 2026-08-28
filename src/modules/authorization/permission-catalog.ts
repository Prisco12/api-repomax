export const Permission = {
  USERS_READ: 'users:read',
  USERS_CREATE: 'users:create',
  USERS_UPDATE: 'users:update',
  USERS_DELETE: 'users:delete',
  USERS_APPROVE: 'users:approve',
  ROLES_ASSIGN: 'roles:assign',
  ROLES_MANAGE: 'roles:manage',
  AUDIT_READ: 'audit:read',
  PRODUCTS_READ: 'products:read',
  PRODUCTS_CREATE: 'products:create',
  PRODUCTS_UPDATE: 'products:update',
  PRODUCTS_DELETE: 'products:delete',
  PRODUCTS_PUBLISH: 'products:publish',
  CATEGORIES_READ: 'categories:read',
  CATEGORIES_CREATE: 'categories:create',
  CATEGORIES_UPDATE: 'categories:update',
  CATEGORIES_DELETE: 'categories:delete',
} as const;

export type PermissionCode = (typeof Permission)[keyof typeof Permission];

export const DEFAULT_USER_ROLE = 'user';
export const DEFAULT_ADMIN_ROLE = 'admin';
