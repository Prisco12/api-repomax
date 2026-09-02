import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../authorization/decorators/permissions.decorator';
import { Permission } from '../authorization/permission-catalog';
import { AuthenticatedUser } from '../auth/domain/authenticated-user.interface';
import { Public } from '../../common/decorators/public.decorator';
import { ProductImagesService } from './product-images.service';
import { UpdateProductImageDto } from './dto/update-product-image.dto';
import { ReorderProductImagesDto } from './dto/reorder-product-images.dto';
import { UploadProductImageDto } from './dto/upload-product-image.dto';

@ApiTags('Product Images')
@Controller()
export class ProductImagesController {
  constructor(private readonly images: ProductImagesService) {}

  @ApiBearerAuth()
  @Permissions(Permission.PRODUCTS_UPDATE)
  @ApiOperation({ summary: 'Enviar imagem para um produto' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        altText: { type: 'string', maxLength: 255, nullable: true },
      },
    },
  })
  @Post('admin/products/:productId/images')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  upload(
    @Param('productId', ParseUUIDPipe) productId: string,
    @UploadedFile()
    file: {
      mimetype: string;
      size: number;
      buffer: Buffer;
      originalname: string;
    },
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UploadProductImageDto,
  ) {
    return this.images.upload(productId, file, user.id, dto.altText);
  }

  @ApiBearerAuth()
  @Permissions(Permission.PRODUCTS_UPDATE)
  @ApiOperation({
    summary: 'Salvar a ordem completa e os textos alternativos das imagens',
  })
  @Patch('admin/products/:productId/images/order')
  reorder(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: ReorderProductImagesDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.images.reorder(productId, dto, user.id);
  }

  @ApiBearerAuth()
  @Permissions(Permission.PRODUCTS_UPDATE)
  @ApiOperation({
    summary: 'Editar ordem, texto alternativo ou imagem principal',
  })
  @Patch('admin/products/:productId/images/:imageId')
  update(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @Body() dto: UpdateProductImageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.images.update(productId, imageId, dto, user.id);
  }

  @ApiBearerAuth()
  @Permissions(Permission.PRODUCTS_UPDATE)
  @Delete('admin/products/:productId/images/:imageId')
  async remove(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.images.remove(productId, imageId, user.id);
  }

  @ApiBearerAuth()
  @Permissions(Permission.PRODUCTS_READ)
  @ApiOperation({ summary: 'Visualizar uma imagem no painel administrativo' })
  @Get('admin/products/:productId/images/:imageId/content')
  async adminDownload(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @Res() response: Response,
  ) {
    const delivery = await this.images.adminDelivery(productId, imageId);
    if ('buffer' in delivery) {
      response.type(delivery.contentType ?? 'application/octet-stream');
      return response.send(delivery.buffer);
    }
    return this.sendDelivery(delivery, response);
  }

  @Public()
  @Get('product-images/:imageId')
  async download(
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @Res() response: Response,
  ) {
    const delivery = await this.images.publicDelivery(imageId);
    return this.sendDelivery(delivery, response);
  }

  private sendDelivery(
    delivery: { url: string } | { localPath: string },
    response: Response,
  ) {
    if ('url' in delivery && delivery.url)
      return response.redirect(delivery.url);
    if ('localPath' in delivery && delivery.localPath)
      return response.sendFile(delivery.localPath);
    return response.sendStatus(404);
  }
}
