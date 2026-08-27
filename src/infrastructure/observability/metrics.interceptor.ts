import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.metrics.enabled || context.getType() !== 'http') {
      return next.handle();
    }

    const startedAt = process.hrtime.bigint();
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const record = (statusCode: number) => {
      const elapsed = Number(process.hrtime.bigint() - startedAt) / 1e9;
      const routePath: unknown = request.route?.path;
      const route = typeof routePath === 'string' ? routePath : 'unmatched';
      this.metrics.recordHttpRequest(
        request.method,
        route,
        statusCode,
        elapsed,
      );
    };

    return next.handle().pipe(
      tap({
        complete: () => record(response.statusCode),
        error: (error: unknown) =>
          record(error instanceof HttpException ? error.getStatus() : 500),
      }),
    );
  }
}
