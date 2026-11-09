import 'dotenv/config';
import { z } from 'zod';

/**
 * Nơi DUY NHẤT đọc `process.env`. Thiếu/sai biến => crash lúc khởi động với
 * thông báo rõ ràng, thay vì `undefined` giữa request.
 */
const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) =>
    typeof v === 'boolean'
      ? v
      : ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase()),
  );
const positiveInt = z.coerce.number().int().positive();
const list = z
  .string()
  .default('')
  .transform((v) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

const schema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    HTTP_GLOBAL_PREFIX: z.string().default('api/v1'),
    CORS_ORIGINS: list,
    /** Không đặt => bật ở development/test, tắt ở production. */
    SWAGGER_ENABLED: bool.optional(),

    DATABASE_URL: z.string().min(1),
    DATABASE_POOL_MAX: positiveInt.default(10),
    DATABASE_LOG_QUERIES: bool.default(false),

    REDIS_URL: z.string().default(''),

    JWT_SECRET: z.string().min(1),
    JWT_ACCESS_TTL_SECONDS: positiveInt.default(900),
    JWT_ACCEPT_LEGACY_ACCESS: bool.default(true),
    ADMIN_USER_IDS: list,

    AI_ENGINE_MODE: z.enum(['mock', 'http']).default('mock'),
    AI_ENGINE_BASE_URL: z.string().default('http://localhost:8001'),
    AI_ENGINE_SERVICE_TOKEN: z.string().min(1).default('dev-service-token'),
    AI_ENGINE_TIMEOUT_MS: positiveInt.default(30_000),
    AI_ENGINE_MOCK_DELAY_MS: z.coerce.number().int().nonnegative().default(40),
    AI_ENGINE_MOCK_INDEX_DELAY_MS: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(2_000),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.AI_ENGINE_MODE === 'mock') {
      ctx.addIssue({
        code: 'custom',
        path: ['AI_ENGINE_MODE'],
        message: 'AI_ENGINE_MODE=mock không được chạy ở production.',
      });
    }
    if (
      env.NODE_ENV === 'production' &&
      env.JWT_SECRET === 'change-me-dev-only'
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_SECRET'],
        message: 'Đặt JWT_SECRET thật (= SECRET_KEY của Python, R25).',
      });
    }
  });

export interface AppConfig {
  readonly environment: 'development' | 'test' | 'production';
  readonly http: {
    readonly port: number;
    readonly globalPrefix: string;
    readonly corsOrigins: readonly string[];
  };
  readonly database: {
    readonly url: string;
    readonly poolMax: number;
    readonly logQueries: boolean;
  };
  readonly redis: { readonly url: string };
  readonly swagger: { readonly enabled: boolean };
  readonly auth: {
    readonly jwtSecret: string;
    readonly accessTtlSeconds: number;
    readonly acceptLegacyAccess: boolean;
    readonly adminUserIds: readonly string[];
  };
  readonly aiEngine: {
    readonly mode: 'mock' | 'http';
    readonly baseUrl: string;
    readonly serviceToken: string;
    readonly timeoutMs: number;
    readonly mockDelayMs: number;
    readonly mockIndexDelayMs: number;
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Cấu hình không hợp lệ:\n${issues}`);
  }
  const e = parsed.data;
  return Object.freeze({
    environment: e.NODE_ENV,
    http: {
      port: e.PORT,
      globalPrefix: e.HTTP_GLOBAL_PREFIX,
      corsOrigins: e.CORS_ORIGINS,
    },
    database: {
      url: e.DATABASE_URL,
      poolMax: e.DATABASE_POOL_MAX,
      logQueries: e.DATABASE_LOG_QUERIES,
    },
    redis: { url: e.REDIS_URL },
    swagger: { enabled: e.SWAGGER_ENABLED ?? e.NODE_ENV !== 'production' },
    auth: {
      jwtSecret: e.JWT_SECRET,
      accessTtlSeconds: e.JWT_ACCESS_TTL_SECONDS,
      acceptLegacyAccess: e.JWT_ACCEPT_LEGACY_ACCESS,
      adminUserIds: e.ADMIN_USER_IDS,
    },
    aiEngine: {
      mode: e.AI_ENGINE_MODE,
      baseUrl: e.AI_ENGINE_BASE_URL,
      serviceToken: e.AI_ENGINE_SERVICE_TOKEN,
      timeoutMs: e.AI_ENGINE_TIMEOUT_MS,
      mockDelayMs: e.AI_ENGINE_MOCK_DELAY_MS,
      mockIndexDelayMs: e.AI_ENGINE_MOCK_INDEX_DELAY_MS,
    },
  });
}

export const APP_CONFIG = Symbol('APP_CONFIG');
