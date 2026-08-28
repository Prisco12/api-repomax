import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDecimal,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ProductCategoryAssignmentDto } from './product-category-assignment.dto';

export class UpdateProductDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(220)
  slug?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sku?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  shortDescription?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  description?: string | null;

  @ApiPropertyOptional({ type: String, example: '1499.90', nullable: true })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2', force_decimal: false })
  price?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showPrice?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional({ type: Number, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsObject()
  specifications?: Record<string, unknown> | null;

  @ApiPropertyOptional({ type: [ProductCategoryAssignmentDto] })
  @IsOptional()
  @IsArray()
  @ArrayUnique((item: ProductCategoryAssignmentDto) => item.categoryId)
  @ValidateNested({ each: true })
  @Type(() => ProductCategoryAssignmentDto)
  categories?: ProductCategoryAssignmentDto[];
}
