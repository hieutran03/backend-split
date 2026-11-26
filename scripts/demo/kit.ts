/**
 * Demo toolkit: a logger that writes every line to the console (coloured) and to a
 * log file (plain text, never truncated), an HTTP client that logs each request and
 * response, and check helpers that record pass/fail without stopping the run.
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { format } from 'node:util';

/** Response bodies are inspected loosely: this is a demo, not a typed client. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any;

const ANSI = /\u001b\[[0-9;]*m/g;
export const stripAnsi = (text: string): string => text.replace(ANSI, '');

/** Strings longer than this are shortened on the console (never in the file). */
const CONSOLE_STRING_MAX = 120;

export interface DemoLogOptions {
  readonly filePath: string;
  readonly color: boolean;
  /** true ⇒ print long strings (tokens, hashes) whole on the console too. */
  readonly full: boolean;
}

export class DemoLog {
  private readonly writeOut = process.stdout.write.bind(process.stdout);

  public constructor(private readonly options: DemoLogOptions) {
    mkdirSync(dirname(options.filePath), { recursive: true });
    writeFileSync(options.filePath, '');
  }

  public get filePath(): string {
    return this.options.filePath;
  }

  public paint(code: string, text: string): string {
    return this.options.color ? `\u001b[${code}m${text}\u001b[0m` : text;
  }
  public bold = (t: string): string => this.paint('1', t);
  public dim = (t: string): string => this.paint('2', t);
  public red = (t: string): string => this.paint('31', t);
  public green = (t: string): string => this.paint('32', t);
  public yellow = (t: string): string => this.paint('33', t);
  public blue = (t: string): string => this.paint('34', t);
  public magenta = (t: string): string => this.paint('35', t);
  public cyan = (t: string): string => this.paint('36', t);
  public gray = (t: string): string => this.paint('90', t);

  /** One line to both sinks; `fileText` replaces what the file gets (e.g. untruncated). */
  public print(text = '', fileText?: string): void {
    this.writeOut(`${text}\n`);
    this.toFile(fileText ?? text);
  }

  public toFile(text: string): void {
    appendFileSync(this.options.filePath, `${stripAnsi(text)}\n`);
  }

  /** Pretty JSON, indented; long strings shortened on the console only. */
  public json(value: unknown, indent: number, colour = this.gray): void {
    const pad = ' '.repeat(indent);
    const full = JSON.stringify(value, null, 2) ?? String(value);
    const short = this.options.full
      ? full
      : (JSON.stringify(value, shortenStrings, 2) ?? String(value));
    const fullLines = full.split('\n');
    const shortLines = short.split('\n');
    if (fullLines.length === shortLines.length) {
      shortLines.forEach((line, i) =>
        this.print(colour(pad + line), pad + (fullLines[i] ?? '')),
      );
      return;
    }
    shortLines.forEach((line) => this.writeOut(`${colour(pad + line)}\n`));
    fullLines.forEach((line) => this.toFile(pad + line));
  }
}

function shortenStrings(_key: string, value: unknown): unknown {
  if (typeof value === 'string' && value.length > CONSOLE_STRING_MAX) {
    return `${value.slice(0, 48)}…(${value.length} chars, full text in the log file)`;
  }
  return value;
}

/** Copies whatever else prints to the console (TypeORM SQL, stray logs) into the file. */
export function teeConsoleToFile(log: DemoLog): void {
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    const original = console[method].bind(console);
    console[method] = (...args: unknown[]): void => {
      original(...args);
      log.toFile(format(...args));
    };
  }
}

// ------------------------------------------------------------------ checks
export class Recorder {
  public checks = 0;
  public readonly failures: string[] = [];

  public constructor(private readonly log: DemoLog) {}

  public check(label: string, ok: boolean, detail?: string): boolean {
    this.checks += 1;
    if (ok) {
      this.log.print(`    ${this.log.green('✓')} ${label}`);
    } else {
      const text = detail ? `${label} — ${detail}` : label;
      this.failures.push(text);
      this.log.print(`    ${this.log.red('✗')} ${this.log.red(text)}`);
    }
    return ok;
  }
}

// ------------------------------------------------------------------ HTTP
export interface Caller {
  /** Shown in the log instead of the raw token. */
  readonly label: string;
  readonly token: string;
}

type QueryValue = string | number | boolean | readonly string[] | undefined;

export interface RequestOptions {
  readonly as?: Caller | null;
  readonly body?: unknown;
  readonly query?: Readonly<Record<string, QueryValue>>;
  /** Raw Authorization header, to show malformed or foreign tokens. */
  readonly authorization?: { readonly label: string; readonly value: string };
}

export interface ApiResult {
  readonly status: number;
  readonly ms: number;
  /** Parsed JSON body (or the raw text). */
  readonly body: Json;
  /** Envelope `data`. */
  readonly data: Json;
  /** Envelope `data.reason` of an error response. */
  readonly reason: string | undefined;
}

export class ApiClient {
  public constructor(
    private readonly baseUrl: string,
    private readonly prefix: string,
    private readonly log: DemoLog,
  ) {}

  public get = (
    path: string,
    options: RequestOptions = {},
  ): Promise<ApiResult> => this.request('GET', path, options);
  public post = (
    path: string,
    options: RequestOptions = {},
  ): Promise<ApiResult> => this.request('POST', path, options);
  public patch = (
    path: string,
    options: RequestOptions = {},
  ): Promise<ApiResult> => this.request('PATCH', path, options);
  public put = (
    path: string,
    options: RequestOptions = {},
  ): Promise<ApiResult> => this.request('PUT', path, options);
  public delete = (
    path: string,
    options: RequestOptions = {},
  ): Promise<ApiResult> => this.request('DELETE', path, options);

  public url(path: string, query?: RequestOptions['query']): URL {
    const url = new URL(`/${this.prefix}${path}`, this.baseUrl);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined) continue;
      const values = Array.isArray(value) ? value : [String(value)];
      for (const v of values) url.searchParams.append(key, String(v));
    }
    return url;
  }

  public async request(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<ApiResult> {
    const { url, headers } = this.prepare(method, path, options);
    const started = performance.now();
    const response = await fetch(url, {
      method,
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const text = await response.text();
    const ms = Math.round(performance.now() - started);
    let body: Json = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // not JSON: keep the text
    }
    this.logResponse(response, ms, body);
    const data: Json = body && typeof body === 'object' ? body.data : undefined;
    const reason: unknown =
      data && typeof data === 'object' ? data.reason : undefined;
    return {
      status: response.status,
      ms,
      body,
      data,
      reason: typeof reason === 'string' ? reason : undefined,
    };
  }

  /** NDJSON stream: logs each line as it arrives, with the time since the request. */
  public async stream(
    path: string,
    options: RequestOptions,
  ): Promise<{ status: number; events: Json[] }> {
    const { url, headers } = this.prepare('POST', path, options);
    const started = performance.now();
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(options.body),
    });
    this.log.print(
      `    ${this.log.bold('←')} ${this.statusText(response.status, response.statusText)} ${this.log.dim(
        `content-type: ${response.headers.get('content-type') ?? '-'} — streaming…`,
      )}`,
    );
    const events: Json[] = [];
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const emit = (line: string): void => {
      if (!line.trim()) return;
      const at = Math.round(performance.now() - started);
      let event: Json = line;
      try {
        event = JSON.parse(line);
      } catch {
        // keep raw
      }
      events.push(event);
      const summary =
        typeof event === 'object' && event !== null
          ? `seq=${String(event.seq)} ${this.log.cyan(String(event.type))} ${JSON.stringify(event.data)}`
          : String(event);
      this.log.print(
        `      ${this.log.dim(`+${String(at).padStart(5)} ms`)}  ${summary}`,
        `      +${String(at).padStart(5)} ms  ${line}`,
      );
    };
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        emit(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');
      }
    }
    emit(buffer);
    this.log.print(
      `      ${this.log.dim(`stream closed after ${Math.round(performance.now() - started)} ms, ${events.length} event(s)`)}`,
    );
    return { status: response.status, events };
  }

  private prepare(
    method: string,
    path: string,
    options: RequestOptions,
  ): { url: URL; headers: Record<string, string> } {
    const url = this.url(path, options.query);
    const headers: Record<string, string> = { accept: 'application/json' };
    if (options.body !== undefined)
      headers['content-type'] = 'application/json';
    let authLine = 'no Authorization header';
    if (options.authorization) {
      headers.authorization = options.authorization.value;
      authLine = `Authorization: ${options.authorization.label}`;
    } else if (options.as) {
      headers.authorization = `Bearer ${options.as.token}`;
      authLine = `as ${options.as.label} (Bearer ${options.as.token.slice(0, 16)}…)`;
    }
    this.log.print(
      `    ${this.log.bold('→')} ${this.log.bold(method.padEnd(6))} ${url.pathname}${decodeURIComponent(url.search)}`,
    );
    this.log.print(`      ${this.log.dim(authLine)}`);
    if (options.body !== undefined) {
      this.log.print(`      ${this.log.dim('body:')}`);
      this.log.json(options.body, 8, this.log.blue);
    }
    return { url, headers };
  }

  private logResponse(response: Response, ms: number, body: Json): void {
    this.log.print(
      `    ${this.log.bold('←')} ${this.statusText(response.status, response.statusText)} ${this.log.dim(`(${ms} ms)`)}`,
    );
    if (body !== null && body !== '') this.log.json(body, 8);
  }

  private statusText(status: number, text: string): string {
    const label = `${status} ${text}`;
    if (status >= 500) return this.log.red(this.log.bold(label));
    if (status >= 400) return this.log.yellow(this.log.bold(label));
    return this.log.green(this.log.bold(label));
  }
}
