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
    update: new UpdateTaskUseCase(repo, clock),
    complete: new CompleteTaskUseCase(repo, clock),
    remove: new DeleteTaskUseCase(repo),
    status: new GetPlanningStatusUseCase(repo),
  };
}

describe('task plan use cases', () => {
  it('A36: appends after the last task, pending, trimmed', async () => {
    const s = setup();
    const first = await s.add.execute(alice, 'c1', ['  Draft  ', 'Review']);
    expect(first.map((t) => [t.taskOrder, t.description, t.status])).toEqual([
      [1, 'Draft', 'pending'],
      [2, 'Review', 'pending'],
    ]);
    const more = await s.add.execute(alice, 'c1', ['Ship']);
    expect(more[0]?.taskOrder).toBe(3);
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
      planLifecycle: null,
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
