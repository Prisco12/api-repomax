import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { FileStorageService } from '../files/file-storage.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { UpdateProductImageDto } from './dto/update-product-image.dto';

const allowedMimeTypes = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);
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

  async upload(productId: string, file: UploadedImage, actorId: string) {
    if (!file) throw new BadRequestException('Image file is required');
    if (!allowedMimeTypes.has(file.mimetype))
      throw new BadRequestException(
        'Only JPEG, PNG and WebP images are allowed',
      );
    if (!file.buffer?.length || file.size > maxBytes)
      throw new BadRequestException('Image must be smaller than 5 MB');
    if (!this.hasExpectedSignature(file.buffer, file.mimetype))
      throw new BadRequestException(
        'The file content does not match its image format',
      );
    await this.productOrThrow(productId);
    const extension =
      allowedMimeTypes.get(file.mimetype) ??
      extname(file.originalname).slice(1);
    const objectKey = `products/${productId}/${randomUUID()}.${extension}`;
    await this.storage.upload(objectKey, file.buffer, file.mimetype);
    try {
      const image = await this.prisma.$transaction(async (transaction) => {
        const count = await transaction.productImage.count({
          where: { productId },
        });
        return transaction.productImage.create({
          data: {
            productId,
            objectKey,
            sortOrder: count,
            isPrimary: count === 0,
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

  async remove(productId: string, imageId: string, actorId: string) {
    const image = await this.imageOrThrow(productId, imageId);
    await this.prisma.productImage.delete({ where: { id: imageId } });
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

  private hasExpectedSignature(buffer: Buffer, mimeType: string) {
    if (mimeType === 'image/jpeg')
      return (
        buffer.length >= 3 &&
        buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
      );
    if (mimeType === 'image/png')
      return (
        buffer.length >= 8 &&
        buffer
          .subarray(0, 8)
          .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      );
    return (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
}
