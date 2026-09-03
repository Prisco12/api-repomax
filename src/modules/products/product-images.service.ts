import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { FileStorageService } from '../files/file-storage.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { UpdateProductImageDto } from './dto/update-product-image.dto';
import { ReorderProductImagesDto } from './dto/reorder-product-images.dto';

const maxBytes = 5 * 1024 * 1024;
type UploadedImage = {
  mimetype: string;
  size: number;
  buffer: Buffer;
  originalname: string;
};

@Injectable()
export class ProductImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: FileStorageService,
    private readonly audit: AuditService,
  ) {}

  async upload(
    productId: string,
    file: UploadedImage,
    actorId: string,
    altText?: string,
  ) {
    if (!file) throw new BadRequestException('Image file is required');
    if (!file.buffer?.length || file.size > maxBytes)
      throw new BadRequestException('Image must be smaller than 5 MB');
    const detected = this.detectImageFormat(file.buffer);
    if (!detected)
      throw new BadRequestException(
        'Only JPEG, PNG and WebP images are allowed',
      );
    await this.productOrThrow(productId);
    const objectKey = `products/${productId}/${randomUUID()}.${detected.extension}`;
    await this.storage.upload(objectKey, file.buffer, detected.mimeType);
    try {
      const image = await this.prisma.$transaction(async (transaction) => {
        const lastImage = await transaction.productImage.findFirst({
          where: { productId },
          orderBy: { sortOrder: 'desc' },
          select: { sortOrder: true },
        });
        return transaction.productImage.create({
          data: {
            productId,
            objectKey,
            altText: altText?.trim() || null,
            sortOrder: (lastImage?.sortOrder ?? -1) + 1,
            isPrimary: !lastImage,
          },
        });
      });
      await this.audit.record({
        actorId,
        action: AuditAction.PRODUCT_IMAGE_UPLOADED,
        resource: 'product-images',
        resourceId: image.id,
        status: 'SUCCESS',
        after: {
          id: image.id,
          productId,
          objectKey,
          isPrimary: image.isPrimary,
        },
      });
      return this.toResponse(image);
    } catch (error) {
      await this.storage.remove(objectKey);
      throw error;
    }
  }

  async update(
    productId: string,
    imageId: string,
    dto: UpdateProductImageDto,
    actorId: string,
  ) {
    const before = await this.imageOrThrow(productId, imageId);
    const image = await this.prisma.$transaction(async (transaction) => {
      if (dto.isPrimary)
        await transaction.productImage.updateMany({
          where: { productId },
          data: { isPrimary: false },
        });
      return transaction.productImage.update({
        where: { id: imageId },
        data: {
          ...(dto.altText !== undefined
            ? { altText: dto.altText?.trim() || null }
            : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          ...(dto.isPrimary !== undefined ? { isPrimary: dto.isPrimary } : {}),
        },
      });
    });
    await this.audit.record({
      actorId,
      action: AuditAction.PRODUCT_IMAGE_UPDATED,
      resource: 'product-images',
      resourceId: imageId,
      status: 'SUCCESS',
      before,
      after: image,
    });
    return this.toResponse(image);
  }

  async reorder(
    productId: string,
    dto: ReorderProductImagesDto,
    actorId: string,
  ) {
    await this.productOrThrow(productId);
    const before = await this.prisma.productImage.findMany({
      where: { productId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const requestedIds = new Set(dto.images.map((image) => image.id));
    if (
      before.length !== dto.images.length ||
      before.some((image) => !requestedIds.has(image.id))
    ) {
      throw new BadRequestException(
        'Image order must contain every image from the product exactly once',
      );
    }

    const images = await this.prisma.$transaction(async (transaction) => {
      await transaction.productImage.updateMany({
        where: { productId },
        data: { isPrimary: false },
      });
      return Promise.all(
        dto.images.map((item, index) =>
          transaction.productImage.update({
            where: { id: item.id },
            data: {
              sortOrder: index,
              isPrimary: index === 0,
              ...(item.altText !== undefined
                ? { altText: item.altText?.trim() || null }
                : {}),
            },
          }),
        ),
      );
    });
    await this.audit.record({
      actorId,
      action: AuditAction.PRODUCT_IMAGES_REORDERED,
      resource: 'product-images',
      resourceId: productId,
      status: 'SUCCESS',
      before: { images: before },
      after: { images },
    });
    return images.map((image) => this.toResponse(image));
  }

  async remove(productId: string, imageId: string, actorId: string) {
    const image = await this.imageOrThrow(productId, imageId);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.productImage.delete({ where: { id: imageId } });
      const remaining = await transaction.productImage.findMany({
        where: { productId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true },
      });
      await transaction.productImage.updateMany({
        where: { productId },
        data: { isPrimary: false },
      });
      await Promise.all(
        remaining.map((item, index) =>
          transaction.productImage.update({
            where: { id: item.id },
            data: { sortOrder: index, isPrimary: index === 0 },
          }),
        ),
      );
    });
    try {
      await this.storage.remove(image.objectKey);
    } catch {
      /* Database record remains deleted; orphan cleanup is safe to retry. */
    }
    await this.audit.record({
      actorId,
      action: AuditAction.PRODUCT_IMAGE_DELETED,
      resource: 'product-images',
      resourceId: imageId,
      status: 'SUCCESS',
      before: image,
    });
  }

  async publicDelivery(imageId: string) {
    const image = await this.prisma.productImage.findFirst({
      where: { id: imageId, product: { status: 'PUBLISHED' } },
    });
    if (!image) throw new NotFoundException('Image not found');
    const url = await this.storage.getDownloadUrl(image.objectKey);
    return url
      ? { url }
      : { localPath: this.storage.getLocalPath(image.objectKey) };
  }

  async adminDelivery(productId: string, imageId: string) {
    const image = await this.imageOrThrow(productId, imageId);
    return this.storage.getContent(image.objectKey);
  }

  private async productOrThrow(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  private async imageOrThrow(productId: string, id: string) {
    const image = await this.prisma.productImage.findFirst({
      where: { id, productId },
    });
    if (!image) throw new NotFoundException('Image not found');
    return image;
  }

  private toResponse<T extends { id: string; objectKey: string }>(image: T) {
    return { ...image, url: `/api/v1/product-images/${image.id}` };
  }

  private detectImageFormat(buffer: Buffer) {
    if (
      buffer.length >= 3 &&
      buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
    )
      return { mimeType: 'image/jpeg', extension: 'jpg' };
    if (
      buffer.length >= 8 &&
      buffer
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    )
      return { mimeType: 'image/png', extension: 'png' };
    if (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    )
      return { mimeType: 'image/webp', extension: 'webp' };
    return null;
  }
}
