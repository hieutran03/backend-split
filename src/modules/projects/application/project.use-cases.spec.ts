import {
  FixedClock,
  ImmediateTransactions,
  RecordingOutbox,
  SequentialIds,
} from '@test-support/fakes';
import { InMemoryProjectRepository } from '@test-support/in-memory-project.repository';
import { NotFoundError, ValidationError } from '@shared/errors/app-error';
import {
  CreateProjectUseCase,
  DeleteProjectUseCase,
  GetProjectUseCase,
  ListProjectsUseCase,
  UpdateProjectUseCase,
} from './project.use-cases';

const alice = { userId: 'alice', isAdmin: false };
const bob = { userId: 'bob', isAdmin: false };

function setup() {
  const repo = new InMemoryProjectRepository();
  const clock = new FixedClock();
  const ids = new SequentialIds();
  const outbox = new RecordingOutbox();
  const tx = new ImmediateTransactions();
  return {
    repo,
    clock,
    outbox,
    tx,
    create: new CreateProjectUseCase(repo, clock, ids),
    list: new ListProjectsUseCase(repo),
    get: new GetProjectUseCase(repo),
    update: new UpdateProjectUseCase(repo, clock),
    remove: new DeleteProjectUseCase(repo, outbox, tx, clock),
  };
}

describe('projects use cases', () => {
  it('tạo project, trim name, chuỗi rỗng => null', async () => {
    const s = setup();
    const view = await s.create.execute(alice, {
      name: '  Q3 report  ',
      description: '   ',
    });
    expect(view.name).toBe('Q3 report');
    expect(view.description).toBeNull();
    expect(s.repo.rows.size).toBe(1);
  });

  it('từ chối name rỗng bằng ValidationError (400)', async () => {
    const s = setup();
    await expect(
      s.create.execute(alice, { name: '   ' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('user khác đọc project => 404, không phải 403 (D15)', async () => {
    const s = setup();
    const view = await s.create.execute(alice, { name: 'Secret' });
    await expect(s.get.execute(bob, view.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      s.update.execute(bob, view.id, { name: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(s.remove.execute(bob, view.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('list chỉ thấy project của mình, có meta phân trang', async () => {
    const s = setup();
    await s.create.execute(alice, { name: 'A1' });
    await s.create.execute(alice, { name: 'A2' });
    await s.create.execute(bob, { name: 'B1' });
    const page = await s.list.execute(alice, { page: 1, limit: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.meta).toEqual({ page: 1, limit: 1, total: 2, totalPages: 2 });
  });

  it('update đổi updatedAt theo clock', async () => {
    const s = setup();
    const created = await s.create.execute(alice, { name: 'Old' });
    s.clock.advance(60_000);
    const updated = await s.update.execute(alice, created.id, {
      name: 'New',
      instructions: 'Trả lời ngắn',
    });
    expect(updated.name).toBe('New');
    expect(updated.instructions).toBe('Trả lời ngắn');
    expect(updated.updatedAt).not.toBe(created.updatedAt);
  });

  it('delete: xoá mềm + outbox project.deleted trong 1 transaction', async () => {
    const s = setup();
    const created = await s.create.execute(alice, { name: 'Gone' });
    await s.remove.execute(alice, created.id);
    expect(s.tx.runs).toBe(1);
    expect(s.outbox.events).toEqual([
      expect.objectContaining({
        eventType: 'project.deleted',
        aggregateId: created.id,
      }),
    ]);
    await expect(s.get.execute(alice, created.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
