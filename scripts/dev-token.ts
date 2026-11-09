/**
 * In ra access token cho user dev (mặc định DEV_USER_ID của seed).
 *   pnpm -s token:dev            # user dev
 *   pnpm -s token:dev <userId>   # user khác
 */
import { loadConfig } from '@platform/config/app-config';
import { JwtTokenService } from '@platform/auth/jwt-token.service';
import { DEV_USER_ID } from './dev-users';

const userId = process.argv[2] ?? DEV_USER_ID;
const config = loadConfig();
const service = new JwtTokenService({ ...config.auth, accessTtlSeconds: 24 * 3600 });
process.stdout.write(service.signAccess(userId).token + '\n');
