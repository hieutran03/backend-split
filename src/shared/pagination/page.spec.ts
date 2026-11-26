import { parseSort } from './page';

const ALLOWED = ['createdAt', 'updatedAt'] as const;
const DEFAULT = { field: 'updatedAt', direction: 'DESC' } as const;

describe('parseSort', () => {
  it('uses the default order when no sort is given', () => {
    expect(parseSort(undefined, ALLOWED, DEFAULT)).toEqual(DEFAULT);
    expect(parseSort('', ALLOWED, DEFAULT)).toEqual(DEFAULT);
  });

  it('reads the direction from the prefix', () => {
    expect(parseSort('-createdAt', ALLOWED, DEFAULT)).toEqual({
      field: 'createdAt',
      direction: 'DESC',
    });
    expect(parseSort('createdAt', ALLOWED, DEFAULT)).toEqual({
      field: 'createdAt',
      direction: 'ASC',
    });
    expect(parseSort('+createdAt', ALLOWED, DEFAULT)).toEqual({
      field: 'createdAt',
      direction: 'ASC',
    });
  });

  it('falls back to the default order for a field the endpoint does not allow', () => {
    expect(parseSort('content', ALLOWED, DEFAULT)).toEqual(DEFAULT);
    expect(parseSort('-content', ALLOWED, DEFAULT)).toEqual(DEFAULT);
    expect(parseSort('-', ALLOWED, DEFAULT)).toEqual(DEFAULT);
  });
});
