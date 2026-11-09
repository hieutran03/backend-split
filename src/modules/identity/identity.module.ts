import { Module } from '@nestjs/common';

import { JwtTokenService } from '@platform/auth/jwt-token.service';
import { APP_CONFIG, type AppConfig } from '@platform/config/app-config';
import { DbContext } from '@platform/database/db-context';
import {
  CLOCK,
  ID_GENERATOR,
  type Clock,
  type IdGenerator,
} from '@platform/ports/kernel.port';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '@platform/ports/transaction-manager.port';
import {
  USER_TOKEN_STATE_READER,
  type UserTokenStateReader,
} from '@platform/ports/user-token-state.port';
import { LoginUseCase, SignupUseCase } from './application/auth.use-cases';
import {
  ACCESS_TOKEN_ISSUER,
  type AccessTokenIssuer,
  LEGACY_REFRESH_TOKEN_VERIFIER,
  type LegacyRefreshTokenVerifier,
  OPAQUE_TOKEN_GENERATOR,
  type OpaqueTokenGenerator,
  PASSWORD_HASHER,
  type PasswordHasher,
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
  USER_REPOSITORY,
  type UserRepository,
} from './application/ports';
import { RefreshTokenIssuer } from './application/refresh-token.issuer';
import { LogoutUseCase, RefreshUseCase } from './application/session.use-cases';
import { GetMeUseCase } from './application/user.use-cases';
import { BcryptPasswordHasher } from './infrastructure/bcrypt-password.hasher';
import { JwtAccessTokenIssuer } from './infrastructure/jwt-access-token.issuer';
import {
  CryptoOpaqueTokenGenerator,
  JwtLegacyRefreshTokenVerifier,
} from './infrastructure/token-adapters';
import { TypeOrmRefreshTokenRepository } from './infrastructure/typeorm-refresh-token.repository';
import { TypeOrmUserRepository } from './infrastructure/typeorm-user.repository';
import {
  CachedUserTokenStateReader,
  TypeOrmUserTokenStateReader,
} from './infrastructure/user-token-state.readers';
import { AuthController } from './presentation/auth.controller';
import { UsersController } from './presentation/users.controller';

/**
 * Identity context: users + refresh_tokens. Covers auth (A1–A4) and users/me (A5).
 *
 * Exports USER_TOKEN_STATE_READER: the global JwtAuthGuard (platform) depends on that
 * port, and this module is the one that owns the `users` table.
 */
@Module({
  controllers: [AuthController, UsersController],
  providers: [
    // ---- adapters
    {
      provide: USER_TOKEN_STATE_READER,
      useFactory: (
        db: DbContext,
        clock: Clock,
        config: AppConfig,
      ): UserTokenStateReader => {
        const reader = new TypeOrmUserTokenStateReader(db);
        const ttlMs = config.auth.userStateCacheSeconds * 1000;
        return ttlMs > 0
          ? new CachedUserTokenStateReader(reader, clock, ttlMs)
          : reader;
      },
      inject: [DbContext, CLOCK, APP_CONFIG],
    },
    {
      provide: USER_REPOSITORY,
      useFactory: (db: DbContext): UserRepository =>
        new TypeOrmUserRepository(db),
      inject: [DbContext],
    },
    {
      provide: REFRESH_TOKEN_REPOSITORY,
      useFactory: (db: DbContext): RefreshTokenRepository =>
        new TypeOrmRefreshTokenRepository(db),
      inject: [DbContext],
    },
    {
      provide: PASSWORD_HASHER,
      useFactory: (config: AppConfig): PasswordHasher =>
        new BcryptPasswordHasher(config.auth.bcryptCost),
      inject: [APP_CONFIG],
    },
    {
      provide: ACCESS_TOKEN_ISSUER,
      useFactory: (jwt: JwtTokenService): AccessTokenIssuer =>
        new JwtAccessTokenIssuer(jwt),
      inject: [JwtTokenService],
    },
    {
      provide: OPAQUE_TOKEN_GENERATOR,
      useFactory: (): OpaqueTokenGenerator => new CryptoOpaqueTokenGenerator(),
    },
    {
      provide: LEGACY_REFRESH_TOKEN_VERIFIER,
      useFactory: (jwt: JwtTokenService): LegacyRefreshTokenVerifier =>
        new JwtLegacyRefreshTokenVerifier(jwt),
      inject: [JwtTokenService],
    },
    // ---- application services
    {
      provide: RefreshTokenIssuer,
      useFactory: (
        tokens: RefreshTokenRepository,
        generator: OpaqueTokenGenerator,
        ids: IdGenerator,
        config: AppConfig,
      ) =>
        new RefreshTokenIssuer(
          tokens,
          generator,
          ids,
          config.auth.refreshTtlSeconds,
        ),
      inject: [
        REFRESH_TOKEN_REPOSITORY,
        OPAQUE_TOKEN_GENERATOR,
        ID_GENERATOR,
        APP_CONFIG,
      ],
    },
    // ---- use cases
    {
      provide: GetMeUseCase,
      useFactory: (users: UserRepository) => new GetMeUseCase(users),
      inject: [USER_REPOSITORY],
    },
    {
      provide: SignupUseCase,
      useFactory: (
        users: UserRepository,
        hasher: PasswordHasher,
        clock: Clock,
        ids: IdGenerator,
      ) => new SignupUseCase(users, hasher, clock, ids),
      inject: [USER_REPOSITORY, PASSWORD_HASHER, CLOCK, ID_GENERATOR],
    },
    {
      provide: LoginUseCase,
      useFactory: (
        users: UserRepository,
        hasher: PasswordHasher,
        access: AccessTokenIssuer,
        issuer: RefreshTokenIssuer,
        clock: Clock,
      ) => new LoginUseCase(users, hasher, access, issuer, clock),
      inject: [
        USER_REPOSITORY,
        PASSWORD_HASHER,
        ACCESS_TOKEN_ISSUER,
        RefreshTokenIssuer,
        CLOCK,
      ],
    },
    {
      provide: RefreshUseCase,
      useFactory: (
        users: UserRepository,
        tokens: RefreshTokenRepository,
        issuer: RefreshTokenIssuer,
        generator: OpaqueTokenGenerator,
        legacy: LegacyRefreshTokenVerifier,
        access: AccessTokenIssuer,
        transactions: TransactionManager,
        clock: Clock,
        ids: IdGenerator,
        config: AppConfig,
      ) =>
        new RefreshUseCase(
          users,
          tokens,
          issuer,
          generator,
          legacy,
          access,
          transactions,
          clock,
          ids,
          config.auth.legacyRefreshUntil,
        ),
      inject: [
        USER_REPOSITORY,
        REFRESH_TOKEN_REPOSITORY,
        RefreshTokenIssuer,
        OPAQUE_TOKEN_GENERATOR,
        LEGACY_REFRESH_TOKEN_VERIFIER,
        ACCESS_TOKEN_ISSUER,
        TRANSACTION_MANAGER,
        CLOCK,
        ID_GENERATOR,
        APP_CONFIG,
      ],
    },
    {
      provide: LogoutUseCase,
      useFactory: (
        tokens: RefreshTokenRepository,
        generator: OpaqueTokenGenerator,
        transactions: TransactionManager,
        clock: Clock,
      ) => new LogoutUseCase(tokens, generator, transactions, clock),
      inject: [
        REFRESH_TOKEN_REPOSITORY,
        OPAQUE_TOKEN_GENERATOR,
        TRANSACTION_MANAGER,
        CLOCK,
      ],
    },
  ],
  exports: [USER_TOKEN_STATE_READER],
})
export class IdentityModule {}
