import { type INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { type AppConfig } from '../config/app-config';

export const BEARER_AUTH = 'access-token';

/**
 * Swagger UI at `/docs`, JSON at `/docs-json` (outside the /api/v1 prefix).
 * Disabled in production unless SWAGGER_ENABLED=true.
 *
 * Controller conventions:
 *  - `@ApiTags('<module>')` on the class, `@ApiBearerAuth(BEARER_AUTH)` if a token is needed;
 *  - body/query: `@ApiZodBody(schema)` / `@ApiZodQuery(schema)` — same schema as ZodValidationPipe;
 *  - response: `@ApiEnvelope(viewSchema)` + `@ApiErrors(...)`.
 */
export function setupSwagger(app: INestApplication, config: AppConfig): void {
  if (!config.swagger.enabled) return;

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Chatbot Backend API')
      .setDescription(
        [
          'NestJS backend split out of the FastAPI chatbot (spec: Chatbot Backend Split).',
          '',
          '- Envelope: `{ success, code, message, data }` — `code` is always present.',
          '- Pagination: `?page=1&limit=20&sort=-updatedAt` → `data: { items, meta }`.',
          '- Not owned / not found → **404** (D15). 403 only for admin permission.',
          `- Current AI Engine: **${config.aiEngine.mode}**.`,
          '',
          'Get a dev token: `pnpm -s token:dev`, then click **Authorize**.',
        ].join('\n'),
      )
      .setVersion('v1')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        BEARER_AUTH,
      )
      .build(),
  );

  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs-json',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
    },
  });
}
