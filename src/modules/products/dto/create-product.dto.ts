import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export class CreateProductDto {
  @ApiProperty({ example: 'Amortecedor dianteiro RepoMax' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ example: 'amortecedor-dianteiro-repomax' })
  @IsOptional()
  @IsString()
  @MaxLength(220)
  slug?: string;

  @ApiPropertyOptional({ example: 'AM-001' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sku?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  shortDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  description?: string;

  @ApiPropertyOptional({ type: String, example: '1499.90', nullable: true })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2', force_decimal: false })
  price?: string | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  showPrice?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional({ type: Number, default: 0, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ example: { material: 'Aço', aplicacao: 'Dianteira' } })
  @IsOptional()
  @IsObject()
  specifications?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [ProductCategoryAssignmentDto] })
  @IsOptional()
  @IsArray()
  @ArrayUnique((item: ProductCategoryAssignmentDto) => item.categoryId)
  @ValidateNested({ each: true })
  @Type(() => ProductCategoryAssignmentDto)
  categories?: ProductCategoryAssignmentDto[];
}
