import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { ProductStatus } from '../../../generated/prisma/enums';

export class SetProductStatusDto {
  @ApiProperty({ enum: ProductStatus, example: ProductStatus.PUBLISHED })
  @IsEnum(ProductStatus)
  status!: ProductStatus;
}
