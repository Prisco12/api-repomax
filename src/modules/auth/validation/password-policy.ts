import {
  IsString,
  IsStrongPassword,
  MaxLength,
  ValidationArguments,
} from 'class-validator';

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

const PASSWORD_RULES = {
  minLength: PASSWORD_MIN_LENGTH,
  minLowercase: 1,
  minUppercase: 1,
  minNumbers: 1,
  minSymbols: 1,
};

function passwordPolicyMessage({ value }: ValidationArguments) {
  if (typeof value !== 'string') {
    return 'Password must be a string.';
  }

  const requirements = [
    value.length < PASSWORD_MIN_LENGTH
      ? `at least ${PASSWORD_MIN_LENGTH} characters`
      : null,
    !/[a-z]/.test(value) ? 'one lowercase letter' : null,
    !/[A-Z]/.test(value) ? 'one uppercase letter' : null,
    !/\d/.test(value) ? 'one number' : null,
    !/[^A-Za-z0-9]/.test(value) ? 'one special character' : null,
  ].filter((requirement): requirement is string => requirement !== null);

  return `Password must contain ${requirements.join(', ')}.`;
}

export function IsApplicationPassword(): PropertyDecorator {
  return (target, propertyKey) => {
    IsString({
      message: 'Password must be a string.',
      context: { code: 'INVALID_PASSWORD_TYPE' },
    })(target, propertyKey);
    IsStrongPassword(PASSWORD_RULES, {
      message: passwordPolicyMessage,
      context: { code: 'PASSWORD_TOO_WEAK' },
    })(target, propertyKey);
    MaxLength(PASSWORD_MAX_LENGTH, {
      message: `Password must be shorter than or equal to ${PASSWORD_MAX_LENGTH} characters.`,
      context: { code: 'PASSWORD_TOO_LONG' },
    })(target, propertyKey);
  };
}
