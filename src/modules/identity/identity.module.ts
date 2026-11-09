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
import { LoginUseCase, SignupUseCase } from './application/auth.use-cases';
import {
  ACCESS_TOKEN_ISSUER,
  type AccessTokenIssuer,
  PASSWORD_HASHER,
  type PasswordHasher,
  REFRESH_TOKEN_STORE,
  type RefreshTokenStore,
  USER_REPOSITORY,
  type UserRepository,
} from './application/ports';
import { BcryptPasswordHasher } from './infrastructure/bcrypt-password.hasher';
import { JwtAccessTokenIssuer } from './infrastructure/jwt-access-token.issuer';
import { TypeOrmRefreshTokenStore } from './infrastructure/typeorm-refresh-token.store';
import { TypeOrmUserRepository } from './infrastructure/typeorm-user.repository';
import { AuthController } from './presentation/auth.controller';

/**
 * Identity context: users + refresh_tokens. Covers auth (A1–A4) and users/me (A5).
 */
@Module({
  controllers: [AuthController],
  providers: [
    // ---- adapters
    {
      provide: USER_REPOSITORY,
      useFactory: (db: DbContext): UserRepository =>
        new TypeOrmUserRepository(db),
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
      provide: REFRESH_TOKEN_STORE,
      useFactory: (db: DbContext, config: AppConfig): RefreshTokenStore =>
        new TypeOrmRefreshTokenStore(db, config.auth.refreshTtlSeconds),
      inject: [DbContext, APP_CONFIG],
    },
    // ---- use cases
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
        refresh: RefreshTokenStore,
        clock: Clock,
      ) => new LoginUseCase(users, hasher, access, refresh, clock),
      inject: [
        USER_REPOSITORY,
        PASSWORD_HASHER,
        ACCESS_TOKEN_ISSUER,
        REFRESH_TOKEN_STORE,
        CLOCK,
      ],
    },
  ],
})
export class IdentityModule {}
