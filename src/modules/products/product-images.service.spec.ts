import { BadRequestException } from '@nestjs/common';
import { ProductImagesService } from './product-images.service';

describe('ProductImagesService', () => {
  const prisma = {
    product: { findUnique: jest.fn() },
    productImage: { findFirst: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const storage = {
    upload: jest.fn(),
    remove: jest.fn(),
    getDownloadUrl: jest.fn(),
    getLocalPath: jest.fn(),
  };
  const audit = { record: jest.fn() };
  const service = new ProductImagesService(
    prisma as never,
    storage as never,
    audit as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('rejects image formats outside the allowed list before storing', async () => {
    await expect(
      service.upload(
        'product-id',
        {
          mimetype: 'image/gif',
          size: 100,
          buffer: Buffer.from('image'),
          originalname: 'image.gif',
        },
        'actor-id',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('rejects images larger than 5 MB', async () => {
    await expect(
      service.upload(
        'product-id',
        {
          mimetype: 'image/png',
          size: 5 * 1024 * 1024 + 1,
          buffer: Buffer.alloc(1),
          originalname: 'image.png',
        },
        'actor-id',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('rejects a file whose contents do not match its declared format', async () => {
    await expect(
      service.upload(
        'product-id',
        {
          mimetype: 'image/png',
          size: 12,
          buffer: Buffer.from('not-an-image'),
          originalname: 'image.png',
        },
        'actor-id',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('accepts a real PNG even when the client sends a generic MIME type', async () => {
    const buffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
    ]);
    prisma.product.findUnique.mockResolvedValue({ id: 'product-id' });
    prisma.$transaction.mockImplementationOnce(async (callback) =>
      callback({
        productImage: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({
            id: 'image-id',
            productId: 'product-id',
            objectKey: 'products/product-id/image-id.png',
            isPrimary: true,
          }),
        },
      }),
    );
    storage.upload.mockResolvedValue(undefined);
    audit.record.mockResolvedValue(undefined);

    await service.upload(
      'product-id',
      {
        mimetype: 'application/octet-stream',
        size: buffer.length,
        buffer,
        originalname: 'captura.png',
      },
      'actor-id',
    );

    expect(storage.upload).toHaveBeenCalledWith(
      expect.stringMatching(/\.png$/),
      buffer,
      'image/png',
    );
  });

  it('reorders all images atomically and makes the first one primary', async () => {
    prisma.product.findUnique.mockResolvedValue({ id: 'product-id' });
    prisma.productImage.findMany.mockResolvedValue([
      { id: 'image-1', sortOrder: 0, isPrimary: true },
      { id: 'image-2', sortOrder: 1, isPrimary: false },
    ]);
    const update = jest.fn().mockImplementation(({ where, data }) =>
      Promise.resolve({
        id: where.id,
        objectKey: `${where.id}.png`,
        ...data,
      }),
    );
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    prisma.$transaction.mockImplementationOnce(async (callback) =>
      callback({ productImage: { updateMany, update } }),
    );
    audit.record.mockResolvedValue(undefined);

    const result = await service.reorder(
      'product-id',
      {
        images: [
          { id: 'image-2', altText: 'Imagem principal' },
          { id: 'image-1', altText: 'Imagem adicional' },
        ],
      },
      'actor-id',
    );

    expect(update).toHaveBeenNthCalledWith(1, {
      where: { id: 'image-2' },
      data: { sortOrder: 0, isPrimary: true, altText: 'Imagem principal' },
    });
    expect(update).toHaveBeenNthCalledWith(2, {
      where: { id: 'image-1' },
      data: { sortOrder: 1, isPrimary: false, altText: 'Imagem adicional' },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { productId: 'product-id' },
      data: { isPrimary: false },
    });
    expect(result).toHaveLength(2);
  });

  it('promotes the next image after deleting the primary image', async () => {
    prisma.productImage.findFirst.mockResolvedValue({
      id: 'image-1',
      productId: 'product-id',
      objectKey: 'products/product-id/image-1.png',
      isPrimary: true,
      sortOrder: 0,
    });
    const remove = jest.fn().mockResolvedValue(undefined);
    const findMany = jest.fn().mockResolvedValue([{ id: 'image-2' }]);
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const update = jest.fn().mockResolvedValue(undefined);
    prisma.$transaction.mockImplementationOnce(async (callback) =>
      callback({
        productImage: { delete: remove, findMany, updateMany, update },
      }),
    );
    storage.remove.mockResolvedValue(undefined);
    audit.record.mockResolvedValue(undefined);

    await service.remove('product-id', 'image-1', 'actor-id');

    expect(update).toHaveBeenCalledWith({
      where: { id: 'image-2' },
      data: { sortOrder: 0, isPrimary: true },
    });
    expect(storage.remove).toHaveBeenCalledWith(
      'products/product-id/image-1.png',
    );
  });
});
