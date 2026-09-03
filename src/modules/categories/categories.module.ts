import { forwardRef, Module } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { PublicCategoriesController } from './public-categories.controller';
import { AdminCategoriesController } from './admin-categories.controller';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [forwardRef(() => ProductsModule)],
  controllers: [PublicCategoriesController, AdminCategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
