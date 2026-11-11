import { Module } from '@nestjs/common';

import { DbContext } from '@platform/database/db-context';
import {
  GetMessageUseCase,
  ListConversationMessagesUseCase,
  ListMyMessagesUseCase,
} from './application/message.use-cases';
import { CONVERSATION_MESSAGE_DIGEST } from './application/message-digest';
import {
  MESSAGE_REPOSITORY,
  type MessageRepository,
} from './application/ports';
import { TypeOrmConversationMessageDigest } from './infrastructure/typeorm-message-digest';
import { TypeOrmMessageRepository } from './infrastructure/typeorm-message.repository';
import { MessagesController } from './presentation/messages.controller';

/**
 * Messages context (MSG-*): read-only API over the `messages` table.
 * Exports CONVERSATION_MESSAGE_DIGEST for the conversation list (A9).
 */
@Module({
  controllers: [MessagesController],
  providers: [
    {
      provide: CONVERSATION_MESSAGE_DIGEST,
      useFactory: (db: DbContext) => new TypeOrmConversationMessageDigest(db),
      inject: [DbContext],
    },
    {
      provide: MESSAGE_REPOSITORY,
      useFactory: (db: DbContext): MessageRepository =>
        new TypeOrmMessageRepository(db),
      inject: [DbContext],
    },
    {
      provide: GetMessageUseCase,
      useFactory: (repo: MessageRepository) => new GetMessageUseCase(repo),
      inject: [MESSAGE_REPOSITORY],
    },
    {
      provide: ListConversationMessagesUseCase,
      useFactory: (repo: MessageRepository) =>
        new ListConversationMessagesUseCase(repo),
      inject: [MESSAGE_REPOSITORY],
    },
    {
      provide: ListMyMessagesUseCase,
      useFactory: (repo: MessageRepository) => new ListMyMessagesUseCase(repo),
      inject: [MESSAGE_REPOSITORY],
    },
  ],
  exports: [CONVERSATION_MESSAGE_DIGEST],
})
export class MessagesModule {}
