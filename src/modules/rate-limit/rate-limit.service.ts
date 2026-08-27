import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { RedisService } from '../../infrastructure/redis/redis.service';

@Injectable()
export class RateLimitService {
  constructor(private readonly redis: RedisService) {}

  get client() {
    return this.redis.client;
  }

  key(scope: string, value: string) {
    const hash = createHash('sha256').update(value).digest('hex');
    return `rate-limit:${scope}:${hash}`;
  }
}
