import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Min } from 'class-validator';

export class ProductCategoryAssignmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  categoryId!: string;

  @ApiProperty({ type: Number, default: 0, minimum: 0 })
  @IsInt()
  @Min(0)
  sortOrder = 0;
}
