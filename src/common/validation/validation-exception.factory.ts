import { BadRequestException, ValidationError } from '@nestjs/common';

export interface ValidationErrorDetail {
  field: string;
  code: string;
  message: string;
}

function flattenValidationErrors(
  errors: ValidationError[],
  parent = '',
): ValidationErrorDetail[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const ownErrors = Object.entries(error.constraints ?? {}).map(
      ([constraint, message]) => ({
        field,
        code:
          (error.contexts?.[constraint]?.code as string | undefined) ??
          'INVALID_VALUE',
        message,
      }),
    );

    return [
      ...ownErrors,
      ...flattenValidationErrors(error.children ?? [], field),
    ];
  });
}

export function validationExceptionFactory(errors: ValidationError[]) {
  return new BadRequestException({
    code: 'VALIDATION_ERROR',
    message: 'Validation failed',
    details: flattenValidationErrors(errors),
  });
}
