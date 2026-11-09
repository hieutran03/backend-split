import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';

import {
  AI_ENGINE_CLIENT,
  type AiEngineClient,
} from '@platform/ports/ai-engine.port';
import { Public } from '@platform/http/decorators';

type Status = 'ok' | 'degraded' | 'down';

/**
 * H9: GET /api/v1/health — liveness.
 * H10–H13: GET /api/v1/health/dependencies — aggregates DB + Engine (E21).
 * TODO(OPS-01): add Redis, S3; restrict to admin or internal network.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  public constructor(
    private readonly dataSource: DataSource,
    @Inject(AI_ENGINE_CLIENT) private readonly engine: AiEngineClient,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness (H9)' })
  public health(): { status: Status } {
    return { status: 'ok' };
  }

  @Public()
  @Get('dependencies')
  @ApiOperation({ summary: 'PostgreSQL + AI Engine status (H10–H13, E21)' })
  public async dependencies(): Promise<{
    status: Status;
    checks: Record<string, { status: Status; detail?: string }>;
  }> {
    const checks: Record<string, { status: Status; detail?: string }> = {};
    try {
      await this.dataSource.query('SELECT 1');
      checks.postgres = { status: 'ok' };
    } catch (error) {
      checks.postgres = { status: 'down', detail: String(error) };
    }
    try {
      const engine = await this.engine.health();
      checks.aiEngine = { status: engine.status };
      for (const [name, check] of Object.entries(engine.checks))
        checks[`aiEngine.${name}`] = check;
    } catch (error) {
      checks.aiEngine = { status: 'down', detail: String(error) };
    }
    const values = Object.values(checks).map((c) => c.status);
    const status: Status = values.includes('down')
      ? 'down'
      : values.includes('degraded')
        ? 'degraded'
        : 'ok';
    return { status, checks };
  }
}
