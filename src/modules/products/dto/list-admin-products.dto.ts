import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ProductStatus } from '../../../generated/prisma/enums';
import { ListProductsDto } from './list-products.dto';

export class ListAdminProductsDto extends ListProductsDto {
  @ApiPropertyOptional({ enum: ProductStatus })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;
}
