import { HttpStatus } from '@nestjs/common';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { mockDependency } from '../../../test/support/mock-dependency';

describe('AuthRateLimitService', () => {
  const values = new Map<string, number>();
  const client = {
    incr: jest.fn(async (key: string) => {
      const value = (values.get(key) ?? 0) + 1;
      values.set(key, value);
      return value;
    }),
    decr: jest.fn(async (key: string) => {
      values.set(key, (values.get(key) ?? 0) - 1);
      return values.get(key);
    }),
    expire: jest.fn(async () => 1),
    ttl: jest.fn(async () => 3_600),
    pttl: jest.fn(async (key: string) => (values.has(key) ? 300_000 : -2)),
    set: jest.fn(async (key: string) => {
      values.set(key, 1);
      return 'OK';
    }),
    del: jest.fn(async (...keys: string[]) => {
      keys.forEach((key) => values.delete(key));
      return keys.length;
    }),
  };
  const rateLimit = {
    client,
    key: (scope: string, value: string) => `${scope}:${value}`,
  };
  let service: AuthRateLimitService;

  beforeEach(() => {
    values.clear();
    jest.clearAllMocks();
    service = new AuthRateLimitService(
      mockDependency<ConstructorParameters<typeof AuthRateLimitService>[0]>(
        rateLimit,
      ),
    );
  });

  it('bloqueia a sexta tentativa após cinco falhas', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await service.recordLoginFailure('user@example.com', '127.0.0.1');
    }

    await expect(
      service.assertLoginAllowed('user@example.com', '127.0.0.1'),
    ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
    expect(client.set).toHaveBeenCalledWith(
      'login:lock:user@example.com:127.0.0.1',
      '1',
      'EX',
      300,
    );
  });

  it('limita a criação a três cadastros por hora por IP', async () => {
    await service.reserveRegistration('127.0.0.1');
    await service.reserveRegistration('127.0.0.1');
    await service.reserveRegistration('127.0.0.1');

    await expect(
      service.reserveRegistration('127.0.0.1'),
    ).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
  });
});
