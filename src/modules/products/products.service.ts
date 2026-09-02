import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductStatus } from '../../generated/prisma/client';
import { normalizeSlug } from '../../common/utils/slug';
import { createPaginatedResult } from '../../common/types/pagination';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { CreateProductDto } from './dto/create-product.dto';
import { ListAdminProductsDto } from './dto/list-admin-products.dto';
import { ListProductsDto } from './dto/list-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CategoriesService } from '../categories/categories.service';

const productInclude = {
  categories: {
    include: {
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
          isActive: true,
        },
      },
    },
    orderBy: { sortOrder: 'asc' },
  },
  images: {
    orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
  },
} satisfies Prisma.ProductInclude;

type ProductWithRelations = Prisma.ProductGetPayload<{
  include: typeof productInclude;
}>;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(forwardRef(() => CategoriesService))
    private readonly categoriesService: CategoriesService,
  ) {}

  async listPublic(filters: ListProductsDto) {
    if (filters.category) {
      return this.listPublicByCategory(filters);
    }

    const where: Prisma.ProductWhereInput = {
      status: ProductStatus.PUBLISHED,
      ...(filters.featured !== undefined
        ? { isFeatured: filters.featured === 'true' }
        : {}),
      ...(filters.search ? this.searchWhere(filters.search) : {}),
    };
    const [products, totalItems] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        include: productInclude,
        orderBy: [
          { isFeatured: 'desc' },
          { sortOrder: 'asc' },
          { createdAt: 'desc' },
        ],
      }),
      this.prisma.product.count({ where }),
    ]);
    return createPaginatedResult(
      products.map((product) => this.toPublicProduct(product)),
      filters.page,
      filters.limit,
      totalItems,
    );
  }

  async findPublicBySlug(slug: string) {
    const product = await this.prisma.product.findFirst({
      where: { slug, status: ProductStatus.PUBLISHED },
      include: productInclude,
    });
    if (!product) throw new NotFoundException('Product not found');
    return this.toPublicProduct(product);
  }

  async listAdmin(filters: ListAdminProductsDto) {
    if (filters.category) {
      return this.listAdminByCategory(filters);
    }

    const where: Prisma.ProductWhereInput = {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.featured !== undefined
        ? { isFeatured: filters.featured === 'true' }
        : {}),
      ...(filters.search ? this.searchWhere(filters.search) : {}),
    };
    const [products, totalItems] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        include: productInclude,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);
    return createPaginatedResult(
      products.map((product) => this.toAdminProduct(product)),
      filters.page,
      filters.limit,
      totalItems,
    );
  }

  private async listPublicByCategory(filters: ListProductsDto) {
    const where: Prisma.ProductCategoryWhereInput = {
      category: { slug: filters.category, isActive: true },
      product: {
        status: ProductStatus.PUBLISHED,
        ...(filters.featured !== undefined
          ? { isFeatured: filters.featured === 'true' }
          : {}),
        ...(filters.search ? this.searchWhere(filters.search) : {}),
      },
    };
    const [assignments, totalItems] = await this.prisma.$transaction([
      this.prisma.productCategory.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        include: { product: { include: productInclude } },
        orderBy: [{ sortOrder: 'asc' }, { product: { name: 'asc' } }],
      }),
      this.prisma.productCategory.count({ where }),
    ]);
    return createPaginatedResult(
      assignments.map(({ product }) => this.toPublicProduct(product)),
      filters.page,
      filters.limit,
      totalItems,
    );
  }

  private async listAdminByCategory(filters: ListAdminProductsDto) {
    const where: Prisma.ProductCategoryWhereInput = {
      category: { slug: filters.category },
      product: {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.featured !== undefined
          ? { isFeatured: filters.featured === 'true' }
          : {}),
        ...(filters.search ? this.searchWhere(filters.search) : {}),
      },
    };
    const [assignments, totalItems] = await this.prisma.$transaction([
      this.prisma.productCategory.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        include: { product: { include: productInclude } },
        orderBy: [{ sortOrder: 'asc' }, { product: { name: 'asc' } }],
      }),
      this.prisma.productCategory.count({ where }),
    ]);
    return createPaginatedResult(
      assignments.map(({ product }) => this.toAdminProduct(product)),
      filters.page,
      filters.limit,
      totalItems,
    );
  }

  async findAdminById(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: productInclude,
    });
    if (!product) throw new NotFoundException('Product not found');
    return this.toAdminProduct(product);
  }

  async create(dto: CreateProductDto, actorId: string) {
    this.validatePrice(dto.price, dto.showPrice ?? false);
    this.validateSpecifications(dto.specifications);
    await this.categoriesService.ensureCategoriesExist(
      (dto.categories ?? []).map((item) => item.categoryId),
    );
    const slug = this.slugOrThrow(dto.slug ?? dto.name);
    try {
      const product = await this.prisma.product.create({
        data: {
          name: dto.name.trim(),
          slug,
          sku: dto.sku?.trim() || null,
          shortDescription: dto.shortDescription?.trim(),
          description: dto.description?.trim(),
          price: dto.price,
          showPrice: dto.showPrice,
          isFeatured: dto.isFeatured,
          sortOrder: dto.sortOrder,
          specifications: dto.specifications as
            Prisma.InputJsonValue | undefined,
          categories: {
            create: (dto.categories ?? []).map((item) => ({
              categoryId: item.categoryId,
              sortOrder: item.sortOrder,
            })),
          },
        },
        include: productInclude,
      });
      const result = this.toAdminProduct(product);
      await this.audit.record({
        actorId,
        action: AuditAction.PRODUCT_CREATED,
        resource: 'products',
        resourceId: product.id,
        status: 'SUCCESS',
        after: result,
      });
      return result;
    } catch (error: unknown) {
      this.throwUniqueConflict(error);
    }
  }

  async update(id: string, dto: UpdateProductDto, actorId: string) {
    const before = await this.findProductOrThrow(id);
    const effectivePrice =
      dto.price !== undefined ? dto.price : before.price?.toString();
    const effectiveShowPrice = dto.showPrice ?? before.showPrice;
    this.validatePrice(effectivePrice, effectiveShowPrice);
    this.validateSpecifications(dto.specifications);
    if (dto.categories) {
      await this.categoriesService.ensureCategoriesExist(
        dto.categories.map((item) => item.categoryId),
      );
      if (before.status === ProductStatus.PUBLISHED)
        await this.categoriesService.ensureHasActiveCategory(
          dto.categories.map((item) => item.categoryId),
        );
    }

    const data: Prisma.ProductUpdateInput = {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.slug !== undefined ? { slug: this.slugOrThrow(dto.slug) } : {}),
      ...(dto.sku !== undefined ? { sku: dto.sku?.trim() || null } : {}),
      ...(dto.shortDescription !== undefined
        ? { shortDescription: dto.shortDescription?.trim() || null }
        : {}),
      ...(dto.description !== undefined
        ? { description: dto.description?.trim() || null }
        : {}),
      ...(dto.price !== undefined ? { price: dto.price } : {}),
      ...(dto.showPrice !== undefined ? { showPrice: dto.showPrice } : {}),
      ...(dto.isFeatured !== undefined ? { isFeatured: dto.isFeatured } : {}),
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      ...(dto.specifications !== undefined
        ? {
            specifications:
              dto.specifications === null
                ? Prisma.DbNull
                : (dto.specifications as Prisma.InputJsonValue),
          }
        : {}),
    };

    try {
      const product = await this.prisma.$transaction(async (transaction) => {
        await transaction.product.update({ where: { id }, data });
        if (dto.categories) {
          await transaction.productCategory.deleteMany({
            where: { productId: id },
          });
          await transaction.productCategory.createMany({
            data: dto.categories.map((item) => ({
              productId: id,
              categoryId: item.categoryId,
              sortOrder: item.sortOrder,
            })),
          });
        }
        return transaction.product.findUniqueOrThrow({
          where: { id },
          include: productInclude,
        });
      });
      const result = this.toAdminProduct(product);
      await this.audit.record({
        actorId,
        action: AuditAction.PRODUCT_UPDATED,
        resource: 'products',
        resourceId: id,
        status: 'SUCCESS',
        before: this.toAdminProduct(before),
        after: result,
      });
      return result;
    } catch (error: unknown) {
      this.throwUniqueConflict(error);
    }
  }

  async setStatus(id: string, status: ProductStatus, actorId: string) {
    const before = await this.findProductOrThrow(id);
    if (status === ProductStatus.PUBLISHED) {
      await this.categoriesService.ensureHasActiveCategory(
        before.categories.map((item) => item.categoryId as string),
      );
    }
    const product = await this.prisma.product.update({
      where: { id },
      data: {
        status,
        ...(status === ProductStatus.PUBLISHED && !before.publishedAt
          ? { publishedAt: new Date() }
          : {}),
        ...(status === ProductStatus.ARCHIVED ? { isFeatured: false } : {}),
      },
      include: productInclude,
    });
    const result = this.toAdminProduct(product);
    await this.audit.record({
      actorId,
      action: AuditAction.PRODUCT_STATUS_UPDATED,
      resource: 'products',
      resourceId: id,
      status: 'SUCCESS',
      before: this.toAdminProduct(before),
      after: result,
    });
    return result;
  }

  async archive(id: string, actorId: string) {
    const before = await this.findProductOrThrow(id);
    const product = await this.prisma.product.update({
      where: { id },
      data: { status: ProductStatus.ARCHIVED, isFeatured: false },
      include: productInclude,
    });
    const result = this.toAdminProduct(product);
    await this.audit.record({
      actorId,
      action: AuditAction.PRODUCT_ARCHIVED,
      resource: 'products',
      resourceId: id,
      status: 'SUCCESS',
      before: this.toAdminProduct(before),
      after: result,
    });
    return result;
  }

  private async findProductOrThrow(id: string): Promise<ProductWithRelations> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: productInclude,
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async ensureCategoryCanBeDeactivated(categoryId: string) {
    const dependentProducts = await this.prisma.product.count({
      where: {
        status: ProductStatus.PUBLISHED,
        categories: {
          some: { categoryId },
          none: {
            categoryId: { not: categoryId },
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

  private validatePrice(price: string | null | undefined, showPrice: boolean) {
    if (price !== null && price !== undefined && Number(price) < 0)
      throw new BadRequestException('Price cannot be negative');
    if (price !== null && price !== undefined && Number(price) > 9999999999.99)
      throw new BadRequestException('Price exceeds the supported limit');
    if (showPrice && (price === null || price === undefined))
      throw new BadRequestException('Price is required when showPrice is true');
  }

  private validateSpecifications(
    value: Record<string, unknown> | null | undefined,
  ) {
    if (value !== undefined && JSON.stringify(value).length > 20000)
      throw new BadRequestException('Specifications are too large');
  }

  private searchWhere(search: string): Prisma.ProductWhereInput {
    return {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { shortDescription: { contains: search, mode: 'insensitive' } },
      ],
    };
  }

  private slugOrThrow(value: string) {
    const slug = normalizeSlug(value);
    if (!slug) throw new BadRequestException('Slug is invalid');
    if (slug.length > 220) throw new BadRequestException('Slug is too long');
    return slug;
  }

  private toAdminProduct<
    T extends {
      price: { toString(): string } | null;
      images: Array<{ id: string }>;
    },
  >(product: T) {
    return {
      ...product,
      price: product.price?.toString() ?? null,
      images: product.images.map((image) => ({
        ...image,
        url: `/api/v1/product-images/${image.id}`,
      })),
    };
  }

  private toPublicProduct<
    T extends {
      price: { toString(): string } | null;
      showPrice: boolean;
      categories: Array<{ category: { isActive: boolean } }>;
      images: Array<{ id: string }>;
    },
  >(product: T) {
    return {
      ...product,
      price: product.showPrice ? (product.price?.toString() ?? null) : null,
      categories: product.categories.filter((item) => item.category.isActive),
      images: product.images.map((image) => ({
        ...image,
        url: `/api/v1/product-images/${image.id}`,
      })),
    };
  }

  private throwUniqueConflict(error: unknown): never {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    )
      throw new ConflictException('Product slug or SKU already exists');
    throw error;
  }
}
