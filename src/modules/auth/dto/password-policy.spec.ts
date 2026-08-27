import { validate } from 'class-validator';
import { validationExceptionFactory } from '../../../common/validation/validation-exception.factory';
import { RegisterDto } from './register.dto';
import { ResetPasswordDto } from './reset-password.dto';

describe('Password policy DTOs', () => {
  it.each([
    ['short', 'Aa1!'],
    ['without uppercase', 'senhasegura123!'],
    ['without lowercase', 'SENHASEGURA123!'],
    ['without number', 'SenhaSeguraSemNumero!'],
    ['without symbol', 'SenhaSegura12345'],
  ])('rejects a weak registration password: %s', async (_case, password) => {
    const dto = new RegisterDto();
    dto.email = 'user@example.com';
    dto.password = password;

    expect(await validate(dto)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'password' }),
      ]),
    );
  });

  it('rejects a weak password during reset', async () => {
    const dto = new ResetPasswordDto();
    dto.token = 'user-id.secret-with-at-least-twenty-characters';
    dto.password = 'weak-password';

    expect(await validate(dto)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'password' }),
      ]),
    );
  });

  it('explains which password requirements are missing', async () => {
    const dto = new RegisterDto();
    dto.email = 'user@example.com';
    dto.password = '123123';

    const exception = validationExceptionFactory(await validate(dto));

    expect(exception.getResponse()).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: [
        {
          field: 'password',
          code: 'PASSWORD_TOO_WEAK',
          message:
            'Password must contain at least 12 characters, one lowercase letter, one uppercase letter, one special character.',
        },
      ],
    });
  });

  it('accepts the same strong password policy for register and reset', async () => {
    const register = new RegisterDto();
    register.email = 'user@example.com';
    register.password = 'SenhaSegura123!';
    const reset = new ResetPasswordDto();
    reset.token = 'user-id.secret-with-at-least-twenty-characters';
    reset.password = register.password;

    expect(await validate(register)).toHaveLength(0);
    expect(await validate(reset)).toHaveLength(0);
  });
});
