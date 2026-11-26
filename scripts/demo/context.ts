import type { DataSource } from 'typeorm';

import type {
  ApiClient,
  ApiResult,
  Caller,
  DemoLog,
  Json,
  Recorder,
} from './kit';

export interface UserSession extends Caller {
  readonly userId: string;
  readonly email: string;
  readonly password: string;
  readonly refreshToken: string;
}

/** Shared between scenarios (users are created once, by `auth` or by the fixture). */
export interface DemoState {
  alice?: UserSession;
  bob?: UserSession;
}

export interface Scenario {
  readonly id: string;
  readonly title: string;
  /** PLAN task ids covered. */
  readonly tasks: string;
  /** Spec API ids (route-mapping.md). */
  readonly apis: string;
  readonly journal: string;
  /** What the scenario shows, one or two sentences. */
  readonly summary: string;
  run(ctx: DemoContext): Promise<void>;
}

/** What a scenario gets: the HTTP client, the database, logging and checks. */
export class DemoContext {
  private stepNo = 0;

  public constructor(
    public readonly api: ApiClient,
    public readonly log: DemoLog,
    private readonly recorder: Recorder,
    private readonly dataSource: DataSource,
    public readonly jwtSecret: string,
    public readonly state: DemoState,
    private readonly scenarioNo: number,
  ) {}

  public get steps(): number {
    return this.stepNo;
  }

  public step(title: string, ...why: string[]): void {
    this.stepNo += 1;
    const { log } = this;
    log.print();
    log.print(
      `  ${log.cyan('▸')} ${log.bold(`${this.scenarioNo}.${this.stepNo}`)} ${log.bold(title)}`,
    );
    for (const line of why) log.print(`      ${log.dim(line)}`);
  }

  public note(text: string): void {
    this.log.print(`    ${this.log.magenta('ℹ')} ${this.log.magenta(text)}`);
  }

  public check(label: string, ok: boolean, detail?: string): boolean {
    return this.recorder.check(label, ok, detail);
  }

  public expect(res: ApiResult, status: number, reason?: string): boolean {
    const ok =
      res.status === status && (reason === undefined || res.reason === reason);
    const label =
      reason === undefined
        ? `HTTP ${status}`
        : `HTTP ${status}, reason "${reason}"`;
    const got = `got ${res.status}${res.reason ? `, reason "${res.reason}"` : ''}`;
    return this.recorder.check(label, ok, ok ? undefined : got);
  }

  /**
   * A zod validation error: 400 `bad_request` with `data.errors[{ field, message }]`
   * (§4.1 S1, no `reason`), one entry per listed field (a prefix matches nested paths).
   */
  public expectInvalid(res: ApiResult, ...fields: string[]): boolean {
    const errors: Json[] = Array.isArray(res.data?.errors)
      ? res.data.errors
      : [];
    const got = errors.map((e) => String(e.field));
    const missing = fields.filter(
      (f) => !got.some((g) => g === f || g.startsWith(`${f}.`)),
    );
    const ok =
      res.status === 400 &&
      res.body?.code === 'bad_request' &&
      missing.length === 0;
    return this.recorder.check(
      `HTTP 400 bad_request, errors on ${fields.map((f) => `"${f}"`).join(', ')}`,
      ok,
      ok ? undefined : `got ${res.status}, error fields ${JSON.stringify(got)}`,
    );
  }

  public equal(label: string, actual: unknown, expected: unknown): boolean {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    return this.recorder.check(
      `${label} = ${e}`,
      a === e,
      a === e ? undefined : `got ${a}`,
    );
  }

  /** Runs SQL against the demo database and prints the statement and the rows. */
  public async sql(
    why: string,
    text: string,
    params: unknown[] = [],
  ): Promise<Json[]> {
    const { log } = this;
    log.print(`    ${log.magenta('⛁ SQL')} ${log.dim(why)}`);
    for (const line of text.trim().split('\n')) {
      log.print(`      ${log.magenta(line.trim())}`);
    }
    if (params.length > 0) {
      log.print(`      ${log.dim(`params: ${JSON.stringify(params)}`)}`);
    }
    const result: unknown = await this.dataSource.query(text, params);
    // UPDATE … RETURNING comes back as [rows, count] from the pg driver.
    const rows: Json[] = Array.isArray(result)
      ? Array.isArray(result[0]) && typeof result[1] === 'number'
        ? (result[0] as Json[])
        : (result as Json[])
      : [];
    log.print(`      ${log.dim(`→ ${rows.length} row(s)`)}`);
    if (rows.length > 0) log.json(rows, 8);
    return rows;
  }
}
