import { Module } from '@nestjs/common';

import { DbContext } from '@platform/database/db-context';
import {
  GetMessageUseCase,
  ListConversationMessagesUseCase,
  ListMyMessagesUseCase,
} from './application/message.use-cases';
import { CONVERSATION_MESSAGE_DIGEST } from './application/message-digest';
import { FORK_MESSAGE_SOURCE } from './application/message-fork';
import {
  MESSAGE_OWNERSHIP,
  RepositoryMessageOwnership,
} from './application/message-ownership';
import {
  MESSAGE_REPOSITORY,
  type MessageRepository,
} from './application/ports';
import { TypeOrmForkMessageSource } from './infrastructure/typeorm-fork-message-source';
import { TypeOrmConversationMessageDigest } from './infrastructure/typeorm-message-digest';
import { TypeOrmMessageRepository } from './infrastructure/typeorm-message.repository';
import { MessagesController } from './presentation/messages.controller';

/**
 * Messages context (MSG-*): read-only API over the `messages` table.
 * Exports CONVERSATION_MESSAGE_DIGEST (conversation list, A9) and
 * MESSAGE_OWNERSHIP (feedback) and FORK_MESSAGE_SOURCE (fork, A12a).
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
      provide: FORK_MESSAGE_SOURCE,
      useFactory: (db: DbContext) => new TypeOrmForkMessageSource(db),
      inject: [DbContext],
    },
    {
      provide: MESSAGE_OWNERSHIP,
      useFactory: (repo: MessageRepository) =>
        new RepositoryMessageOwnership(repo),
      inject: [MESSAGE_REPOSITORY],
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
  exports: [
    CONVERSATION_MESSAGE_DIGEST,
    MESSAGE_OWNERSHIP,
    FORK_MESSAGE_SOURCE,
  ],
})
export class MessagesModule {}
