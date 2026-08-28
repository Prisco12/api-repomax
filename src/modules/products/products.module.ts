import { Module } from '@nestjs/common';
import { AdminProductsController } from './admin-products.controller';
import { ProductsService } from './products.service';
import { PublicProductsController } from './public-products.controller';

@Module({
  controllers: [PublicProductsController, AdminProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
