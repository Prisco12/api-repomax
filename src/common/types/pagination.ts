export interface PaginationMeta {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: PaginationMeta;
}

export function createPaginatedResult<T>(
  data: T[],
  page: number,
  limit: number,
  totalItems: number,
): PaginatedResult<T> {
  const totalPages = Math.ceil(totalItems / limit);
  return {
    data,
    pagination: {
      page,
      limit,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

export function isPaginatedResult(
  value: unknown,
): value is PaginatedResult<unknown> {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<PaginatedResult<unknown>>;
  return Array.isArray(result.data) && !!result.pagination;
}
