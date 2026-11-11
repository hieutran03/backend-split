import { Module } from '@nestjs/common';

import { DbContext } from '@platform/database/db-context';
import {
  GetMessageUseCase,
  ListConversationMessagesUseCase,
  ListMyMessagesUseCase,
} from './application/message.use-cases';
import {
  MESSAGE_REPOSITORY,
  type MessageRepository,
} from './application/ports';
import { TypeOrmMessageRepository } from './infrastructure/typeorm-message.repository';
import { MessagesController } from './presentation/messages.controller';

/** Messages context (MSG-*): read-only API over the `messages` table. */
@Module({
  controllers: [MessagesController],
  providers: [
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
})
export class MessagesModule {}
