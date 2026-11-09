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
      'Insert markers [mock:tool] [mock:interrupt] [mock:error] [mock:continuation] [mock:disconnect] [mock:slow]... (see docs/ai-engine-mock.md)',
    example: 'weather today [mock:tool]',
  }),
});

/**
 * DEV ONLY: fires a single turn straight at AiEngineClient (mock or http) and returns the raw
 * V3 NDJSON — to inspect the stream contract without the generations module.
 *
 *   curl -N -X POST localhost:3000/api/v1/dev/engine/turns \
 *     -H "authorization: Bearer $(pnpm -s token:dev)" -H 'content-type: application/json' \
 *     -d '{"message":"hello [mock:tool] [mock:interrupt]"}'
 *
 * Persists nothing. Not a real API — excluded from the production build (app.module).
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
    summary:
      'Fire a single turn at the AI Engine (mock/http), return raw V3 NDJSON',
    description: 'Only available in the dev environment. Persists nothing.',
  })
  @ApiZodBody(playgroundSchema)
  @ApiProduces('application/x-ndjson')
  @ApiResponse({ status: 200, description: 'One V3StreamEvent per line' })
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
