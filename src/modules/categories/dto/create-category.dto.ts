import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Suspensão' })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({ example: 'suspensao' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  slug?: string;

  @ApiPropertyOptional({ example: 'Componentes para suspensão automotiva.' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: Number, default: 0, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
