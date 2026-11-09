/**
 * Prints an access token for a dev user (defaults to the seed DEV_USER_ID).
 *   pnpm -s token:dev            # dev user
 *   pnpm -s token:dev <userId>   # another user
 */
import { loadConfig } from '@platform/config/app-config';
import { JwtTokenService } from '@platform/auth/jwt-token.service';
import { DEV_USER_ID } from './dev-users';

const userId = process.argv[2] ?? DEV_USER_ID;
const config = loadConfig();
const service = new JwtTokenService({
  ...config.auth,
  accessTtlSeconds: 24 * 3600,
});
process.stdout.write(service.signAccess(userId).token + '\n');
