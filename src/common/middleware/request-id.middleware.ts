import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { runWithRequestContext } from '../context/request-context';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction) {
    request.requestId =
      request.requestId || request.header('x-request-id') || randomUUID();
    response.setHeader('x-request-id', request.requestId);
    runWithRequestContext(
      {
        requestId: request.requestId,
        ip: request.ip,
        userAgent: request.get('user-agent'),
      },
      next,
    );
  }
}
