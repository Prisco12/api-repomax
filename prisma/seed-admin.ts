import 'dotenv/config';
import * as argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { DEFAULT_ADMIN_ROLE } from '../src/modules/authorization/permission-catalog';

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const databaseUrl = process.env.DATABASE_URL;

  if (!email || !password || !databaseUrl) {
    throw new Error(
      'DATABASE_URL, SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required',
    );
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
  const adminRole = await prisma.role.findUnique({
    where: { name: DEFAULT_ADMIN_ROLE },
  });
  if (!adminRole) {
    throw new Error('Admin role not found. Run "npm run seed:rbac" first.');
  }

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        passwordHash: await argon2.hash(password),
        emailVerifiedAt: new Date(),
      },
    });
    await prisma.userRole.create({
      data: { userId: user.id, roleId: adminRole.id },
    });
    console.log(`Administrator created for ${email}`);
  } else {
    const userRole = await prisma.userRole.findUnique({
      where: { userId_roleId: { userId: user.id, roleId: adminRole.id } },
    });
    if (!userRole) {
      await prisma.$transaction([
        prisma.userRole.create({
          data: { userId: user.id, roleId: adminRole.id },
        }),
        prisma.user.update({
          where: { id: user.id },
          data: { authorizationVersion: { increment: 1 } },
        }),
      ]);
      console.log(`Administrator role assigned to ${email}`);
    } else {
      console.log(
        `Administrator already exists for ${email}; password was not changed`,
      );
    }
  }

  if (!user.emailVerifiedAt) {
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date() },
    });
    console.log(`Administrator email marked as verified for ${email}`);
  }

  await prisma.$disconnect();
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
