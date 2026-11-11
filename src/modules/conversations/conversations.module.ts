import { Module } from '@nestjs/common';

import {
  PROJECT_LOOKUP,
  type ProjectLookup,
  ProjectsModule,
} from '@modules/projects/public-api';
import {
  CONVERSATION_MESSAGE_DIGEST,
  type ConversationMessageDigest,
  FORK_MESSAGE_SOURCE,
  type ForkMessageSource,
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
  CONVERSATION_TURN_LOCK,
  type ConversationTurnLock,
} from '@platform/ports/turn-lock.port';
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
import { ForkConversationUseCase } from './application/fork.use-case';
import {
  CONVERSATION_MESSAGES,
  CONVERSATION_REPOSITORY,
  CONVERSATION_THREAD_SOURCE,
  type ConversationMessages,
  type ConversationRepository,
  type ConversationThreadSource,
  FORK_FINGERPRINT,
  FORK_MESSAGES,
  type ForkFingerprint,
  type ForkMessages,
  PROJECT_ACCESS,
  type ProjectAccess,
} from './application/ports';
import {
  ForkMessageSourceAdapter,
  Sha256ForkFingerprint,
} from './infrastructure/fork-adapters';
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
      provide: FORK_MESSAGES,
      useFactory: (source: ForkMessageSource): ForkMessages =>
        new ForkMessageSourceAdapter(source),
      inject: [FORK_MESSAGE_SOURCE],
    },
    {
      provide: FORK_FINGERPRINT,
      useFactory: (): ForkFingerprint => new Sha256ForkFingerprint(),
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
    {
      provide: ForkConversationUseCase,
      useFactory: (
        repo: ConversationRepository,
        projects: ProjectAccess,
        messages: ForkMessages,
        fingerprints: ForkFingerprint,
        turnLock: ConversationTurnLock,
        tx: TransactionManager,
        outbox: Outbox,
        clock: Clock,
        ids: IdGenerator,
      ) =>
        new ForkConversationUseCase(
          repo,
          projects,
          messages,
          fingerprints,
          turnLock,
          tx,
          outbox,
          clock,
          ids,
        ),
      inject: [
        CONVERSATION_REPOSITORY,
        PROJECT_ACCESS,
        FORK_MESSAGES,
        FORK_FINGERPRINT,
        CONVERSATION_TURN_LOCK,
        TRANSACTION_MANAGER,
        OUTBOX,
        CLOCK,
        ID_GENERATOR,
      ],
    },
  ],
})
export class ConversationsModule {}
