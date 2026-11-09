import type { IdGenerator } from '@platform/ports/kernel.port';
import { RefreshToken } from '../domain/refresh-token';
import type { OpaqueTokenGenerator, RefreshTokenRepository } from './ports';

export interface IssuedRefreshToken {
  /** The opaque value handed to the client — it exists EXACTLY once; the DB keeps its SHA-256. */
  readonly token: string;
  readonly record: RefreshToken;
}

/** Shared by login, refresh and the legacy exchange: mint + persist one refresh token. */
export class RefreshTokenIssuer {
  public constructor(
    private readonly tokens: RefreshTokenRepository,
    private readonly generator: OpaqueTokenGenerator,
    private readonly ids: IdGenerator,
    private readonly ttlSeconds: number,
  ) {}

  public async issue(input: {
    userId: string;
    userAgent: string | null;
    now: Date;
  }): Promise<IssuedRefreshToken> {
    const token = this.generator.generate();
    const record = RefreshToken.issue({
      id: this.ids.uuid(),
      userId: input.userId,
      tokenHash: this.generator.hash(token),
      userAgent: input.userAgent,
      now: input.now,
      ttlSeconds: this.ttlSeconds,
    });
    await this.tokens.insert(record);
    return { token, record };
  }
}
