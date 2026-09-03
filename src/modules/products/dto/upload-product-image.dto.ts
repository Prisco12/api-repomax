import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadProductImageDto {
  @ApiPropertyOptional({
    nullable: true,
    maxLength: 255,
    example: 'Amortecedor dianteiro visto de lado',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  altText?: string;
}
