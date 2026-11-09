import { type PipeTransform } from '@nestjs/common';
import { type ZodType } from 'zod';

import { ValidationError } from '@shared/errors/app-error';

/**
 * Validate body/query/param bằng zod schema đặt cạnh controller.
 * Sai => 400 bad_request, data.errors = [{field, message}] (§4.1 S1).
 *
 *   @Body(new ZodValidationPipe(createProjectSchema)) body: CreateProjectBody
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  public constructor(private readonly schema: ZodType<T>) {}

  public transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    throw new ValidationError(
      result.error.issues.map((issue) => ({
        field: issue.path.join('.') || '(root)',
        message: issue.message,
      })),
    );
  }
}
