/**
 * find() wait semantics and RECONNECT structure event tests
 *
 * Unit tests for the new public API surfaces. Tests that require
 * a live connection (find() timeout behavior, subscribeToStructure
 * RECONNECT events) are covered by the component tests in the
 * parent cdp monorepo.
 */

global.WebSocket = require('ws');
const studio = require('../index');

describe('RECONNECT structure constant', () => {
  test('studio.api.structure has ADD, REMOVE, and RECONNECT with correct values', () => {
    expect(studio.api.structure.ADD).toBe(1);
    expect(studio.api.structure.REMOVE).toBe(0);
    expect(studio.api.structure.RECONNECT).toBe(2);
  });

  test('RECONNECT is distinct from ADD and REMOVE', () => {
    const values = [studio.api.structure.ADD, studio.api.structure.REMOVE, studio.api.structure.RECONNECT];
    expect(new Set(values).size).toBe(3);
  });
});

describe('find() input validation', () => {
  test('find() with empty path rejects', async () => {
    const client = new studio.api.Client('ws://127.0.0.1:1', {}, false);
    await expect(client.find('')).rejects.toContain('not found');
    client.close();
  });

  test('find() with undefined path rejects', async () => {
    const client = new studio.api.Client('ws://127.0.0.1:1', {}, false);
    await expect(client.find()).rejects.toContain('not found');
    client.close();
  });
});

describe('close() is terminal', () => {
  test('close() can be called multiple times without error', () => {
    const client = new studio.api.Client('ws://127.0.0.1:1', {}, false);
    expect(() => {
      client.close();
      client.close();
    }).not.toThrow();
  });

  test('root() after close() rejects with closed error', async () => {
    const client = new studio.api.Client('ws://127.0.0.1:1', {}, false);
    client.close();
    await expect(client.root()).rejects.toThrow();
  });

  test('find() after close() rejects with closed error', async () => {
    const client = new studio.api.Client('ws://127.0.0.1:1', {}, false);
    client.close();
    await expect(client.find('App.Signal')).rejects.toThrow();
  });

  test('close() rejects pending find() waiters', async () => {
    const client = new studio.api.Client('ws://127.0.0.1:1', {}, false);
    const findPromise = client.find('NonExistentApp.Signal');
    await new Promise(r => setTimeout(r, 50));
    client.close();
    await expect(findPromise).rejects.toThrow();
  });
});
