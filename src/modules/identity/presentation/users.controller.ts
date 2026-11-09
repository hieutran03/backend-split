import { Controller, Get, Inject } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { type Actor } from '@shared/auth/actor';
import { CurrentActor } from '@platform/http/decorators';
import { ApiEnvelope, ApiErrors } from '@platform/http/openapi';
import { BEARER_AUTH } from '@platform/http/swagger';
import { GetMeUseCase } from '../application/user.use-cases';
import { type UserView } from '../application/views';
import { userViewSchema } from './auth.schemas';

/** A5. */
@ApiTags('users')
@ApiBearerAuth(BEARER_AUTH)
@Controller('users')
export class UsersController {
  public constructor(
    @Inject(GetMeUseCase) private readonly getMe: GetMeUseCase,
  ) {}

  @Get('me')
  @ApiOperation({
    summary: 'My profile (A5)',
    description:
      'Replaces `GET /users/{user_id}`: the path id is gone, only the caller’s own profile is returned.',
  })
  @ApiEnvelope(userViewSchema)
  @ApiErrors(401, 404)
  public me(@CurrentActor() actor: Actor): Promise<UserView> {
    return this.getMe.execute(actor);
  }
}
