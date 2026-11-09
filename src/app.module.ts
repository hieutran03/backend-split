import { type DynamicModule, Module, type Type } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { DevToolsModule } from '@modules/dev-tools/dev-tools.module';
import { HealthModule } from '@modules/health/health.module';
import { ProjectsModule } from '@modules/projects/public-api';
import { CoreModule } from '@platform/core.module';
import { DatabaseModule } from '@platform/database/database.module';
import { AppExceptionFilter } from '@platform/http/app-exception.filter';
import { EnvelopeInterceptor } from '@platform/http/envelope.interceptor';
import { JwtAuthGuard } from '@platform/http/jwt-auth.guard';
import { ALL_ENTITIES } from './app.entities';

/**
 * Composition root.
 *  - Module kỹ thuật (@Global): CoreModule (config, clock, id, jwt, AI engine), DatabaseModule.
 *  - Module nghiệp vụ: mỗi context một module, chỉ import qua public-api.
 *  - Chính sách HTTP toàn cục: JWT guard, envelope, exception filter.
 */
const featureModules: Array<Type | DynamicModule> = [
  HealthModule,
  ProjectsModule,
  // W1: AuthModule, UsersModule, ConversationsModule, MessagesModule, FeedbackModule, TaskPlansModule
  // W2: ProvidersModule, AgentModelConfigsModule, CustomAgentsModule, McpProxyModule
  // W3: DocumentsModule, MediaModule
  // W4: GenerationsModule, HitlModule
  // W5: ClientDevicesModule, WidgetsModule
  // W6: UsageModule, OutboxAdminModule
];

if (process.env.NODE_ENV !== 'production') featureModules.push(DevToolsModule);

@Module({
  imports: [
    CoreModule,
    DatabaseModule.forRoot({ entities: ALL_ENTITIES }),
    ...featureModules,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: EnvelopeInterceptor },
    { provide: APP_FILTER, useClass: AppExceptionFilter },
  ],
})
export class AppModule {}
