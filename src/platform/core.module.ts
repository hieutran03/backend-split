import { Global, Logger, Module } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  AI_ENGINE_CLIENT,
  type AiEngineClient,
} from '@platform/ports/ai-engine.port';
import {
  CLOCK,
  ID_GENERATOR,
  type Clock,
  type IdGenerator,
} from '@platform/ports/kernel.port';
import { HttpAiEngineClient } from './ai-engine/http/http-ai-engine.client';
import { MockAiEngineClient } from './ai-engine/mock/mock-ai-engine.client';
import { APP_CONFIG, loadConfig, type AppConfig } from './config/app-config';
import { JwtTokenService } from './auth/jwt-token.service';

/**
 * Shared technical module, @Global so every business module can inject by
 * token without re-importing it. Contains only business-agnostic things.
 */
@Global()
@Module({
  providers: [
    { provide: APP_CONFIG, useFactory: (): AppConfig => loadConfig() },
    { provide: CLOCK, useValue: { now: () => new Date() } satisfies Clock },
    {
      provide: ID_GENERATOR,
      useValue: { uuid: () => randomUUID() } satisfies IdGenerator,
    },
    {
      provide: JwtTokenService,
      useFactory: (config: AppConfig) => new JwtTokenService(config.auth),
      inject: [APP_CONFIG],
    },
    {
      provide: AI_ENGINE_CLIENT,
      useFactory: (config: AppConfig): AiEngineClient => {
        const logger = new Logger('AiEngine');
        const c = config.aiEngine;
        if (c.mode === 'http') {
          logger.log(`AI Engine: HTTP ${c.baseUrl}`);
          return new HttpAiEngineClient({
            baseUrl: c.baseUrl,
            serviceToken: c.serviceToken,
            timeoutMs: c.timeoutMs,
          });
        }
        logger.warn('AI Engine: MOCK in-process (AI_ENGINE_MODE=mock)');
        return new MockAiEngineClient({
          delayMs: c.mockDelayMs,
          indexDelayMs: c.mockIndexDelayMs,
          backendCallbackBaseUrl: `http://localhost:${config.http.port}`,
          serviceToken: c.serviceToken,
          log: (message, meta) =>
            logger.log(meta ? `${message} ${JSON.stringify(meta)}` : message),
        });
      },
      inject: [APP_CONFIG],
    },
  ],
  exports: [APP_CONFIG, CLOCK, ID_GENERATOR, JwtTokenService, AI_ENGINE_CLIENT],
})
export class CoreModule {}
