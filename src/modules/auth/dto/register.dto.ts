import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsApplicationPassword,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../validation/password-policy';

export class RegisterDto {
  @ApiProperty({ example: 'new.user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'Senha123456!',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
    description:
      'Deve conter letra minúscula, letra maiúscula, número e caractere especial.',
  })
  @IsApplicationPassword()
  password!: string;
}
