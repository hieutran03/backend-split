import { Module } from '@nestjs/common';

import {
  PROJECT_LOOKUP,
  type ProjectLookup,
  ProjectsModule,
} from '@modules/projects/public-api';
import {
  CONVERSATION_MESSAGE_DIGEST,
  type ConversationMessageDigest,
  MessagesModule,
} from '@modules/messages/public-api';
import { DbContext } from '@platform/database/db-context';
import {
  CLOCK,
  ID_GENERATOR,
  type Clock,
  type IdGenerator,
} from '@platform/ports/kernel.port';
import { OUTBOX, type Outbox } from '@platform/ports/outbox.port';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '@platform/ports/transaction-manager.port';
import {
  CreateConversationUseCase,
  DeleteConversationUseCase,
  GetConversationUseCase,
  ListConversationsUseCase,
  UpdateConversationUseCase,
} from './application/conversation.use-cases';
import {
  CONVERSATION_MESSAGES,
  CONVERSATION_REPOSITORY,
  CONVERSATION_THREAD_SOURCE,
  type ConversationMessages,
  type ConversationRepository,
  type ConversationThreadSource,
  PROJECT_ACCESS,
  type ProjectAccess,
} from './application/ports';
import { MessageDigestAdapter } from './infrastructure/message-digest.adapter';
import { NoThreadSourceYet } from './infrastructure/no-thread-source';
import { ProjectLookupAccessAdapter } from './infrastructure/project-access.adapter';
import { TypeOrmConversationRepository } from './infrastructure/typeorm-conversation.repository';
import { ConversationsController } from './presentation/conversations.controller';

/**
 * Conversations context (CONV-*). Depends on the projects and messages contexts
 * only through their public queries (PROJECT_LOOKUP, CONVERSATION_MESSAGE_DIGEST),
 * adapted to this context's own ports (ProjectAccess, ConversationMessages).
 */
@Module({
  imports: [ProjectsModule, MessagesModule],
  controllers: [ConversationsController],
  providers: [
    // ---- adapters
    {
      provide: CONVERSATION_REPOSITORY,
      useFactory: (db: DbContext): ConversationRepository =>
        new TypeOrmConversationRepository(db),
      inject: [DbContext],
    },
    {
      provide: PROJECT_ACCESS,
      useFactory: (projects: ProjectLookup): ProjectAccess =>
        new ProjectLookupAccessAdapter(projects),
      inject: [PROJECT_LOOKUP],
    },
    {
      provide: CONVERSATION_MESSAGES,
      useFactory: (digest: ConversationMessageDigest): ConversationMessages =>
        new MessageDigestAdapter(digest),
      inject: [CONVERSATION_MESSAGE_DIGEST],
    },
    {
      provide: CONVERSATION_THREAD_SOURCE,
      useFactory: (): ConversationThreadSource => new NoThreadSourceYet(),
    },
    // ---- use cases
    {
      provide: CreateConversationUseCase,
      useFactory: (
        repo: ConversationRepository,
        projects: ProjectAccess,
        tx: TransactionManager,
        clock: Clock,
        ids: IdGenerator,
      ) => new CreateConversationUseCase(repo, projects, tx, clock, ids),
      inject: [
        CONVERSATION_REPOSITORY,
        PROJECT_ACCESS,
        TRANSACTION_MANAGER,
        CLOCK,
        ID_GENERATOR,
      ],
    },
    {
      provide: ListConversationsUseCase,
      useFactory: (
        repo: ConversationRepository,
        messages: ConversationMessages,
      ) => new ListConversationsUseCase(repo, messages),
      inject: [CONVERSATION_REPOSITORY, CONVERSATION_MESSAGES],
    },
    {
      provide: GetConversationUseCase,
      useFactory: (repo: ConversationRepository) =>
        new GetConversationUseCase(repo),
      inject: [CONVERSATION_REPOSITORY],
    },
    {
      provide: UpdateConversationUseCase,
      useFactory: (repo: ConversationRepository, clock: Clock) =>
        new UpdateConversationUseCase(repo, clock),
      inject: [CONVERSATION_REPOSITORY, CLOCK],
    },
    {
      provide: DeleteConversationUseCase,
      useFactory: (
        repo: ConversationRepository,
        threads: ConversationThreadSource,
        outbox: Outbox,
        tx: TransactionManager,
        clock: Clock,
      ) => new DeleteConversationUseCase(repo, threads, outbox, tx, clock),
      inject: [
        CONVERSATION_REPOSITORY,
        CONVERSATION_THREAD_SOURCE,
        OUTBOX,
        TRANSACTION_MANAGER,
        CLOCK,
      ],
    },
  ],
})
export class ConversationsModule {}
