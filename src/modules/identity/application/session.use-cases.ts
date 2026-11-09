import type { Actor } from '@shared/auth/actor';
import { UnauthorizedError, ValidationError } from '@shared/errors/app-error';
import type { Clock, IdGenerator } from '@platform/ports/kernel.port';
import type { TransactionManager } from '@platform/ports/transaction-manager.port';
import { RefreshToken } from '../domain/refresh-token';
import type {
  AccessTokenIssuer,
  LegacyRefreshTokenVerifier,
  OpaqueTokenGenerator,
  RefreshTokenRepository,
  UserRepository,
} from './ports';
import type { RefreshTokenIssuer } from './refresh-token.issuer';
import type { TokenView } from './views';

export interface RefreshInput {
  readonly refreshToken: string;
  readonly userAgent: string | null;
}

/**
 * Outcome of the transactional part. Reuse detection must COMMIT the chain revocation
 * before the 401 is raised — throwing inside the transaction would roll it back and
 * leave the stolen chain alive.
 */
type RefreshOutcome =
  | { kind: 'ok'; userId: string; tokenVersion: number; refreshToken: string }
  | { kind: 'rejected'; error: UnauthorizedError };

/**
 * A3 — Rotate a refresh token.
 *
 * - Opaque token (normal path): single use. The presented token is revoked and points
 *   at its successor; a new access + refresh pair is returned.
 * - Reuse: presenting an already-revoked token revokes the whole chain from it onwards
 *   and returns 401 `refresh_token_reused`. Clients must refresh single-flight (spec §4.4),
 *   otherwise two parallel refreshes revoke their own chain — by design (TC-21).
 * - Legacy Python refresh JWT (D19): exchanged ONCE while `legacyRefreshUntil` is in the
 *   future; a revoked marker row makes a second exchange count as reuse.
 */
export class RefreshUseCase {
  public constructor(
    private readonly users: UserRepository,
    private readonly tokens: RefreshTokenRepository,
    private readonly issuer: RefreshTokenIssuer,
    private readonly generator: OpaqueTokenGenerator,
    private readonly legacy: LegacyRefreshTokenVerifier,
    private readonly accessTokens: AccessTokenIssuer,
    private readonly transactions: TransactionManager,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly legacyRefreshUntil: Date | null,
  ) {}

  public async execute(input: RefreshInput): Promise<TokenView> {
    const now = this.clock.now();
    const outcome = await this.transactions.run(() =>
      looksLikeJwt(input.refreshToken)
        ? this.exchangeLegacy(input, now)
        : this.rotate(input, now),
    );
    if (outcome.kind === 'rejected') throw outcome.error;

    const access = this.accessTokens.issue(
      outcome.userId,
      outcome.tokenVersion,
    );
    return {
      accessToken: access.token,
      refreshToken: outcome.refreshToken,
      tokenType: 'bearer',
      expiresIn: access.expiresIn,
      userId: outcome.userId,
    };
  }

  private async rotate(
    input: RefreshInput,
    now: Date,
  ): Promise<RefreshOutcome> {
    const current = await this.tokens.findByHashForUpdate(
      this.generator.hash(input.refreshToken),
    );
    if (!current)
      return rejected('Invalid refresh token', 'invalid_refresh_token');

    if (current.isRevoked) {
      await this.tokens.revokeChainFrom(current.id, now);
      return rejected('Refresh token was already used', 'refresh_token_reused');
    }
    if (current.isExpired(now)) {
      return rejected('Refresh token expired', 'refresh_token_expired');
    }

    const user = await this.users.findActiveById(current.userId);
    if (!user) {
      await this.tokens.revokeChainFrom(current.id, now);
      return rejected('Invalid refresh token', 'invalid_refresh_token');
    }

    const next = await this.issuer.issue({
      userId: user.id,
      userAgent: input.userAgent,
      now,
    });
    current.rotate(next.record.id, now);
    await this.tokens.save(current);
    return {
      kind: 'ok',
      userId: user.id,
      tokenVersion: user.tokenVersion,
      refreshToken: next.token,
    };
  }

  private async exchangeLegacy(
    input: RefreshInput,
    now: Date,
  ): Promise<RefreshOutcome> {
    if (!this.legacyRefreshUntil || now >= this.legacyRefreshUntil) {
      return rejected(
        'Legacy refresh tokens are no longer accepted, please log in again',
        'legacy_refresh_not_accepted',
      );
    }
    const claims = this.legacy.verify(input.refreshToken); // throws 401 when invalid/expired

    const tokenHash = this.generator.hash(input.refreshToken);
    const marker = await this.tokens.findByHashForUpdate(tokenHash);
    if (marker) {
      await this.tokens.revokeChainFrom(marker.id, now);
      return rejected('Refresh token was already used', 'refresh_token_reused');
    }

    const user = await this.users.findActiveById(claims.userId);
    if (!user || claims.tokenVersion !== user.tokenVersion) {
      return rejected('Invalid refresh token', 'invalid_refresh_token');
    }

    const next = await this.issuer.issue({
      userId: user.id,
      userAgent: input.userAgent,
      now,
    });
    await this.tokens.insert(
      RefreshToken.legacyExchangeMarker({
        id: this.ids.uuid(),
        userId: user.id,
        tokenHash,
        successorId: next.record.id,
        now,
      }),
    );
    return {
      kind: 'ok',
      userId: user.id,
      tokenVersion: user.tokenVersion,
      refreshToken: next.token,
    };
  }
}

export interface LogoutInput {
  readonly refreshToken?: string | undefined;
  readonly allDevices?: boolean | undefined;
}

/**
 * A4 — Logout that actually revokes (the Python endpoint only acknowledged).
 *
 * - `{ refreshToken }`: revokes that token (and any successor). A token that does not
 *   exist or belongs to someone else is ignored silently — the response never reveals
 *   whether a token is valid.
 * - `{ allDevices: true }`: revokes every refresh token of the caller.
 *
 * Access tokens already issued stay valid until they expire (≤ 15 min, TC-22).
 */
export class LogoutUseCase {
  public constructor(
    private readonly tokens: RefreshTokenRepository,
    private readonly generator: OpaqueTokenGenerator,
    private readonly transactions: TransactionManager,
    private readonly clock: Clock,
  ) {}

  public async execute(
    actor: Actor,
    input: LogoutInput,
  ): Promise<{ revokedCount: number }> {
    if (!input.allDevices && !input.refreshToken) {
      throw new ValidationError([
        {
          field: 'refreshToken',
          message: 'provide refreshToken or set allDevices to true',
        },
      ]);
    }
    const now = this.clock.now();
    return this.transactions.run(async () => {
      if (input.allDevices) {
        return {
          revokedCount: await this.tokens.revokeAllForUser(actor.userId, now),
        };
      }
      const token = await this.tokens.findByHashForUpdate(
        this.generator.hash(input.refreshToken ?? ''),
      );
      if (!token || !token.isOwnedBy(actor.userId)) return { revokedCount: 0 };
      return { revokedCount: await this.tokens.revokeChainFrom(token.id, now) };
    });
  }
}

function rejected(message: string, reason: string): RefreshOutcome {
  return { kind: 'rejected', error: new UnauthorizedError(message, reason) };
}

/** Opaque tokens are base64url without dots; legacy refresh tokens are JWTs (a.b.c). */
function looksLikeJwt(token: string): boolean {
  return token.split('.').length === 3;
}
