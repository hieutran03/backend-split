import { Module } from '@nestjs/common';

import { EnginePlaygroundController } from './engine-playground.controller';

/** Dev tools. app.module imports this only when NODE_ENV !== 'production'. */
@Module({ controllers: [EnginePlaygroundController] })
export class DevToolsModule {}
