import { BadRequestException } from '@nestjs/common';
import { ProductStatus } from '../../generated/prisma/enums';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  const prisma = {
    product: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    productCategory: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    category: { count: jest.fn() },
    $transaction: jest.fn((operations: unknown[]) => Promise.all(operations)),
  };
  const audit = { record: jest.fn() };
  const service = new ProductsService(prisma as never, audit as never);

  beforeEach(() => jest.clearAllMocks());

  it('requires a price when showPrice is enabled', async () => {
    await expect(
      service.create({ name: 'Amortecedor', showPrice: true }, 'actor-id'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it('uses the category-specific order when a category filter is present', async () => {
    prisma.productCategory.findMany.mockResolvedValue([]);
    prisma.productCategory.count.mockResolvedValue(0);

    await service.listPublic({
      page: 1,
      limit: 20,
      category: 'suspensao',
    });

    expect(prisma.productCategory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ sortOrder: 'asc' }, { product: { name: 'asc' } }],
      }),
    );
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it('does not publish a product without an active category', async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: 'product-id',
      status: ProductStatus.DRAFT,
      publishedAt: null,
      price: null,
      showPrice: false,
      categories: [],
      images: [],
    });

    await expect(
      service.setStatus('product-id', ProductStatus.PUBLISHED, 'actor-id'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it('sets the first publication date and audits publication', async () => {
    const category = {
      productId: 'product-id',
      categoryId: 'category-id',
      sortOrder: 0,
      category: {
        id: 'category-id',
        name: 'Suspensão',
        slug: 'suspensao',
        isActive: true,
      },
    };
    prisma.product.findUnique.mockResolvedValue({
      id: 'product-id',
      status: ProductStatus.DRAFT,
      publishedAt: null,
      price: null,
      showPrice: false,
      categories: [category],
      images: [],
    });
    prisma.category.count.mockResolvedValue(1);
    prisma.product.update.mockResolvedValue({
      id: 'product-id',
      status: ProductStatus.PUBLISHED,
      publishedAt: new Date(),
      price: null,
      showPrice: false,
      categories: [category],
      images: [],
    });
    audit.record.mockResolvedValue({});

    await service.setStatus('product-id', ProductStatus.PUBLISHED, 'actor-id');

    expect(prisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ProductStatus.PUBLISHED,
          publishedAt: expect.any(Date),
        }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PRODUCT_STATUS_UPDATED' }),
    );
  });
});
