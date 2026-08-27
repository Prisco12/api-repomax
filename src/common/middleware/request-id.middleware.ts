import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction) {
    request.requestId =
      request.requestId || request.header('x-request-id') || randomUUID();
    response.setHeader('x-request-id', request.requestId);
    next();
  }
}
