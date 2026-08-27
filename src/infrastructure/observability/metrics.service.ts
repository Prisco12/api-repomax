import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  collectDefaultMetrics,
  Counter,
  Histogram,
  Registry,
} from '@prometheus-io/client';

type HttpMetricLabels = 'method' | 'route' | 'status_code';

@Injectable()
export class MetricsService {
  readonly enabled: boolean;
  private readonly registry = new Registry();
  private readonly requests: Counter<HttpMetricLabels>;
  private readonly duration: Histogram<HttpMetricLabels>;

  constructor(config: ConfigService) {
    this.enabled = config.getOrThrow<boolean>('METRICS_ENABLED');
    this.registry.setDefaultLabels({
      service: config.getOrThrow<string>('OTEL_SERVICE_NAME'),
      environment: config.getOrThrow<string>('NODE_ENV'),
    });
    this.requests = new Counter({
      name: 'http_server_requests_total',
      help: 'Total number of HTTP requests handled by the API.',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });
    this.duration = new Histogram({
      name: 'http_server_request_duration_seconds',
      help: 'Duration of HTTP requests handled by the API in seconds.',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    if (this.enabled) {
      collectDefaultMetrics({ register: this.registry, prefix: 'nodejs_' });
    }
  }

  recordHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    durationSeconds: number,
  ) {
    if (!this.enabled) return;
    const labels = { method, route, status_code: String(statusCode) };
    this.requests.inc(labels);
    this.duration.observe(labels, durationSeconds);
  }

  contentType() {
    return this.registry.contentType;
  }

  render() {
    return this.registry.metrics();
  }
}
