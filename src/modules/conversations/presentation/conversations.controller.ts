import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { type Actor } from '@shared/auth/actor';
import { type Page } from '@shared/pagination/page';
import { CurrentActor, ResponseMessage } from '@platform/http/decorators';
import {
  ApiEnvelope,
  ApiErrors,
  ApiUuidParam,
  ApiZodBody,
  ApiZodQuery,
} from '@platform/http/openapi';
import { uuidParamSchema } from '@platform/http/pagination.query';
import { BEARER_AUTH } from '@platform/http/swagger';
import { ZodValidationPipe } from '@platform/http/zod-validation.pipe';
import {
  CreateConversationUseCase,
  GetConversationUseCase,
  ListConversationsUseCase,
  UpdateConversationUseCase,
} from '../application/conversation.use-cases';
import { type ConversationView } from '../application/conversation.view';
import {
  type CreateConversationBody,
  createConversationSchema,
  conversationViewSchema,
  type ListConversationsQuery,
  listConversationsQuerySchema,
  type UpdateConversationBody,
  updateConversationSchema,
} from './conversations.schemas';

/**
 * A7, A8, A9, A11 (+ the duplicate /ai/conversations* routes A21–A24 fold into these).
 * DELETE (A12) is CONV-02; GET …/messages (A10) is MSG-01.
 */
@ApiTags('conversations')
@ApiBearerAuth(BEARER_AUTH)
@Controller('conversations')
export class ConversationsController {
  public constructor(
    @Inject(CreateConversationUseCase)
    private readonly createConversation: CreateConversationUseCase,
    @Inject(ListConversationsUseCase)
    private readonly listConversations: ListConversationsUseCase,
    @Inject(GetConversationUseCase)
    private readonly getConversation: GetConversationUseCase,
    @Inject(UpdateConversationUseCase)
    private readonly updateConversation: UpdateConversationUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List my conversations (A9)' })
  @ApiZodQuery(listConversationsQuerySchema)
  @ApiEnvelope(conversationViewSchema, {
    paginated: true,
    message: 'Get data successfully',
  })
  @ApiErrors(400, 401)
  @ResponseMessage('Get data successfully')
  public list(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(listConversationsQuerySchema))
    query: ListConversationsQuery,
  ): Promise<Page<ConversationView>> {
    const { projectId, search, ...page } = query;
    return this.listConversations.execute(actor, { projectId, search }, page);
  }

  @Post()
  @ApiOperation({ summary: 'Create a conversation (A7)' })
  @ApiZodBody(createConversationSchema)
  @ApiEnvelope(conversationViewSchema, {
    status: 201,
    message: 'Created successfully',
  })
  @ApiErrors(400, 401, 404)
  @ResponseMessage('Created successfully')
  public create(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(createConversationSchema))
    body: CreateConversationBody,
  ): Promise<ConversationView> {
    return this.createConversation.execute(actor, body);
  }

  @Get(':conversationId')
  @ApiOperation({ summary: 'Get a conversation (A8)' })
  @ApiUuidParam('conversationId')
  @ApiEnvelope(conversationViewSchema)
  @ApiErrors(400, 401, 404)
  public get(
    @CurrentActor() actor: Actor,
    @Param('conversationId', new ZodValidationPipe(uuidParamSchema))
    conversationId: string,
  ): Promise<ConversationView> {
    return this.getConversation.execute(actor, conversationId);
  }

  @Patch(':conversationId')
  @ApiOperation({
    summary: 'Update a conversation (A11)',
    description:
      '`personaPrompt: null` clears the persona; `title: null` is rejected (400).',
  })
  @ApiUuidParam('conversationId')
  @ApiZodBody(updateConversationSchema)
  @ApiEnvelope(conversationViewSchema, { message: 'Updated successfully' })
  @ApiErrors(400, 401, 404)
  @ResponseMessage('Updated successfully')
  public update(
    @CurrentActor() actor: Actor,
    @Param('conversationId', new ZodValidationPipe(uuidParamSchema))
    conversationId: string,
    @Body(new ZodValidationPipe(updateConversationSchema))
    body: UpdateConversationBody,
  ): Promise<ConversationView> {
    return this.updateConversation.execute(actor, conversationId, body);
  }
}
