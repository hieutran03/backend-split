import { Module } from '@nestjs/common';

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
  AttachConversationUseCase,
  DetachConversationUseCase,
} from './application/membership.use-cases';
import {
  CONVERSATION_MEMBERSHIP,
  type ConversationMembership,
} from './application/ports/conversation-membership';
import {
  PROJECT_REPOSITORY,
  type ProjectRepository,
} from './application/ports/project.repository';
import { TypeOrmConversationMembership } from './infrastructure/typeorm-conversation-membership';
import {
  CreateProjectUseCase,
  DeleteProjectUseCase,
  GetProjectUseCase,
  ListProjectsUseCase,
  UpdateProjectUseCase,
} from './application/project.use-cases';
import {
  PROJECT_LOOKUP,
  type ProjectLookup,
  RepositoryProjectLookup,
} from './application/project-lookup';
import { TypeOrmProjectRepository } from './infrastructure/typeorm-project.repository';
import { ProjectsController } from './presentation/projects.controller';

/**
 * Wiring for the projects module — the ONLY place the core meets NestJS.
 * Read top to bottom: adapters → use cases. Everything is `useFactory` + `new`, so
 * one file shows what gets injected where.
 */
@Module({
  controllers: [ProjectsController],
  providers: [
    {
      provide: CONVERSATION_MEMBERSHIP,
      useFactory: (db: DbContext): ConversationMembership =>
        new TypeOrmConversationMembership(db),
      inject: [DbContext],
    },
    // ---- adapters
    {
      provide: PROJECT_REPOSITORY,
      useFactory: (db: DbContext): ProjectRepository =>
        new TypeOrmProjectRepository(db),
      inject: [DbContext],
    },
    // ---- use cases
    {
      provide: CreateProjectUseCase,
      useFactory: (repo: ProjectRepository, clock: Clock, ids: IdGenerator) =>
        new CreateProjectUseCase(repo, clock, ids),
      inject: [PROJECT_REPOSITORY, CLOCK, ID_GENERATOR],
    },
    {
      provide: ListProjectsUseCase,
      useFactory: (repo: ProjectRepository) => new ListProjectsUseCase(repo),
      inject: [PROJECT_REPOSITORY],
    },
    {
      provide: GetProjectUseCase,
      useFactory: (repo: ProjectRepository) => new GetProjectUseCase(repo),
      inject: [PROJECT_REPOSITORY],
    },
    {
      provide: UpdateProjectUseCase,
      useFactory: (repo: ProjectRepository, clock: Clock) =>
        new UpdateProjectUseCase(repo, clock),
      inject: [PROJECT_REPOSITORY, CLOCK],
    },
    {
      provide: DeleteProjectUseCase,
      useFactory: (
        repo: ProjectRepository,
        membership: ConversationMembership,
        outbox: Outbox,
        tx: TransactionManager,
        clock: Clock,
      ) => new DeleteProjectUseCase(repo, membership, outbox, tx, clock),
      inject: [
        PROJECT_REPOSITORY,
        CONVERSATION_MEMBERSHIP,
        OUTBOX,
        TRANSACTION_MANAGER,
        CLOCK,
      ],
    },
    {
      provide: AttachConversationUseCase,
      useFactory: (
        repo: ProjectRepository,
        membership: ConversationMembership,
        tx: TransactionManager,
        clock: Clock,
      ) => new AttachConversationUseCase(repo, membership, tx, clock),
      inject: [
        PROJECT_REPOSITORY,
        CONVERSATION_MEMBERSHIP,
        TRANSACTION_MANAGER,
        CLOCK,
      ],
    },
    {
      provide: DetachConversationUseCase,
      useFactory: (
        repo: ProjectRepository,
        membership: ConversationMembership,
        tx: TransactionManager,
        clock: Clock,
      ) => new DetachConversationUseCase(repo, membership, tx, clock),
      inject: [
        PROJECT_REPOSITORY,
        CONVERSATION_MEMBERSHIP,
        TRANSACTION_MANAGER,
        CLOCK,
      ],
    },
    // ---- public query for other contexts (exported)
    {
      provide: PROJECT_LOOKUP,
      useFactory: (repo: ProjectRepository): ProjectLookup =>
        new RepositoryProjectLookup(repo),
      inject: [PROJECT_REPOSITORY],
    },
  ],
  exports: [PROJECT_LOOKUP],
})
export class ProjectsModule {}
