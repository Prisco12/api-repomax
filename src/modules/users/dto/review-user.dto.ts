import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class ReviewUserDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'], example: 'APPROVED' })
  @IsIn(['APPROVED', 'REJECTED'])
  status!: 'APPROVED' | 'REJECTED';
}
