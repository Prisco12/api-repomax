import { ConfigService } from '@nestjs/config';
import { MetricsService } from './metrics.service';

function createConfig(enabled: boolean): ConfigService {
  const values: Record<string, unknown> = {
    METRICS_ENABLED: enabled,
    OTEL_SERVICE_NAME: 'api-postgres-test',
    NODE_ENV: 'test',
  };

  return {
    getOrThrow: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

describe('MetricsService', () => {
  it('records HTTP metrics when enabled', async () => {
    const service = new MetricsService(createConfig(true));

    service.recordHttpRequest('GET', '/api/v1/health', 200, 0.025);

    const output = await service.render();
    expect(output).toContain('http_server_requests_total');
    expect(output).toContain('route="/api/v1/health"');
    expect(output).toContain('status_code="200"');
  });

  it('does not record HTTP requests when disabled', async () => {
    const service = new MetricsService(createConfig(false));

    service.recordHttpRequest('GET', '/api/v1/health', 200, 0.025);

    const output = await service.render();
    expect(output).not.toContain('route="/api/v1/health"');
  });
});
