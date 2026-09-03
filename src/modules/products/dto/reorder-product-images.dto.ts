import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class OrderedProductImageDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id!: string;

  @ApiPropertyOptional({
    nullable: true,
    example: 'Amortecedor dianteiro visto de lado',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  altText?: string | null;
}

export class ReorderProductImagesDto {
  @ApiProperty({ type: [OrderedProductImageDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique((image: OrderedProductImageDto) => image.id)
  @ValidateNested({ each: true })
  @Type(() => OrderedProductImageDto)
  images!: OrderedProductImageDto[];
}
