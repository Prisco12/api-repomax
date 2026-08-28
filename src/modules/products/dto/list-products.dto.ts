import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListProductsDto {
  @ApiPropertyOptional({ type: Number, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ type: Number, default: 20, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ example: 'suspensao' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ enum: ['true', 'false'] })
  @IsOptional()
  @IsIn(['true', 'false'])
  featured?: 'true' | 'false';

  @ApiPropertyOptional({ example: 'amortecedor' })
  @IsOptional()
  @IsString()
  search?: string;
}
