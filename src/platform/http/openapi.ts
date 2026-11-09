import { applyDecorators } from '@nestjs/common';
import {
  ApiBody,
  ApiExtraModels,
  ApiParam,
  ApiQuery,
  ApiResponse,
  type SchemaObject,
} from '@nestjs/swagger';
import { z, type ZodType } from 'zod';

/**
 * zod → OpenAPI bridge.
 *
 * The zod schema next to the controller is used both for validation (ZodValidationPipe)
 * and for generating docs — a single source, no second DTO class.
 *
 *   @ApiZodBody(createProjectSchema)
 *   @ApiEnvelope(projectViewSchema, { status: 201 })
 */

/** `input` for requests (defaults stay optional), `output` for responses. */
export function zodToOpenApi(
  schema: ZodType,
  io: 'input' | 'output' = 'output',
): SchemaObject {
  const json = z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io,
    unrepresentable: 'any',
  }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

export function ApiZodBody(
  schema: ZodType,
  description?: string,
): MethodDecorator {
  return ApiBody({ schema: zodToOpenApi(schema, 'input'), description });
}

/** Spreads each field of a z.object into a query param. */
export function ApiZodQuery(schema: ZodType): MethodDecorator {
  const json = zodToOpenApi(schema, 'input');
  const required = new Set(json.required ?? []);
  const decorators = Object.entries(json.properties ?? {}).map(
    ([name, property]) =>
      ApiQuery({
        name,
        required: required.has(name),
        schema: property as SchemaObject,
      }),
  );
  return applyDecorators(...decorators);
}

export function ApiUuidParam(name: string): MethodDecorator {
  return ApiParam({ name, schema: { type: 'string', format: 'uuid' } });
}

// ------------------------------------------------------------------ envelope

const PAGE_META: SchemaObject = {
  type: 'object',
  required: ['page', 'limit', 'total', 'totalPages'],
  properties: {
    page: { type: 'integer', example: 1 },
    limit: { type: 'integer', example: 20 },
    total: { type: 'integer', example: 42 },
    totalPages: { type: 'integer', example: 3 },
  },
};

function successEnvelope(data: SchemaObject, message: string): SchemaObject {
  return {
    type: 'object',
    required: ['success', 'code', 'message', 'data'],
    properties: {
      success: { type: 'boolean', example: true },
      code: { type: 'string', example: 'ok' },
      message: { type: 'string', example: message },
      data,
    },
  };
}

/**
 * Success response wrapped in the standard envelope (§4.1 S1).
 * `paginated: true` => data = { items: T[], meta } (§4.1 S2).
 * `dataSchema = null` => data: null (e.g. DELETE).
 */
export function ApiEnvelope(
  dataSchema: ZodType | null,
  options: {
    status?: number;
    paginated?: boolean;
    message?: string;
    description?: string;
  } = {},
): MethodDecorator {
  const item: SchemaObject = dataSchema
    ? zodToOpenApi(dataSchema, 'output')
    : { type: 'object', nullable: true, example: null };
  const data: SchemaObject = options.paginated
    ? {
        type: 'object',
        required: ['items', 'meta'],
        properties: { items: { type: 'array', items: item }, meta: PAGE_META },
      }
    : item;
  return ApiResponse({
    status: options.status ?? 200,
    description: options.description ?? 'Success',
    schema: successEnvelope(data, options.message ?? 'OK'),
  });
}

const ERROR_EXAMPLES: Record<number, { code: string; data: unknown }> = {
  400: {
    code: 'bad_request',
    data: {
      errors: [
        { field: 'name', message: 'must be between 1 and 255 characters' },
      ],
    },
  },
  401: { code: 'unauthorized', data: { reason: 'invalid_token' } },
  403: { code: 'forbidden', data: { reason: 'admin_required' } },
  404: { code: 'not_found', data: { reason: 'project_not_found' } },
  409: {
    code: 'conflict',
    data: { reason: 'conversation_turn_conflict', generationId: '…' },
  },
  502: { code: 'bad_gateway', data: { reason: 'engine_unavailable' } },
};

function errorEnvelope(status: number): SchemaObject {
  const example = ERROR_EXAMPLES[status] ?? {
    code: 'internal_error',
    data: null,
  };
  return {
    type: 'object',
    required: ['success', 'code', 'message', 'data'],
    properties: {
      success: { type: 'boolean', example: false },
      code: { type: 'string', example: example.code },
      message: { type: 'string' },
      data: {
        type: 'object',
        nullable: true,
        description:
          'Validation error: `errors[{field,message}]`. Business error: `reason` + details.',
        example: example.data,
      },
    },
  };
}

/** Declares the standard error responses. Defaults to 400/401/404 — pass others per route. */
export function ApiErrors(
  ...statuses: number[]
): MethodDecorator & ClassDecorator {
  const list = statuses.length > 0 ? statuses : [400, 401, 404];
  return applyDecorators(
    ApiExtraModels(),
    ...list.map((status) =>
      ApiResponse({
        status,
        description: `Error ${status}`,
        schema: errorEnvelope(status),
      }),
    ),
  );
}
