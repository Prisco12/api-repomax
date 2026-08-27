import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import {
  IsApplicationPassword,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../validation/password-policy';

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(20)
  token!: string;

  @ApiProperty({
    example: 'NovaSenha123!',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
    description:
      'Deve conter letra minúscula, letra maiúscula, número e caractere especial.',
  })
  @IsApplicationPassword()
  password!: string;
}
