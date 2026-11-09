/**
 * A refresh token row (`refresh_tokens`, §6.3 S2).
 *
 * Lifecycle:
 *   active ──rotate()──▶ revoked (replacedById = successor)
 *   active ──revoke()──▶ revoked (logout, reuse detection)
 *   active ──time─────▶ expired
 *
 * Tokens form a chain through `replacedById`: login → rotate → rotate → … Presenting a
 * token that is already revoked means it was copied (stolen or replayed), so the whole
 * chain from that token onwards is revoked (A3 "reuse revokes the family").
 *
 * The plain token value never lives here — only its SHA-256 (`tokenHash`).
 */
export interface RefreshTokenProps {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
  readonly userAgent: string | null;
  readonly createdAt: Date;
}

export const USER_AGENT_MAX = 512;

export class RefreshToken {
  private constructor(private readonly props: RefreshTokenProps) {}

  public static issue(input: {
    id: string;
    userId: string;
    tokenHash: string;
    userAgent: string | null;
    now: Date;
    ttlSeconds: number;
  }): RefreshToken {
    return new RefreshToken({
      id: input.id,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: new Date(input.now.getTime() + input.ttlSeconds * 1000),
      revokedAt: null,
      replacedById: null,
      userAgent: input.userAgent?.slice(0, USER_AGENT_MAX) ?? null,
      createdAt: input.now,
    });
  }

  /**
   * Records that a legacy Python refresh JWT was exchanged (D19). The row is born
   * revoked and points at its successor, so presenting the same JWT again is detected
   * exactly like reuse of a rotated opaque token.
   */
  public static legacyExchangeMarker(input: {
    id: string;
    userId: string;
    tokenHash: string;
    successorId: string;
    now: Date;
  }): RefreshToken {
    return new RefreshToken({
      id: input.id,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.now,
      revokedAt: input.now,
      replacedById: input.successorId,
      userAgent: 'legacy-jwt-exchange',
      createdAt: input.now,
    });
  }

  public static restore(props: RefreshTokenProps): RefreshToken {
    return new RefreshToken({ ...props });
  }

  public get id(): string {
    return this.props.id;
  }
  public get userId(): string {
    return this.props.userId;
  }
  public get isRevoked(): boolean {
    return this.props.revokedAt !== null;
  }

  public isExpired(now: Date): boolean {
    return now.getTime() >= this.props.expiresAt.getTime();
  }

  public isOwnedBy(userId: string): boolean {
    return this.props.userId === userId;
  }

  /** Single use: an active token is consumed and points at the token that replaced it. */
  public rotate(successorId: string, now: Date): void {
    if (this.isRevoked) {
      throw new Error('Cannot rotate a revoked refresh token');
    }
    this.props.revokedAt = now;
    this.props.replacedById = successorId;
  }

  public snapshot(): Readonly<RefreshTokenProps> {
    return { ...this.props };
  }
}
