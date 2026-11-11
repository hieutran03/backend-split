import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { type Actor } from '@shared/auth/actor';
import { CurrentActor, ResponseMessage } from '@platform/http/decorators';
import {
  ApiEnvelope,
  ApiErrors,
  ApiUuidParam,
  ApiZodBody,
} from '@platform/http/openapi';
import { uuidParamSchema } from '@platform/http/pagination.query';
import { BEARER_AUTH } from '@platform/http/swagger';
import { ZodValidationPipe } from '@platform/http/zod-validation.pipe';
import {
  CreateFeedbackUseCase,
  type FeedbackView,
  GetFeedbackUseCase,
  UpdateFeedbackUseCase,
} from '../application/feedback.use-cases';
import {
  type CreateFeedbackBody,
  createFeedbackSchema,
  feedbackViewSchema,
  type UpdateFeedbackBody,
  updateFeedbackSchema,
} from './feedback.schemas';

/**
 * A30, A32–A34: one feedback per message, addressed by the message.
 * A31 (rating stats, was public) is removed: the feedback itself carries the rating.
 */
@ApiTags('feedback')
@ApiBearerAuth(BEARER_AUTH)
@Controller('messages/:messageId/feedback')
export class FeedbackController {
  public constructor(
    @Inject(CreateFeedbackUseCase)
    private readonly createFeedback: CreateFeedbackUseCase,
    @Inject(GetFeedbackUseCase)
    private readonly getFeedback: GetFeedbackUseCase,
    @Inject(UpdateFeedbackUseCase)
    private readonly updateFeedback: UpdateFeedbackUseCase,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Rate a message (A30)',
    description:
      'Create only: an existing feedback ⇒ 409 feedback_exists (use PATCH). A message the caller cannot see ⇒ 404 message_not_found.',
  })
  @ApiUuidParam('messageId')
  @ApiZodBody(createFeedbackSchema)
  @ApiEnvelope(feedbackViewSchema, {
    status: 201,
    message: 'Created successfully',
  })
  @ApiErrors(400, 401, 404, 409)
  @ResponseMessage('Created successfully')
  public create(
    @CurrentActor() actor: Actor,
    @Param('messageId', new ZodValidationPipe(uuidParamSchema))
    messageId: string,
    @Body(new ZodValidationPipe(createFeedbackSchema))
    body: CreateFeedbackBody,
  ): Promise<FeedbackView> {
    return this.createFeedback.execute(actor, messageId, body);
  }

  @Get()
  @ApiOperation({
    summary: 'Get my feedback on a message (A32, A33)',
    description: 'No feedback yet ⇒ 404 feedback_not_found.',
  })
  @ApiUuidParam('messageId')
  @ApiEnvelope(feedbackViewSchema)
  @ApiErrors(400, 401, 404)
  public get(
    @CurrentActor() actor: Actor,
    @Param('messageId', new ZodValidationPipe(uuidParamSchema))
    messageId: string,
  ): Promise<FeedbackView> {
    return this.getFeedback.execute(actor, messageId);
  }

  @Patch()
  @ApiOperation({
    summary: 'Update my feedback on a message (A34)',
    description:
      '`comment: null` clears the comment; `rating: null` is rejected.',
  })
  @ApiUuidParam('messageId')
  @ApiZodBody(updateFeedbackSchema)
  @ApiEnvelope(feedbackViewSchema, { message: 'Updated successfully' })
  @ApiErrors(400, 401, 404)
  @ResponseMessage('Updated successfully')
  public update(
    @CurrentActor() actor: Actor,
    @Param('messageId', new ZodValidationPipe(uuidParamSchema))
    messageId: string,
    @Body(new ZodValidationPipe(updateFeedbackSchema))
    body: UpdateFeedbackBody,
  ): Promise<FeedbackView> {
    return this.updateFeedback.execute(actor, messageId, body);
  }
}
