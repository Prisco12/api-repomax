import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';

export interface PaginationParams {
  page: number;
  limit: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export const PaginationParams = createParamDecorator(
  (_data: unknown, context: ExecutionContext): PaginationParams => {
    const { query } = context
      .switchToHttp()
      .getRequest<{ query: Record<string, unknown> }>();
    const page = parsePositiveInteger(query.page, DEFAULT_PAGE, 'page');
    const limit = parsePositiveInteger(query.limit, DEFAULT_LIMIT, 'limit');
    return { page, limit: Math.min(limit, MAX_LIMIT) };
  },
);

function parsePositiveInteger(
  value: unknown,
  defaultValue: number,
  parameterName: string,
) {
  if (value === undefined) return defaultValue;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new BadRequestException(
      `${parameterName} must be a positive integer`,
    );
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new BadRequestException(
      `${parameterName} must be a positive integer`,
    );
  }
  return parsed;
}
