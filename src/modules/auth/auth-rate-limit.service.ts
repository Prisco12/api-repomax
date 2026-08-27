import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { RateLimitService } from '../rate-limit/rate-limit.service';

type Counter = { allowed: boolean; retryAfterSeconds: number };

@Injectable()
export class AuthRateLimitService {
  constructor(private readonly rateLimit: RateLimitService) {}

  async reserveRegistration(ip: string) {
    const key = this.key('register:success', ip);
    const hourly = await this.increment(key + ':hour', 3, 3_600);
    if (!hourly.allowed) throw this.quotaException(hourly.retryAfterSeconds);
    const daily = await this.increment(key + ':day', 5, 86_400);
    if (!daily.allowed) {
      await this.rateLimit.client.decr(key + ':hour');
      throw this.quotaException(daily.retryAfterSeconds);
    }
    return { hourlyKey: key + ':hour', dailyKey: key + ':day' };
  }

  async releaseRegistration(reservation: {
    hourlyKey: string;
    dailyKey: string;
  }) {
    await Promise.all([
      this.rateLimit.client.decr(reservation.hourlyKey),
      this.rateLimit.client.decr(reservation.dailyKey),
    ]);
  }

  async assertLoginAllowed(email: string, ip: string) {
    const milliseconds = await this.rateLimit.client.pttl(
      this.key(`login:lock:${email}`, ip),
    );
    if (milliseconds > 0)
      throw new HttpException(
        `Too many failed attempts. Try again in ${Math.ceil(milliseconds / 60_000)} minute(s).`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
  }

  async recordLoginFailure(email: string, ip: string) {
    const baseKey = this.key(`login:failures:${email}`, ip);
    const failures = await this.rateLimit.client.incr(baseKey);
    if (failures === 1) await this.rateLimit.client.expire(baseKey, 86_400);
    const lockSeconds =
      failures >= 16 ? 3_600 : failures >= 11 ? 900 : failures >= 5 ? 300 : 0;
    if (lockSeconds)
      await this.rateLimit.client.set(
        this.key(`login:lock:${email}`, ip),
        '1',
        'EX',
        lockSeconds,
      );
  }

  async clearLoginFailures(email: string, ip: string) {
    await this.rateLimit.client.del(
      this.key(`login:failures:${email}`, ip),
      this.key(`login:lock:${email}`, ip),
    );
  }

  private async increment(
    key: string,
    limit: number,
    ttlSeconds: number,
  ): Promise<Counter> {
    const value = await this.rateLimit.client.incr(key);
    if (value === 1) await this.rateLimit.client.expire(key, ttlSeconds);
    const ttl = await this.rateLimit.client.ttl(key);
    return { allowed: value <= limit, retryAfterSeconds: Math.max(1, ttl) };
  }

  private quotaException(retryAfterSeconds: number) {
    return new HttpException(
      `Registration quota reached. Try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private key(scope: string, value: string) {
    return this.rateLimit.key(scope, value);
  }
}
