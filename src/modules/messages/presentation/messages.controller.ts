import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { type Actor } from '@shared/auth/actor';
import { type Page } from '@shared/pagination/page';
import { CurrentActor } from '@platform/http/decorators';
import {
  ApiEnvelope,
  ApiErrors,
  ApiUuidParam,
  ApiZodQuery,
} from '@platform/http/openapi';
import { uuidParamSchema } from '@platform/http/pagination.query';
import { BEARER_AUTH } from '@platform/http/swagger';
import { ZodValidationPipe } from '@platform/http/zod-validation.pipe';
import {
  GetMessageUseCase,
  ListConversationMessagesUseCase,
  ListMyMessagesUseCase,
} from '../application/message.use-cases';
import { type MessageView } from '../application/message.view';
import {
  type ListConversationMessagesQuery,
  listConversationMessagesQuerySchema,
  type ListMessagesQuery,
  listMessagesQuerySchema,
  messageViewSchema,
} from './messages.schemas';

/**
 * Read-only message routes: A10, A19, A20. Messages are written by the
 * generations context (W4). `format=ui-message` (A26) is MSG-02.
 */
@ApiTags('messages')
@ApiBearerAuth(BEARER_AUTH)
@Controller()
export class MessagesController {
  public constructor(
    @Inject(GetMessageUseCase)
    private readonly getMessage: GetMessageUseCase,
    @Inject(ListConversationMessagesUseCase)
    private readonly listConversationMessages: ListConversationMessagesUseCase,
    @Inject(ListMyMessagesUseCase)
    private readonly listMyMessages: ListMyMessagesUseCase,
  ) {}

  @Get('conversations/:conversationId/messages')
  @ApiOperation({
    summary: 'List messages of a conversation (A10)',
    description:
      'Default sort `-sequence`. Another user’s or a deleted conversation ⇒ 404 conversation_not_found.',
  })
  @ApiUuidParam('conversationId')
  @ApiZodQuery(listConversationMessagesQuerySchema)
  @ApiEnvelope(messageViewSchema, { paginated: true })
  @ApiErrors(400, 401, 404)
  public listForConversation(
    @CurrentActor() actor: Actor,
    @Param('conversationId', new ZodValidationPipe(uuidParamSchema))
    conversationId: string,
    @Query(new ZodValidationPipe(listConversationMessagesQuerySchema))
    query: ListConversationMessagesQuery,
  ): Promise<Page<MessageView>> {
    const { page, limit, sort } = query;
    return this.listConversationMessages.execute(actor, conversationId, {
      page,
      limit,
      sort,
    });
  }

  @Get('messages')
  @ApiOperation({
    summary: 'List my messages (A20)',
    description: 'Default sort `-createdAt`; optional `conversationId` filter.',
  })
  @ApiZodQuery(listMessagesQuerySchema)
  @ApiEnvelope(messageViewSchema, { paginated: true })
  @ApiErrors(400, 401)
  public list(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(listMessagesQuerySchema))
    query: ListMessagesQuery,
  ): Promise<Page<MessageView>> {
    const { page, limit, sort, conversationId } = query;
    return this.listMyMessages.execute(
      actor,
      { conversationId },
      { page, limit, sort },
    );
  }

  @Get('messages/:messageId')
  @ApiOperation({
    summary: 'Get a message (A19)',
    description: 'Not owned, deleted or unknown ⇒ 404 message_not_found.',
  })
  @ApiUuidParam('messageId')
  @ApiEnvelope(messageViewSchema)
  @ApiErrors(400, 401, 404)
  public get(
    @CurrentActor() actor: Actor,
    @Param('messageId', new ZodValidationPipe(uuidParamSchema))
    messageId: string,
  ): Promise<MessageView> {
    return this.getMessage.execute(actor, messageId);
  }
}
