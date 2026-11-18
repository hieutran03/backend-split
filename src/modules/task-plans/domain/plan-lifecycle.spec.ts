import { deriveLifecycle } from './plan-lifecycle';

describe('deriveLifecycle (Python _derive_lifecycle_from_tasks)', () => {
  it.each([
    [[], null],
    [['pending', 'pending'], 'draft'],
    [['pending', 'in_progress'], 'executing'],
    [['pending', 'completed'], 'executing'],
    [['pending', 'skipped'], 'executing'],
    [['completed', 'skipped'], 'completed'],
    [['completed'], 'completed'],
    [['skipped'], 'completed'],
    [['in_progress', 'completed'], 'executing'],
  ] as const)('%j ⇒ %s', (statuses, expected) => {
    expect(deriveLifecycle(statuses)).toBe(expected);
  });
});
