const { schemas } = require('../src/validate');

describe('pagination schema', () => {
  it('accepts typical values', () => {
    const q = schemas.paginationQuery.parse({ page: '2', pageSize: '25', sort: 'updated_at', order: 'asc' });
    expect(q.page).toBe(2);
    expect(q.pageSize).toBe(25);
    expect(q.sort).toBe('updated_at');
    expect(q.order).toBe('asc');
  });

  it('rejects invalid pageSize', () => {
    expect(() => schemas.paginationQuery.parse({ pageSize: '1000' })).toThrow();
  });
});

