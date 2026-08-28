import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetCategoryStatusDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  isActive!: boolean;
}
