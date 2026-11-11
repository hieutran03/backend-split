import { type DbContext } from '@platform/database/db-context';
import { TaskPlan } from '../domain/task-plan';
import type {
  PlanConversation,
  PlanLifecycle,
  TaskPlanRepository,
} from '../application/ports';
import { TaskPlanRecord } from './task-plan.record';

interface ConversationRow {
  id: string;
  planning_mode_enabled: boolean;
  plan_lifecycle: PlanLifecycle | null;
}

const CONVERSATION_SQL = `SELECT id, planning_mode_enabled, plan_lifecycle
  FROM conversations WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL`;

/**
 * `conversations` is read by table NAME for ownership (TC-35); task_plans rows are
 * hidden as soon as their conversation is deleted or not owned.
 */
export class TypeOrmTaskPlanRepository implements TaskPlanRepository {
  public constructor(private readonly db: DbContext) {}

  private get repo() {
    return this.db.manager.getRepository(TaskPlanRecord);
  }

  public findConversation(
    conversationId: string,
    ownerId: string,
  ): Promise<PlanConversation | null> {
    return this.conversation(CONVERSATION_SQL, conversationId, ownerId);
  }

  public lockConversation(
    conversationId: string,
    ownerId: string,
  ): Promise<PlanConversation | null> {
    return this.conversation(
      `${CONVERSATION_SQL} FOR UPDATE`,
      conversationId,
      ownerId,
    );
  }

  private async conversation(
    sql: string,
    conversationId: string,
    ownerId: string,
  ): Promise<PlanConversation | null> {
    const rows: ConversationRow[] = await this.db.manager.query(sql, [
      conversationId,
      ownerId,
    ]);
    const r = rows[0];
    return r
      ? {
          id: r.id,
          planningModeEnabled: r.planning_mode_enabled,
          planLifecycle: r.plan_lifecycle,
        }
      : null;
  }

  public async findOwned(
    taskPlanId: string,
    ownerId: string,
  ): Promise<TaskPlan | null> {
    const r = await this.repo
      .createQueryBuilder('t')
      .innerJoin(
        'conversations',
        'c',
        'c.id = t.conversation_id AND c.deleted_at IS NULL AND c.owner_id = :ownerId',
        { ownerId },
      )
      .where('t.id = :taskPlanId', { taskPlanId })
      .getOne();
    return r ? toDomain(r) : null;
  }

  public async listForConversation(
    conversationId: string,
  ): Promise<TaskPlan[]> {
    const records = await this.repo.find({
      where: { conversationId },
      order: { taskOrder: 'ASC' },
    });
    return records.map(toDomain);
  }

  public async maxTaskOrder(conversationId: string): Promise<number> {
    const row = await this.repo
      .createQueryBuilder('t')
      .select('COALESCE(MAX(t.task_order), 0)', 'max')
      .where('t.conversation_id = :conversationId', { conversationId })
      .getRawOne<{ max: number | string }>();
    return Number(row?.max ?? 0);
  }

  public async insertMany(tasks: TaskPlan[]): Promise<void> {
    if (tasks.length === 0) return;
    await this.repo.insert(tasks.map(toRecord) as never);
  }

  public async save(task: TaskPlan): Promise<void> {
    const { id, ...rest } = toRecord(task);
    // jsonb column: TypeORM's deep-partial typing rejects Record<string, unknown>
    // (same cast as the outbox insert).
    await this.repo.update({ id }, rest as never);
  }

  public async delete(taskPlanId: string): Promise<void> {
    await this.repo.delete({ id: taskPlanId });
  }
}

function toRecord(task: TaskPlan): TaskPlanRecord {
  const p = task.snapshot();
  const record = new TaskPlanRecord();
  Object.assign(record, {
    id: p.id,
    conversationId: p.conversationId,
    taskOrder: p.taskOrder,
    description: p.description,
    status: p.status,
    taskMetadata: p.metadata,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    completedAt: p.completedAt,
  });
  return record;
}

function toDomain(r: TaskPlanRecord): TaskPlan {
  return TaskPlan.restore({
    id: r.id,
    conversationId: r.conversationId,
    taskOrder: r.taskOrder,
    description: r.description,
    status: r.status,
    metadata: r.taskMetadata,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    completedAt: r.completedAt,
  });
}
