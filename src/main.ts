import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { APP_CONFIG, type AppConfig } from '@platform/config/app-config';
import { setupSwagger } from '@platform/http/swagger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get<AppConfig>(APP_CONFIG);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix(config.http.globalPrefix);
  app.enableCors({
    origin:
      config.http.corsOrigins.length > 0 ? [...config.http.corsOrigins] : '*',
    credentials: config.http.corsOrigins.length > 0,
    // The FE AI SDK needs to read this header (§3b.1 CORS).
    exposedHeaders: ['x-vercel-ai-ui-message-stream'],
  });
  app.enableShutdownHooks();
  setupSwagger(app, config);

  await app.listen(config.http.port);
  logger.log(
    `Listening on :${config.http.port}/${config.http.globalPrefix} (env=${config.environment}, aiEngine=${config.aiEngine.mode})`,
  );
  if (config.swagger.enabled) {
    logger.log(`Swagger UI: http://localhost:${config.http.port}/docs`);
  }
}

void bootstrap();
