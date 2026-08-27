import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Logger } from 'nestjs-pino';
import { AuthService } from './auth.service';

@Injectable()
export class RefreshTokenCleanupService {
  constructor(
    private readonly auth: AuthService,
    private readonly logger: Logger,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async removeExpiredTokens() {
    const { count } = await this.auth.deleteExpiredTokens();
    this.logger.log({ count }, 'Expired refresh tokens removed');
  }
}
