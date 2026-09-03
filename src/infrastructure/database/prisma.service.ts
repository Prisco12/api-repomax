import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from '../../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService) {
    super({
      adapter: new PrismaPg(
        new Pool({
          connectionString: config.getOrThrow<string>('DATABASE_URL'),
          max: config.getOrThrow<number>('DATABASE_POOL_MAX'),
        }),
      ),
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
