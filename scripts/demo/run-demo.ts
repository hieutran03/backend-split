/**
 * End-to-end demo of everything built so far (PLAN tasks marked [x] / [r]).
 *
 *   pnpm demo                         every scenario
 *   pnpm demo --only auth,fork        some scenarios (missing users are created first)
 *   pnpm demo --list                  scenario ids
 *   pnpm demo --full                  do not shorten long strings (tokens) on the console
 *   pnpm demo --sql                   also print every SQL statement TypeORM runs
 *   pnpm demo --verbose               also print Nest's bootstrap logs (modules, routes)
 *   pnpm demo --bail                  stop at the first failed check
 *   pnpm demo --no-color              plain console output
 *
 * Needs the docker-compose Postgres (pnpm docker:up). It never touches the dev database:
 * it drops and recreates `<db>_demo` on the same server (or DEMO_DATABASE_URL), runs the
 * migrations, boots the app in-process on a free port with the mock AI Engine, and calls
 * it over real HTTP. Everything is printed and also written to logs/demo-<time>.log.
 * Exit code 1 when a check fails, so it doubles as a smoke test.
 */
import 'reflect-metadata';

import { execSync } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';

import { type LoggerService } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';

import { APP_CONFIG, type AppConfig } from '@platform/config/app-config';
import { createDataSource } from '@platform/database/database.module';
import { setupSwagger } from '@platform/http/swagger';
import { ALL_ENTITIES } from '../../src/app.entities';
import { AppModule } from '../../src/app.module';
import { DemoContext, type DemoState, type Scenario } from './context';
import { ApiClient, DemoLog, Recorder, teeConsoleToFile } from './kit';
import { SCENARIOS } from './scenarios';

interface Flags {
  readonly only: readonly string[];
  readonly list: boolean;
  readonly full: boolean;
  readonly sql: boolean;
  readonly verbose: boolean;
  readonly bail: boolean;
  readonly color: boolean;
}

function parseFlags(argv: readonly string[]): Flags {
  const args = argv.filter((a) => a !== '--');
  const onlyAt = args.findIndex(
    (a) => a === '--only' || a.startsWith('--only='),
  );
  let only: string[] = [];
  if (onlyAt >= 0) {
    const raw = args[onlyAt]?.includes('=')
      ? args[onlyAt]?.split('=')[1]
      : args[onlyAt + 1];
    only = (raw ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return {
    only,
    list: args.includes('--list'),
    full: args.includes('--full'),
    sql: args.includes('--sql'),
    verbose: args.includes('--verbose'),
    bail: args.includes('--bail'),
    color: !args.includes('--no-color') && !process.env.NO_COLOR,
  };
}

function timestamp(): string {
  return new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19);
}

function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return '<invalid url>';
  }
}

function git(command: string): string {
  try {
    return execSync(`git ${command}`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '?';
  }
}

/** Routes Nest's own logs into the demo log; bootstrap noise only goes to the file. */
class DemoNestLogger implements LoggerService {
  private static readonly QUIET = new Set([
    'InstanceLoader',
    'RoutesResolver',
    'RouterExplorer',
    'NestFactory',
    'NestApplication',
  ]);

  public constructor(
    private readonly out: DemoLog,
    private readonly showBootstrap: boolean,
  ) {}

  public log(message: unknown, ...rest: unknown[]): void {
    this.write('LOG', message, rest);
  }
  public error(message: unknown, ...rest: unknown[]): void {
    this.write('ERROR', message, rest);
  }
  public warn(message: unknown, ...rest: unknown[]): void {
    this.write('WARN', message, rest);
  }
  public debug(message: unknown, ...rest: unknown[]): void {
    this.write('DEBUG', message, rest);
  }
  public verbose(message: unknown, ...rest: unknown[]): void {
    this.write('VERBOSE', message, rest);
  }

  private write(level: string, message: unknown, rest: unknown[]): void {
    const last = rest[rest.length - 1];
    const context = typeof last === 'string' ? last : 'Nest';
    const extra = rest.slice(0, typeof last === 'string' ? -1 : undefined);
    const { out } = this;
    const colour =
      level === 'ERROR' ? out.red : level === 'WARN' ? out.yellow : out.gray;
    const text = `      ${out.gray('[app]')} ${colour(level.padEnd(5))} ${out.yellow(`[${context}]`)} ${out.gray(
      typeof message === 'string' ? message : JSON.stringify(message),
    )}`;
    if (!this.showBootstrap && DemoNestLogger.QUIET.has(context))
      out.toFile(text);
    else out.print(text);
    for (const item of extra)
      if (item) out.print(`        ${out.red(String(item))}`);
  }
}

interface ScenarioResult {
  readonly id: string;
  readonly steps: number;
  readonly checks: number;
  readonly failed: number;
  readonly ms: number;
}

async function recreateDatabase(
  log: DemoLog,
  sourceUrl: string,
): Promise<string> {
  const target = new URL(process.env.DEMO_DATABASE_URL ?? sourceUrl);
  if (!process.env.DEMO_DATABASE_URL) {
    target.pathname = `${target.pathname.replace(/^\//, '')}_demo`;
  }
  const name = target.pathname.replace(/^\//, '');
  if (!/^[a-z0-9_]+_demo$/.test(name)) {
    throw new Error(
      `Refusing to recreate "${name}": the demo database name must end with _demo.`,
    );
  }
  const admin = new URL(target.toString());
  admin.pathname = '/postgres';
  const ds = new DataSource({ type: 'postgres', url: admin.toString() });
  await ds.initialize();
  log.print(
    `    ${log.magenta('⛁')} DROP DATABASE IF EXISTS ${name} WITH (FORCE)`,
  );
  await ds.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  log.print(`    ${log.magenta('⛁')} CREATE DATABASE ${name}`);
  await ds.query(`CREATE DATABASE ${name}`);
  await ds.destroy();
  return target.toString();
}

async function migrate(log: DemoLog, url: string): Promise<void> {
  const ds = createDataSource(
    { url, poolMax: 2, logQueries: false },
    ALL_ENTITIES,
    [
      join(
        __dirname,
        '..',
        '..',
        'src',
        'platform',
        'database',
        'migrations',
        '*.{ts,js}',
      ),
    ],
  );
  await ds.initialize();
  const applied = await ds.runMigrations({ transaction: 'each' });
  for (const m of applied)
    log.print(`    ${log.green('✓')} migration ${m.name}`);
  const tables: Array<{ table_name: string }> = await ds.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1`,
  );
  log.print(
    `    ${log.dim(`tables: ${tables.map((t) => t.table_name).join(', ')}`)}`,
  );
  await ds.destroy();
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const known = new Map(SCENARIOS.map((s) => [s.id, s]));

  if (flags.list) {
    for (const s of SCENARIOS) {
      process.stdout.write(
        `${s.id.padEnd(22)} ${s.tasks.padEnd(32)} ${s.title}\n`,
      );
    }
    return;
  }
  const unknown = flags.only.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new Error(`Unknown scenario(s): ${unknown.join(', ')}. Use --list.`);
  }
  const selected: Scenario[] =
    flags.only.length > 0
      ? SCENARIOS.filter((s) => flags.only.includes(s.id))
      : [...SCENARIOS];

  const log = new DemoLog({
    filePath: join(process.cwd(), 'logs', `demo-${timestamp()}.log`),
    color: flags.color,
    full: flags.full,
  });
  teeConsoleToFile(log);
  const rule = '═'.repeat(78);

  log.print(log.bold(rule));
  log.print(log.bold(' Backend split — demo of the finished features'));
  log.print(log.bold(rule));
  log.print(` started   ${new Date().toISOString()}`);
  log.print(
    ` commit    ${git('rev-parse --short HEAD')}${git('status --porcelain') ? ' (+ uncommitted changes)' : ''}`,
  );
  log.print(` node      ${process.version}`);
  log.print(` scenarios ${selected.map((s) => s.id).join(', ')}`);
  log.print(` log file  ${log.filePath}`);

  // ---------------------------------------------------------------- database
  log.print();
  log.print(log.bold('■ Prepare the demo database'));
  const sourceUrl = process.env.DATABASE_URL;
  if (!sourceUrl) throw new Error('DATABASE_URL is not set (.env)');
  const demoUrl = await recreateDatabase(log, sourceUrl);
  log.print(`    ${log.dim(`url: ${maskUrl(demoUrl)}`)}`);
  await migrate(log, demoUrl);

  // ---------------------------------------------------------------- app
  Object.assign(process.env, {
    DATABASE_URL: demoUrl,
    AI_ENGINE_MODE: 'mock',
    AI_ENGINE_MOCK_DELAY_MS: '20',
    // The guard re-reads token_version / deleted_at on every request (production: ≤ 30 s cache).
    AUTH_USER_STATE_CACHE_SECONDS: '0',
    // D19 window open, so a legacy Python refresh JWT can be exchanged once.
    JWT_LEGACY_REFRESH_UNTIL: new Date(
      Date.now() + 7 * 24 * 3600 * 1000,
    ).toISOString(),
    DATABASE_LOG_QUERIES: flags.sql ? 'true' : 'false',
    SWAGGER_ENABLED: 'true',
  });
  log.print();
  log.print(log.bold('■ Boot the NestJS app in-process'));
  const app = await NestFactory.create(AppModule, {
    logger: new DemoNestLogger(log, flags.verbose),
  });
  const config = app.get<AppConfig>(APP_CONFIG);
  app.setGlobalPrefix(config.http.globalPrefix);
  setupSwagger(app, config);
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  log.print(
    `    ${log.green('✓')} listening on ${baseUrl}/${config.http.globalPrefix}  (Swagger: ${baseUrl}/docs)`,
  );
  log.print(
    `    ${log.dim(
      `env=${config.environment} aiEngine=${config.aiEngine.mode} (delay ${config.aiEngine.mockDelayMs} ms) ` +
        `bcryptCost=${config.auth.bcryptCost} accessTtl=${config.auth.accessTtlSeconds}s ` +
        `legacyAccess=${String(config.auth.acceptLegacyAccess)} legacyRefreshUntil=${config.auth.legacyRefreshUntil?.toISOString() ?? '-'} ` +
        `guardCache=${config.auth.userStateCacheSeconds}s`,
    )}`,
  );

  // ---------------------------------------------------------------- scenarios
  const recorder = new Recorder(log);
  const api = new ApiClient(baseUrl, config.http.globalPrefix, log);
  const dataSource = app.get(DataSource);
  const state: DemoState = {};
  const results: ScenarioResult[] = [];
  const startedAll = performance.now();

  for (const [index, scenario] of selected.entries()) {
    const no = index + 1;
    log.print();
    log.print(log.cyan(rule));
    log.print(
      log.cyan(
        log.bold(
          ` [${no}/${selected.length}] ${scenario.id} — ${scenario.title}`,
        ),
      ),
    );
    log.print(
      log.cyan(
        ` tasks: ${scenario.tasks}   ·   APIs: ${scenario.apis}   ·   ${scenario.journal}`,
      ),
    );
    log.print(log.cyan(rule));
    log.print(` ${log.dim(scenario.summary)}`);

    const ctx = new DemoContext(
      api,
      log,
      recorder,
      dataSource,
      config.auth.jwtSecret,
      state,
      no,
    );
    const checksBefore = recorder.checks;
    const failedBefore = recorder.failures.length;
    const started = performance.now();
    try {
      await scenario.run(ctx);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      recorder.check(`scenario ran to the end`, false, err.message);
      log.toFile(err.stack ?? err.message);
    }
    const result: ScenarioResult = {
      id: scenario.id,
      steps: ctx.steps,
      checks: recorder.checks - checksBefore,
      failed: recorder.failures.length - failedBefore,
      ms: Math.round(performance.now() - started),
    };
    results.push(result);
    if (flags.bail && result.failed > 0) {
      log.print(
        log.red(
          `\n --bail: stopping after the first failing scenario (${scenario.id})`,
        ),
      );
      break;
    }
  }

  // ---------------------------------------------------------------- summary
  const totalMs = Math.round(performance.now() - startedAll);
  log.print();
  log.print(log.bold(rule));
  log.print(log.bold(' Summary'));
  log.print(log.bold(rule));
  log.print(
    ` ${'scenario'.padEnd(22)} ${'steps'.padStart(5)} ${'checks'.padStart(7)} ${'failed'.padStart(7)} ${'time'.padStart(8)}`,
  );
  for (const r of results) {
    const line = ` ${r.id.padEnd(22)} ${String(r.steps).padStart(5)} ${String(r.checks).padStart(7)} ${String(r.failed).padStart(7)} ${`${(r.ms / 1000).toFixed(1)}s`.padStart(8)}`;
    log.print(r.failed > 0 ? log.red(line) : line);
  }
  const sum = (f: (r: ScenarioResult) => number): number =>
    results.reduce((a, r) => a + f(r), 0);
  log.print(
    log.bold(
      ` ${'TOTAL'.padEnd(22)} ${String(sum((r) => r.steps)).padStart(5)} ${String(sum((r) => r.checks)).padStart(7)} ${String(sum((r) => r.failed)).padStart(7)} ${`${(totalMs / 1000).toFixed(1)}s`.padStart(8)}`,
    ),
  );
  if (recorder.failures.length > 0) {
    log.print();
    log.print(
      log.red(log.bold(` ${recorder.failures.length} failed check(s):`)),
    );
    for (const failure of recorder.failures)
      log.print(log.red(`   ✗ ${failure}`));
  } else {
    log.print();
    log.print(log.green(log.bold(` All ${recorder.checks} checks passed.`)));
  }
  log.print();
  log.print(` Log file: ${log.filePath}`);
  log.print(` Demo database kept for inspection: ${maskUrl(demoUrl)}`);

  await app.close();
  process.exit(recorder.failures.length > 0 ? 1 : 0);
}

main().catch((error: unknown) => {
  const err = error instanceof Error ? error : new Error(String(error));
  process.stderr.write(`\nDemo aborted: ${err.message}\n`);
  if (/ECONNREFUSED|connect/i.test(err.message)) {
    process.stderr.write('Is PostgreSQL running? Try: pnpm docker:up\n');
  }
  process.stderr.write(`${err.stack ?? ''}\n`);
  process.exit(2);
});
