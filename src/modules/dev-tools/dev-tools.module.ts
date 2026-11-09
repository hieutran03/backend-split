import { Module } from '@nestjs/common';

import { EnginePlaygroundController } from './engine-playground.controller';

/** Công cụ dev. app.module chỉ import khi NODE_ENV !== 'production'. */
@Module({ controllers: [EnginePlaygroundController] })
export class DevToolsModule {}
