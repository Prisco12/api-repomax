import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CreateAuditLog } from './audit.types';
import { ListAuditLogsDto } from './dto/list-audit-logs.dto';
import { createPaginatedResult } from '../../common/types/pagination';
import { getRequestContext } from '../../common/context/request-context';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(input: CreateAuditLog) {
    const context = getRequestContext();
    return this.prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        resource: input.resource,
        resourceId: input.resourceId,
        status: input.status,
        beforeData: input.before,
        afterData: input.after,
        requestId: input.requestId ?? context?.requestId,
        ip: input.ip ?? context?.ip,
        userAgent: input.userAgent ?? context?.userAgent,
      },
    });
  }

  async list(page: number, limit: number, filters: ListAuditLogsDto) {
    const where: Record<string, unknown> = {};
    for (const key of [
      'actorId',
      'action',
      'resource',
      'resourceId',
      'status',
    ] as const) {
      if (filters[key]) where[key] = filters[key];
    }
    if (filters.from || filters.to) {
      where.createdAt = {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(filters.to) } : {}),
      };
    }
    const [logs, totalItems] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return createPaginatedResult(
      logs.map((log) => ({
        id: log.id,
        actorId: log.actorId,
        action: log.action,
        resource: log.resource,
        resourceId: log.resourceId,
        status: log.status,
        before: log.beforeData,
        after: log.afterData,
        requestId: log.requestId,
        ip: log.ip,
        userAgent: log.userAgent,
        createdAt: log.createdAt,
      })),
      page,
      limit,
      totalItems,
    );
  }
}
