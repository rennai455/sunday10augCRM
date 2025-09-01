// tests/unit/db.test.js: unit tests for db utility
const queryMock = jest.fn();
const connectMock = jest.fn();

jest.mock('pg', () => ({
  Pool: jest.fn(() => ({
    connect: connectMock,
    query: queryMock,
  })),
}));

const db = require('../../db');

describe('db utilities', () => {
  beforeEach(() => {
    connectMock.mockReset();
    queryMock.mockReset();
  });

  it('withTransaction commits and returns result', async () => {
    const clientQuery = jest.fn();
    const release = jest.fn();
    connectMock.mockResolvedValue({ query: clientQuery, release });

    const result = await db.withTransaction(async () => 'ok');

    expect(clientQuery).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(clientQuery).toHaveBeenNthCalledWith(2, 'COMMIT');
    expect(release).toHaveBeenCalled();
    expect(result).toBe('ok');
  });

  it('withTransaction rolls back on error', async () => {
    const clientQuery = jest.fn();
    const release = jest.fn();
    connectMock.mockResolvedValue({ query: clientQuery, release });

    await expect(db.withTransaction(async () => {
      throw new Error('fail');
    })).rejects.toThrow('fail');

    expect(clientQuery).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(clientQuery).toHaveBeenNthCalledWith(2, 'ROLLBACK');
    expect(release).toHaveBeenCalled();
  });

  it('query delegates to pool.query', async () => {
    queryMock.mockResolvedValue('res');
    const result = await db.query('SELECT 1');
    expect(queryMock).toHaveBeenCalledWith('SELECT 1', undefined);
    expect(result).toBe('res');
  });

  it('smokeTest performs SELECT 1', async () => {
    queryMock.mockResolvedValue('res');
    const result = await db.smokeTest();
    expect(queryMock).toHaveBeenCalledWith('SELECT 1');
    expect(result).toBe('res');
  });
});
