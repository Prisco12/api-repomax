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

  it('records audit retention metrics when enabled', async () => {
    const service = new MetricsService(createConfig(true));

    service.recordAuditRetentionSuccess(25, 1.5);
    service.recordAuditRetentionFailure();

    const output = await service.render();
    expect(output).toMatch(/audit_retention_deleted_total\{[^}]+\} 25/);
    expect(output).toMatch(/audit_retention_failures_total\{[^}]+\} 1/);
    expect(output).toContain('audit_retention_duration_seconds');
    expect(output).toContain('audit_retention_last_success_timestamp_seconds');
  });
});
