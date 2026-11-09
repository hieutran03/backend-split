import { randomUUID } from 'node:crypto';

import { Body, Controller, Inject, Post, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { type Response } from 'express';
import { z } from 'zod';

import { type Actor } from '@shared/auth/actor';
import {
  AI_ENGINE_CLIENT,
  type AiEngineClient,
} from '@platform/ports/ai-engine.port';
import { CurrentActor, RawResponse } from '@platform/http/decorators';
import { ApiZodBody } from '@platform/http/openapi';
import { BEARER_AUTH } from '@platform/http/swagger';
import { ZodValidationPipe } from '@platform/http/zod-validation.pipe';

const playgroundSchema = z.object({
  message: z.string().min(1).max(10_000).meta({
    description:
      'Chèn marker [mock:tool] [mock:interrupt] [mock:error] [mock:continuation] [mock:disconnect] [mock:slow]... (xem docs/ai-engine-mock.md)',
    example: 'thời tiết hôm nay [mock:tool]',
  }),
});

/**
 * CHỈ dev: bắn thẳng một lượt vào AiEngineClient (mock hoặc http) và trả NDJSON V3
 * nguyên bản — để xem hợp đồng stream mà không cần module generations.
 *
 *   curl -N -X POST localhost:3000/api/v1/dev/engine/turns \
 *     -H "authorization: Bearer $(pnpm -s token:dev)" -H 'content-type: application/json' \
 *     -d '{"message":"xin chào [mock:tool] [mock:interrupt]"}'
 *
 * Không persist gì. Không phải API thật — bị gỡ khỏi build production (app.module).
 */
@ApiTags('dev')
@ApiBearerAuth(BEARER_AUTH)
@Controller('dev/engine')
export class EnginePlaygroundController {
  public constructor(
    @Inject(AI_ENGINE_CLIENT) private readonly engine: AiEngineClient,
  ) {}

  @Post('turns')
  @RawResponse()
  @ApiOperation({
    summary: 'Bắn một lượt vào AI Engine (mock/http), trả NDJSON V3 nguyên bản',
    description: 'Chỉ có ở môi trường dev. Không persist gì.',
  })
  @ApiZodBody(playgroundSchema)
  @ApiProduces('application/x-ndjson')
  @ApiResponse({ status: 200, description: 'Mỗi dòng một V3StreamEvent' })
  public async turn(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(playgroundSchema))
    body: z.infer<typeof playgroundSchema>,
    @Res() res: Response,
  ): Promise<void> {
    const conversationId = randomUUID();
    const userMessageId = randomUUID();
    res.status(200);
    res.setHeader('content-type', 'application/x-ndjson');
    res.setHeader('cache-control', 'no-cache');
    res.setHeader('x-accel-buffering', 'no');
    res.flushHeaders();

    const stream = this.engine.startTurn({
      generationId: randomUUID(),
      generationVersion: 1,
      executionEpoch: 1,
      conversationId,
      userId: actor.userId,
      userMessageId,
      assistantMessageId: randomUUID(),
      checkpointThreadId: `routing-v2:${conversationId}:${userMessageId}`,
      message: body.message,
      persona: null,
      attachments: [],
      modelRequest: null,
      modelRuntime: null,
      historyHint: null,
      documents: [],
      projectId: null,
      projectInstructions: null,
      planning: { planningModeEnabled: false, tasks: [] },
      customAgents: {},
      hitlPolicy: { clientRules: {} },
      deviceId: null,
      deviceSessionId: null,
      inlineRichResponseV1: true,
    });
    for await (const event of stream) {
      res.write(`${JSON.stringify(event)}\n`);
    }
    res.end();
  }
}
