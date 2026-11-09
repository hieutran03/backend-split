import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { type Actor } from '@shared/auth/actor';

import {
  CurrentActor,
  Public,
  ResponseMessage,
} from '@platform/http/decorators';
import { ApiEnvelope, ApiErrors, ApiZodBody } from '@platform/http/openapi';
import { BEARER_AUTH } from '@platform/http/swagger';
import { ZodValidationPipe } from '@platform/http/zod-validation.pipe';
import { LoginUseCase, SignupUseCase } from '../application/auth.use-cases';
import {
  LogoutUseCase,
  RefreshUseCase,
} from '../application/session.use-cases';
import { type TokenView, type UserView } from '../application/views';
import {
  type LoginBody,
  loginSchema,
  type LogoutBody,
  logoutResultSchema,
  logoutSchema,
  type RefreshBody,
  refreshSchema,
  type SignupBody,
  signupSchema,
  tokenViewSchema,
  userViewSchema,
} from './auth.schemas';

/**
 * A1 signup, A2 login, A3 refresh (rotation), A4 logout (revocation).
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  public constructor(
    @Inject(SignupUseCase) private readonly signup: SignupUseCase,
    @Inject(LoginUseCase) private readonly login: LoginUseCase,
    @Inject(RefreshUseCase) private readonly refresh: RefreshUseCase,
    @Inject(LogoutUseCase) private readonly logout: LogoutUseCase,
  ) {}

  @Public()
  @Post('signup')
  @ApiOperation({ summary: 'Sign up (A1)' })
  @ApiZodBody(signupSchema)
  @ApiEnvelope(userViewSchema, { status: 201, message: 'Signup successfully' })
  @ApiErrors(400, 409)
  @ResponseMessage('Signup successfully')
  public register(
    @Body(new ZodValidationPipe(signupSchema)) body: SignupBody,
  ): Promise<UserView> {
    return this.signup.execute(body);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Log in (A2)',
    description:
      'Wrong email, wrong password or a deleted account all return the same 401 `invalid_credentials`.',
  })
  @ApiZodBody(loginSchema)
  @ApiEnvelope(tokenViewSchema, { message: 'Login successfully' })
  @ApiErrors(400, 401)
  @ResponseMessage('Login successfully')
  public signIn(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginBody,
    @Headers('user-agent') userAgent: string | undefined,
  ): Promise<TokenView> {
    return this.login.execute({ ...body, userAgent: userAgent ?? null });
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Rotate the refresh token (A3)',
    description: [
      'Single use: the presented refresh token is revoked and a new access + refresh pair is returned.',
      'Presenting an already-used token revokes the whole chain (401 `refresh_token_reused`) —',
      'clients must refresh single-flight. Other 401 reasons: `invalid_refresh_token`,',
      '`refresh_token_expired`, `legacy_refresh_not_accepted`.',
    ].join(' '),
  })
  @ApiZodBody(refreshSchema)
  @ApiEnvelope(tokenViewSchema, { message: 'Refresh successfully' })
  @ApiErrors(400, 401)
  @ResponseMessage('Refresh successfully')
  public rotate(
    @Body(new ZodValidationPipe(refreshSchema)) body: RefreshBody,
    @Headers('user-agent') userAgent: string | undefined,
  ): Promise<TokenView> {
    return this.refresh.execute({ ...body, userAgent: userAgent ?? null });
  }

  @Post('logout')
  @HttpCode(200)
  @ApiBearerAuth(BEARER_AUTH)
  @ApiOperation({
    summary: 'Log out and revoke refresh tokens (A4)',
    description:
      'Body `{ refreshToken }` revokes that token; `{ allDevices: true }` revokes every token of the caller. Already issued access tokens stay valid until they expire.',
  })
  @ApiZodBody(logoutSchema)
  @ApiEnvelope(logoutResultSchema, { message: 'Logout successfully' })
  @ApiErrors(400, 401)
  @ResponseMessage('Logout successfully')
  public signOut(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(logoutSchema)) body: LogoutBody,
  ): Promise<{ revokedCount: number }> {
    return this.logout.execute(actor, body);
  }
}
