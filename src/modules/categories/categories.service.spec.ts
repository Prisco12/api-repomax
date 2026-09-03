import { BadRequestException, ConflictException } from '@nestjs/common';
import { CategoriesService } from './categories.service';

describe('CategoriesService', () => {
  const prisma = {
    category: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    productCategory: { groupBy: jest.fn() },
    $transaction: jest.fn((operations: unknown[]) => Promise.all(operations)),
  };
  const audit = { record: jest.fn() };
  const products = { ensureCategoryCanBeDeactivated: jest.fn() };
  const service = new CategoriesService(
    prisma as never,
    audit as never,
    products as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('counts usage only for categories on the requested page', async () => {
    prisma.category.findMany.mockResolvedValue([
      { id: 'category-id', name: 'Suspensão' },
    ]);
    prisma.category.count.mockResolvedValue(1);
    prisma.productCategory.groupBy.mockResolvedValue([
      { categoryId: 'category-id', _count: { _all: 4 } },
    ]);
    prisma.category.groupBy.mockResolvedValue([
      { parentId: 'category-id', _count: { _all: 2 } },
    ]);

    const result = await service.listAdmin({ page: 1, limit: 20 });

    expect(prisma.productCategory.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { categoryId: { in: ['category-id'] } },
      }),
    );
    expect(result.data[0]).toMatchObject({
      _count: { products: 4, children: 2 },
    });
  });

  it('normalizes the generated slug and audits creation', async () => {
    prisma.category.create.mockResolvedValue({
      id: 'category-id',
      name: 'Suspensão Dianteira',
      slug: 'suspensao-dianteira',
    });
    audit.record.mockResolvedValue({});

    await service.create({ name: 'Suspensão Dianteira' }, 'actor-id');

    expect(prisma.category.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slug: 'suspensao-dianteira' }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CATEGORY_CREATED' }),
    );
  });

  it('does not allow a category to be its own parent', async () => {
    prisma.category.findUnique.mockResolvedValue({
      id: 'd9428888-122b-11e1-b85c-61cd3cbb3210',
      children: [],
      _count: { products: 0 },
    });
    await expect(
      service.update(
        'd9428888-122b-11e1-b85c-61cd3cbb3210',
        { parentId: 'd9428888-122b-11e1-b85c-61cd3cbb3210' },
        'actor-id',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not deactivate the last active category of a published product', async () => {
    prisma.category.findUnique.mockResolvedValue({
      id: 'category-id',
      isActive: true,
      children: [],
      _count: { products: 1 },
    });
    prisma.category.findMany.mockResolvedValue([]);
    products.ensureCategoryCanBeDeactivated.mockRejectedValueOnce(
      new ConflictException(),
    );

    await expect(
      service.setStatus('category-id', false, 'actor-id'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(products.ensureCategoryCanBeDeactivated).toHaveBeenCalledWith(
      'category-id',
    );
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it('does not deactivate a category with active descendants', async () => {
    prisma.category.findUnique.mockResolvedValue({
      id: 'category-id',
      isActive: true,
      children: [],
      _count: { products: 0 },
    });
    prisma.category.findMany.mockResolvedValue([
      { id: 'child-id', isActive: true },
    ]);

    await expect(
      service.setStatus('category-id', false, 'actor-id'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(products.ensureCategoryCanBeDeactivated).not.toHaveBeenCalled();
    expect(prisma.category.update).not.toHaveBeenCalled();
  });
});
