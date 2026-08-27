import { ArrayUnique, IsArray, IsIn } from 'class-validator';
import { Permission } from '../../authorization/permission-catalog';
import { ApiProperty } from '@nestjs/swagger';

export class SetPermissionsDto {
  @ApiProperty({ example: ['users:read', 'users:update'] })
  @IsArray()
  @ArrayUnique()
  @IsIn(Object.values(Permission), { each: true })
  permissions!: string[];
}
