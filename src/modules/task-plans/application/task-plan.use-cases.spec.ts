import {
  FixedClock,
  ImmediateTransactions,
  SequentialIds,
} from '@test-support/fakes';
import { InMemoryTaskPlanRepository } from '@test-support/task-plan-fakes';
import { NotFoundError, ValidationError } from '@shared/errors/app-error';
import {
  AddTasksUseCase,
  CompleteTaskUseCase,
  DeleteTaskUseCase,
  GetPlanningStatusUseCase,
  GetTaskUseCase,
  ListTasksUseCase,
  UpdateTaskUseCase,
} from './task-plan.use-cases';

const alice = { userId: 'alice', isAdmin: false };
const bob = { userId: 'bob', isAdmin: false };

function setup() {
  const repo = new InMemoryTaskPlanRepository();
  repo.addConversation('c1', 'alice');
  const clock = new FixedClock();
  return {
    repo,
    clock,
    add: new AddTasksUseCase(
      repo,
      new ImmediateTransactions(),
      clock,
      new SequentialIds(),
    ),
    list: new ListTasksUseCase(repo),
    get: new GetTaskUseCase(repo),
    update: new UpdateTaskUseCase(repo, new ImmediateTransactions(), clock),
    complete: new CompleteTaskUseCase(repo, new ImmediateTransactions(), clock),
    remove: new DeleteTaskUseCase(repo, new ImmediateTransactions(), clock),
    status: new GetPlanningStatusUseCase(repo, clock),
  };
}

describe('task plan use cases', () => {
  it('A36: appends after the last task from task_order 0, pending, trimmed, metadata {}', async () => {
    const s = setup();
    const first = await s.add.execute(alice, 'c1', ['  Draft  ', 'Review']);
    expect(first.map((t) => [t.taskOrder, t.description, t.status])).toEqual([
      [0, 'Draft', 'pending'],
      [1, 'Review', 'pending'],
    ]);
    expect(first[0]?.taskMetadata).toEqual({});
    const more = await s.add.execute(alice, 'c1', ['Ship']);
    expect(more[0]?.taskOrder).toBe(2);
  });

  it('TP-02: adding turns planning mode on and resets the lifecycle to draft', async () => {
    const s = setup();
    s.repo.addConversation('c2', 'alice', false);
    const [a] = await s.add.execute(alice, 'c2', ['a']);
    expect(s.repo.conversations.get('c2')).toMatchObject({
      planningModeEnabled: true,
      planLifecycle: 'draft',
    });
    await s.complete.execute(alice, a!.id);
    expect(s.repo.conversations.get('c2')?.planLifecycle).toBe('completed');
    await s.add.execute(alice, 'c2', ['b']);
    expect(s.repo.conversations.get('c2')?.planLifecycle).toBe('draft');
  });

  it('TP-02: update / complete / delete recompute the lifecycle from all tasks', async () => {
    const s = setup();
    const lifecycle = () => s.repo.conversations.get('c1')?.planLifecycle;
    const [a, b] = await s.add.execute(alice, 'c1', ['a', 'b']);
    await s.update.execute(alice, a!.id, { status: 'in_progress' });
    expect(lifecycle()).toBe('executing');
    await s.update.execute(alice, a!.id, { status: 'pending' });
    expect(lifecycle()).toBe('draft');
    await s.complete.execute(alice, a!.id);
    expect(lifecycle()).toBe('executing');
    await s.update.execute(alice, b!.id, { status: 'skipped' });
    expect(lifecycle()).toBe('completed');
    await s.remove.execute(alice, a!.id);
    expect(lifecycle()).toBe('completed');
    await s.remove.execute(alice, b!.id);
    expect(lifecycle()).toBeNull();
  });

  it('TP-02: a refused change (other user) writes no lifecycle', async () => {
    const s = setup();
    const [a] = await s.add.execute(alice, 'c1', ['a']);
    const writes = s.repo.planStateWrites.length;
    await expect(
      s.update.execute(bob, a!.id, { status: 'completed' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(s.remove.execute(bob, a!.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(s.repo.planStateWrites).toHaveLength(writes);
  });

  it('A42: reading the status turns planning mode on when tasks exist (Python side effect)', async () => {
    const s = setup();
    await s.add.execute(alice, 'c1', ['a']);
    const c = s.repo.conversations.get('c1')!;
    s.repo.conversations.set('c1', { ...c, planningModeEnabled: false });
    const status = await s.status.execute(alice, 'c1');
    expect(status.planningModeEnabled).toBe(true);
    expect(s.repo.conversations.get('c1')).toMatchObject({
      planningModeEnabled: true,
      planLifecycle: 'draft',
    });
  });

  it('A36: someone else’s conversation ⇒ 404; blank description ⇒ 400 and nothing written', async () => {
    const s = setup();
    await expect(s.add.execute(bob, 'c1', ['x'])).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      s.add.execute(alice, 'c1', ['ok', '   ']),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(s.repo.rows.size).toBe(0);
  });

  it('A37: hides completed and skipped unless includeCompleted', async () => {
    const s = setup();
    const [a, b] = await s.add.execute(alice, 'c1', ['a', 'b', 'c']);
    await s.complete.execute(alice, a!.id);
    await s.update.execute(alice, b!.id, { status: 'skipped' });
    expect(
      (await s.list.execute(alice, 'c1', false)).map((t) => t.description),
    ).toEqual(['c']);
    expect(await s.list.execute(alice, 'c1', true)).toHaveLength(3);
  });

  it('A39/A40: completedAt follows status (set on completed, cleared when leaving it)', async () => {
    const s = setup();
    const [task] = await s.add.execute(alice, 'c1', ['a']);
    s.clock.advance(1000);
    const done = await s.complete.execute(alice, task!.id);
    expect(done.completedAt).toBe(s.clock.now().toISOString());

    s.clock.advance(1000);
    const again = await s.update.execute(alice, task!.id, {
      status: 'completed',
    });
    expect(again.completedAt).toBe(done.completedAt);

    const reopened = await s.update.execute(alice, task!.id, {
      status: 'in_progress',
      taskMetadata: { note: 1 },
    });
    expect(reopened).toMatchObject({
      status: 'in_progress',
      completedAt: null,
      taskMetadata: { note: 1 },
    });
  });

  it('A38/A41: another user ⇒ 404 task_plan_not_found; delete is a hard delete', async () => {
    const s = setup();
    const [task] = await s.add.execute(alice, 'c1', ['a']);
    const error = await s.get.execute(bob, task!.id).catch((e: unknown) => e);
    expect((error as NotFoundError).reason).toBe('task_plan_not_found');
    await s.remove.execute(alice, task!.id);
    expect(s.repo.rows.size).toBe(0);
  });

  it('A42: counts per status, progress, next task (in_progress first)', async () => {
    const s = setup();
    const empty = await s.status.execute(alice, 'c1');
    expect(empty).toMatchObject({
      totalTasks: 0,
      progressPercentage: 0,
      nextTask: null,
    });

    const [a, , c] = await s.add.execute(alice, 'c1', ['a', 'b', 'c']);
    await s.complete.execute(alice, a!.id);
    await s.update.execute(alice, c!.id, { status: 'in_progress' });
    const status = await s.status.execute(alice, 'c1');
    expect(status).toMatchObject({
      planningModeEnabled: true,
      planLifecycle: 'executing',
      totalTasks: 3,
      pendingTasks: 1,
      inProgressTasks: 1,
      completedTasks: 1,
      skippedTasks: 0,
      progressPercentage: 33.33,
    });
    expect(status.nextTask?.description).toBe('c');
  });
});
