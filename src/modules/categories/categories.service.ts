import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { normalizeSlug } from '../../common/utils/slug';
import { createPaginatedResult } from '../../common/types/pagination';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { ListAdminCategoriesDto } from './dto/list-admin-categories.dto';
import { ProductStatus } from '../../generated/prisma/enums';

const categorySelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  isActive: true,
  sortOrder: true,
  parentId: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listPublic() {
    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
      select: categorySelect,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const byParent = new Map<string | null, typeof categories>();
    for (const category of categories) {
      const current = byParent.get(category.parentId) ?? [];
      current.push(category);
      byParent.set(category.parentId, current);
    }
    const build = (parentId: string | null): unknown[] =>
      (byParent.get(parentId) ?? []).map((category) => ({
        ...category,
        children: build(category.id),
      }));
    return build(null);
  }

  async findPublicBySlug(slug: string) {
    const category = await this.prisma.category.findFirst({
      where: { slug, isActive: true },
      select: {
        ...categorySelect,
        children: {
          where: { isActive: true },
          select: categorySelect,
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
      },
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async listAdmin(filters: ListAdminCategoriesDto) {
    const where = {
      ...(filters.active !== undefined
        ? { isActive: filters.active === 'true' }
        : {}),
      ...(filters.search
        ? {
            OR: [
              {
                name: {
                  contains: filters.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                slug: {
                  contains: filters.search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };
    const [categories, totalItems] = await this.prisma.$transaction([
      this.prisma.category.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        select: {
          ...categorySelect,
          _count: { select: { children: true, products: true } },
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.category.count({ where }),
    ]);
    return createPaginatedResult(
      categories,
      filters.page,
      filters.limit,
      totalItems,
    );
  }

  async findAdminById(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      select: {
        ...categorySelect,
        parent: { select: categorySelect },
        children: { select: categorySelect, orderBy: { sortOrder: 'asc' } },
        _count: { select: { products: true } },
      },
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async create(dto: CreateCategoryDto, actorId: string) {
    await this.validateParent(dto.parentId);
    const slug = this.slugOrThrow(dto.slug ?? dto.name);
    try {
      const category = await this.prisma.category.create({
        data: {
          name: dto.name.trim(),
          slug,
          description: dto.description?.trim(),
          parentId: dto.parentId,
          isActive: dto.isActive,
          sortOrder: dto.sortOrder,
        },
        select: categorySelect,
      });
      await this.audit.record({
        actorId,
        action: AuditAction.CATEGORY_CREATED,
        resource: 'categories',
        resourceId: category.id,
        status: 'SUCCESS',
        after: category,
      });
      return category;
    } catch (error: unknown) {
      this.throwUniqueConflict(error, 'Category slug already exists');
    }
  }

  async update(id: string, dto: UpdateCategoryDto, actorId: string) {
    const before = await this.findAdminById(id);
    if (dto.parentId !== undefined) await this.validateParent(dto.parentId, id);
    if (dto.isActive === false && before.isActive)
      await this.ensureCanDeactivate(id);
    const data = {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.slug !== undefined ? { slug: this.slugOrThrow(dto.slug) } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description?.trim() || null }
        : {}),
      ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
    };
    try {
      const category = await this.prisma.category.update({
        where: { id },
        data,
        select: categorySelect,
      });
      await this.audit.record({
        actorId,
        action: AuditAction.CATEGORY_UPDATED,
        resource: 'categories',
        resourceId: id,
        status: 'SUCCESS',
        before,
        after: category,
      });
      return category;
    } catch (error: unknown) {
      this.throwUniqueConflict(error, 'Category slug already exists');
    }
  }

  async setStatus(id: string, isActive: boolean, actorId: string) {
    const before = await this.findAdminById(id);
    if (!isActive && before.isActive) await this.ensureCanDeactivate(id);
    const category = await this.prisma.category.update({
      where: { id },
      data: { isActive },
      select: categorySelect,
    });
    await this.audit.record({
      actorId,
      action: AuditAction.CATEGORY_STATUS_UPDATED,
      resource: 'categories',
      resourceId: id,
      status: 'SUCCESS',
      before,
      after: category,
    });
    return category;
  }

  async remove(id: string, actorId: string) {
    const before = await this.findAdminById(id);
    if (before.children.length || before._count.products) {
      return this.setStatus(id, false, actorId);
    }
    await this.prisma.category.delete({ where: { id } });
    await this.audit.record({
      actorId,
      action: AuditAction.CATEGORY_DELETED,
      resource: 'categories',
      resourceId: id,
      status: 'SUCCESS',
      before,
      after: { deleted: true },
    });
    return { id, deleted: true };
  }

  private async validateParent(parentId?: string | null, categoryId?: string) {
    if (!parentId) return;
    if (parentId === categoryId)
      throw new BadRequestException('Category cannot be its own parent');
    let current: string | null = parentId;
    for (let depth = 0; current && depth < 100; depth += 1) {
      const parent: { id: string; parentId: string | null } | null =
        await this.prisma.category.findUnique({
          where: { id: current },
          select: { id: true, parentId: true },
        });
      if (!parent) throw new NotFoundException('Parent category not found');
      if (parent.id === categoryId)
        throw new BadRequestException(
          'Category hierarchy cannot contain cycles',
        );
      current = parent.parentId;
    }
    if (current)
      throw new BadRequestException('Category hierarchy is too deep');
  }

  private async ensureCanDeactivate(id: string) {
    const dependentProducts = await this.prisma.product.count({
      where: {
        status: ProductStatus.PUBLISHED,
        categories: {
          some: { categoryId: id },
          none: {
            categoryId: { not: id },
            category: { isActive: true },
          },
        },
      },
    });
    if (dependentProducts)
      throw new ConflictException(
        'Category is the last active category of one or more published products',
      );
  }

  private slugOrThrow(value: string) {
    const slug = normalizeSlug(value);
    if (!slug) throw new BadRequestException('Slug is invalid');
    if (slug.length > 180) throw new BadRequestException('Slug is too long');
    return slug;
  }

  private throwUniqueConflict(error: unknown, message: string): never {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    )
      throw new ConflictException(message);
    throw error;
  }
}
