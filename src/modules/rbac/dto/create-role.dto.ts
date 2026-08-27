import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRoleDto {
  @ApiProperty({ example: 'manager', description: 'Nome único: letras minúsculas, números, _ ou -.' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[a-z][a-z0-9_-]*$/)
  name!: string;

  @ApiPropertyOptional({ example: 'Gerencia produtos e pedidos.' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
