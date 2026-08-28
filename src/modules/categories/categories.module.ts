import { Module } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { PublicCategoriesController } from './public-categories.controller';
import { AdminCategoriesController } from './admin-categories.controller';

@Module({
  controllers: [PublicCategoriesController, AdminCategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
