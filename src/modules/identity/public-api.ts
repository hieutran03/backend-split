/**
 * Public surface of the identity context.
 * AUTH-03 will also export a port reading `token_version`/`deleted_at` for the guard.
 */
export { IdentityModule } from './identity.module';
export { RefreshTokenRecord, UserRecord } from './infrastructure/records';
