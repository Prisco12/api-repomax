import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  DEFAULT_ADMIN_ROLE,
  DEFAULT_USER_ROLE,
  Permission,
} from '../src/modules/authorization/permission-catalog';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  const permissions = await Promise.all(
    Object.values(Permission).map((code) =>
      prisma.permission.upsert({
        where: { code },
        update: {},
        create: { code },
      }),
    ),
  );
  const roles = await Promise.all(
    [DEFAULT_ADMIN_ROLE, DEFAULT_USER_ROLE].map((name) =>
      prisma.role.upsert({
        where: { name },
        update: {},
        create: {
          name,
          description:
            name === DEFAULT_ADMIN_ROLE
              ? 'Template administrator'
              : 'Default user',
        },
      }),
    ),
  );

  for (const role of roles) {
    for (const code of role.name === DEFAULT_ADMIN_ROLE
      ? Object.values(Permission)
      : []) {
      const permission = permissions.find((item) => item.code === code)!;
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: permission.id },
        },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  await prisma.$disconnect();
  console.log('RBAC seed completed');
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
