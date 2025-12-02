/**
 * Proxy Service Error Tests
 *
 * Tests covering proxy service failure handling and duplicate value safety.
 */

global.WebSocket = require('ws');
const studio = require('../index');
const fakeData = require('./fakeData');

const { internal } = studio;
const {
  createMockWebSocketFactory,
  createHelloMessage,
  createSystemStructureResponse,
  createServicesNotification,
  createStudioApiServiceInfo,
  createServiceMessage,
  ServiceMessageKind,
  simulateProxyHandshake
} = fakeData;

describe('Proxy service failure handling', () => {
  let originalWebSocket;
  let ctx;

  beforeEach(() => {
    jest.useFakeTimers();
    originalWebSocket = global.WebSocket;
    const factory = createMockWebSocketFactory();
    ctx = { factory, instances: factory.instances };
    global.WebSocket = factory.MockWebSocket;
  });

  afterEach(() => {
    jest.useRealTimers();
    global.WebSocket = originalWebSocket;
    ctx = null;
  });

  async function bootstrapAppConnection() {
    const app = new internal.AppConnection('ws://127.0.0.1:7689', null, false);
    const ws = ctx.instances[0];
    await jest.advanceTimersByTimeAsync(10);
    ws.simulateMessage(createHelloMessage({ compatVersion: 4 }));
    await jest.advanceTimersByTimeAsync(10);
    ws.simulateMessage(createSystemStructureResponse('TestSystem'));
    await jest.advanceTimersByTimeAsync(10);
    return { app, ws };
  }

  test('service error removes proxy connection and notifies removal handler', async () => {
    const { app, ws } = await bootstrapAppConnection();
    const service = createStudioApiServiceInfo(99, 'StableApp', '127.0.0.5', '7690');
    ws.simulateMessage(createServicesNotification([service]));
    await jest.advanceTimersByTimeAsync(10);

    const removalSpy = jest.fn();
    app.onServiceConnectionRemoved = removalSpy;

    const connectPromise = app.connectViaProxy('127.0.0.5', '7690');
    simulateProxyHandshake(ws, 99, 0, { systemName: 'StableApp' });
    await jest.advanceTimersByTimeAsync(10);
    await connectPromise;

    // Simulate a server-side service error for the tunnel
    ws.simulateMessage(createServiceMessage(99, 0, ServiceMessageKind.eError));
    await jest.advanceTimersByTimeAsync(10);

    expect(removalSpy).toHaveBeenCalledWith('99:0', false);
  });

  test('service disconnect triggers cleanup without crashing the client', async () => {
    const { app, ws } = await bootstrapAppConnection();
    const service = createStudioApiServiceInfo(105, 'SafetyApp', '127.0.0.5', '7691');
    ws.simulateMessage(createServicesNotification([service]));
    await jest.advanceTimersByTimeAsync(10);

    const removalSpy = jest.fn();
    app.onServiceConnectionRemoved = removalSpy;

    const connectPromise = app.connectViaProxy('127.0.0.5', '7691');
    simulateProxyHandshake(ws, 105, 0, { systemName: 'SafetyApp' });
    await jest.advanceTimersByTimeAsync(10);
    await connectPromise;

    ws.simulateMessage(createServiceMessage(105, 0, ServiceMessageKind.eDisconnect));
    await jest.advanceTimersByTimeAsync(10);

    expect(removalSpy).toHaveBeenCalledWith('105:0', false);
  });
});
