import { type INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { type AppConfig } from '../config/app-config';

export const BEARER_AUTH = 'access-token';

/**
 * Swagger UI tại `/docs`, JSON tại `/docs-json` (ngoài prefix /api/v1).
 * Tắt ở production trừ khi SWAGGER_ENABLED=true.
 *
 * Quy ước cho controller:
 *  - `@ApiTags('<module>')` ở class, `@ApiBearerAuth(BEARER_AUTH)` nếu cần token;
 *  - body/query: `@ApiZodBody(schema)` / `@ApiZodQuery(schema)` — cùng schema với ZodValidationPipe;
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
          'Backend NestJS tách từ chatbot FastAPI (spec: Chatbot Backend Split).',
          '',
          '- Envelope: `{ success, code, message, data }` — `code` luôn có.',
          '- Phân trang: `?page=1&limit=20&sort=-updatedAt` → `data: { items, meta }`.',
          '- Không sở hữu / không tồn tại → **404** (D15). 403 chỉ cho quyền admin.',
          `- AI Engine hiện tại: **${config.aiEngine.mode}**.`,
          '',
          'Lấy token dev: `pnpm -s token:dev`, bấm **Authorize**.',
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
