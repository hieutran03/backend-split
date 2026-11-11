import { Module } from '@nestjs/common';

import {
  MESSAGE_OWNERSHIP,
  type MessageOwnership,
  MessagesModule,
} from '@modules/messages/public-api';
import { DbContext } from '@platform/database/db-context';
import {
  CLOCK,
  ID_GENERATOR,
  type Clock,
  type IdGenerator,
} from '@platform/ports/kernel.port';
import {
  CreateFeedbackUseCase,
  GetFeedbackUseCase,
  UpdateFeedbackUseCase,
} from './application/feedback.use-cases';
import {
  FEEDBACK_REPOSITORY,
  type FeedbackRepository,
  MESSAGE_ACCESS,
  type MessageAccess,
} from './application/ports';
import { MessageOwnershipAccessAdapter } from './infrastructure/message-access.adapter';
import { TypeOrmFeedbackRepository } from './infrastructure/typeorm-feedback.repository';
import { FeedbackController } from './presentation/feedback.controller';

/**
 * Feedback context (FB-*). Depends on the messages context only through its public
 * query MESSAGE_OWNERSHIP, adapted to this context's MessageAccess port.
 */
@Module({
  imports: [MessagesModule],
  controllers: [FeedbackController],
  providers: [
    {
      provide: FEEDBACK_REPOSITORY,
      useFactory: (db: DbContext): FeedbackRepository =>
        new TypeOrmFeedbackRepository(db),
      inject: [DbContext],
    },
    {
      provide: MESSAGE_ACCESS,
      useFactory: (messages: MessageOwnership): MessageAccess =>
        new MessageOwnershipAccessAdapter(messages),
      inject: [MESSAGE_OWNERSHIP],
    },
    {
      provide: CreateFeedbackUseCase,
      useFactory: (
        repo: FeedbackRepository,
        messages: MessageAccess,
        clock: Clock,
        ids: IdGenerator,
      ) => new CreateFeedbackUseCase(repo, messages, clock, ids),
      inject: [FEEDBACK_REPOSITORY, MESSAGE_ACCESS, CLOCK, ID_GENERATOR],
    },
    {
      provide: GetFeedbackUseCase,
      useFactory: (repo: FeedbackRepository, messages: MessageAccess) =>
        new GetFeedbackUseCase(repo, messages),
      inject: [FEEDBACK_REPOSITORY, MESSAGE_ACCESS],
    },
    {
      provide: UpdateFeedbackUseCase,
      useFactory: (
        repo: FeedbackRepository,
        messages: MessageAccess,
        clock: Clock,
      ) => new UpdateFeedbackUseCase(repo, messages, clock),
      inject: [FEEDBACK_REPOSITORY, MESSAGE_ACCESS, CLOCK],
    },
  ],
})
export class FeedbackModule {}
