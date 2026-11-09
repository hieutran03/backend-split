import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public, ResponseMessage } from '@platform/http/decorators';
import { ApiEnvelope, ApiErrors, ApiZodBody } from '@platform/http/openapi';
import { ZodValidationPipe } from '@platform/http/zod-validation.pipe';
import { LoginUseCase, SignupUseCase } from '../application/auth.use-cases';
import { type TokenView, type UserView } from '../application/views';
import {
  type LoginBody,
  loginSchema,
  type SignupBody,
  signupSchema,
  tokenViewSchema,
  userViewSchema,
} from './auth.schemas';

/**
 * A1 signup, A2 login. Refresh/logout (A3, A4) là task AUTH-02.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  public constructor(
    @Inject(SignupUseCase) private readonly signup: SignupUseCase,
    @Inject(LoginUseCase) private readonly login: LoginUseCase,
  ) {}

  @Public()
  @Post('signup')
  @ApiOperation({ summary: 'Đăng ký tài khoản (A1)' })
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
    summary: 'Đăng nhập (A2)',
    description:
      'Sai email, sai mật khẩu hay tài khoản đã xoá đều trả cùng 401 `invalid_credentials`.',
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
}
