import { BadRequestException } from '@nestjs/common';
import { ProductImagesService } from './product-images.service';

describe('ProductImagesService', () => {
  const prisma = {
    product: { findUnique: jest.fn() },
    productImage: { findFirst: jest.fn(), delete: jest.fn() },
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
});
