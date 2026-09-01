import { forwardRef, Module } from '@nestjs/common';
import { AdminProductsController } from './admin-products.controller';
import { ProductsService } from './products.service';
import { PublicProductsController } from './public-products.controller';
import { FilesModule } from '../files/files.module';
import { ProductImagesService } from './product-images.service';
import { ProductImagesController } from './product-images.controller';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [FilesModule, forwardRef(() => CategoriesModule)],
  controllers: [
    PublicProductsController,
    AdminProductsController,
    ProductImagesController,
  ],
  providers: [ProductsService, ProductImagesService],
  exports: [ProductsService],
})
export class ProductsModule {}
