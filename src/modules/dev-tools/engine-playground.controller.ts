import { randomUUID } from 'node:crypto';

import { Body, Controller, Inject, Post, Res } from '@nestjs/common';
import { type Response } from 'express';
import { z } from 'zod';

import { type Actor } from '@shared/auth/actor';
import {
  AI_ENGINE_CLIENT,
  type AiEngineClient,
} from '@platform/ports/ai-engine.port';
import { CurrentActor, RawResponse } from '@platform/http/decorators';
import { ZodValidationPipe } from '@platform/http/zod-validation.pipe';

const playgroundSchema = z.object({ message: z.string().min(1).max(10_000) });

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
@Controller('dev/engine')
export class EnginePlaygroundController {
  public constructor(
    @Inject(AI_ENGINE_CLIENT) private readonly engine: AiEngineClient,
  ) {}

  @Post('turns')
  @RawResponse()
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
