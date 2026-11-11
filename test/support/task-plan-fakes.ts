import type {
  PlanConversation,
  TaskPlanRepository,
} from '@modules/task-plans/application/ports';
import { TaskPlan } from '@modules/task-plans/domain/task-plan';

interface FakeConversation extends PlanConversation {
  readonly ownerId: string;
  deleted: boolean;
}

export class InMemoryTaskPlanRepository implements TaskPlanRepository {
  public readonly conversations = new Map<string, FakeConversation>();
  public readonly rows = new Map<string, TaskPlan>();

  public addConversation(id: string, ownerId: string): void {
    this.conversations.set(id, {
      id,
      ownerId,
      planningModeEnabled: true,
      planLifecycle: null,
      deleted: false,
    });
  }

  public findConversation(
    conversationId: string,
    ownerId: string,
  ): Promise<PlanConversation | null> {
    const c = this.conversations.get(conversationId);
    return Promise.resolve(c && !c.deleted && c.ownerId === ownerId ? c : null);
  }

  public lockConversation(
    conversationId: string,
    ownerId: string,
  ): Promise<PlanConversation | null> {
    return this.findConversation(conversationId, ownerId);
  }

  public findOwned(
    taskPlanId: string,
    ownerId: string,
  ): Promise<TaskPlan | null> {
    const t = this.rows.get(taskPlanId)?.snapshot();
    if (!t) return Promise.resolve(null);
    const c = this.conversations.get(t.conversationId);
    if (!c || c.deleted || c.ownerId !== ownerId) return Promise.resolve(null);
    return Promise.resolve(TaskPlan.restore(t));
  }

  public listForConversation(conversationId: string): Promise<TaskPlan[]> {
    return Promise.resolve(
      [...this.rows.values()]
        .map((t) => t.snapshot())
        .filter((t) => t.conversationId === conversationId)
        .sort((a, b) => a.taskOrder - b.taskOrder)
        .map((t) => TaskPlan.restore(t)),
    );
  }

  public maxTaskOrder(conversationId: string): Promise<number> {
    const orders = [...this.rows.values()]
      .map((t) => t.snapshot())
      .filter((t) => t.conversationId === conversationId)
      .map((t) => t.taskOrder);
    return Promise.resolve(orders.length ? Math.max(...orders) : 0);
  }

  public insertMany(tasks: TaskPlan[]): Promise<void> {
    for (const t of tasks) this.rows.set(t.id, TaskPlan.restore(t.snapshot()));
    return Promise.resolve();
  }

  public save(task: TaskPlan): Promise<void> {
    this.rows.set(task.id, TaskPlan.restore(task.snapshot()));
    return Promise.resolve();
  }

  public delete(taskPlanId: string): Promise<void> {
    this.rows.delete(taskPlanId);
    return Promise.resolve();
  }
}
