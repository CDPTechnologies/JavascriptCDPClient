/**
 * Error Handling Tests
 *
 * Tests error handling scenarios including:
 * 1. WebSocket close handling
 * 2. Protocol errors (eRemoteError)
 * 3. Service connection failures
 * 4. Invalid message handling
 * 5. Node not found errors
 * 6. Subscription error callbacks
 */

global.WebSocket = require('ws');
const studio = require('../index');
const fakeData = require('./fakeData');

const { protocol, internal } = studio;
const {
  FakeSocket,
  FakeTransport,
  ContainerType,
  CDPNodeType,
  CDPValueType,
  ServiceMessageKind,
  createHelloMessage,
  createStructureResponse,
  createSystemStructureResponse,
  createServicesNotification,
  createStudioApiServiceInfo,
  createLoggerServiceInfo,
  createServiceMessage,
  createGetterResponse,
  createSingleGetterResponse,
  createRemoteError,
  createStructureChangeResponse,
  createMockWebSocketFactory,
  simulateProxyHandshake
} = fakeData;

// Open a MockWebSocket-backed AppConnection, deliver Hello at the given
// compatVersion, and settle the root structure response. Returns { app, ws,
// teardown } — call teardown() to restore global.WebSocket and real timers.
async function openConnection(compatVersion) {
  jest.useFakeTimers();
  const originalWebSocket = global.WebSocket;
  const { MockWebSocket, instances } = createMockWebSocketFactory();
  global.WebSocket = MockWebSocket;
  const app = new internal.AppConnection('ws://127.0.0.1:7689', null, false);
  const ws = instances[0];
  await jest.advanceTimersByTimeAsync(10);
  ws.simulateMessage(createHelloMessage({ compatVersion }));
  await jest.advanceTimersByTimeAsync(10);
  ws.simulateMessage(createSystemStructureResponse('TestSystem'));
  await jest.advanceTimersByTimeAsync(10);
  return {
    app, ws,
    teardown() { global.WebSocket = originalWebSocket; jest.useRealTimers(); }
  };
}

describe('Error Handling - Malformed Messages', () => {
  test('should handle invalid protobuf data gracefully', async () => {
    const socket = new FakeSocket();
    const handler = new protocol.Handler(socket, null);
    let errorCalled = false;

    handler.onError = () => {
      errorCalled = true;
    };

    // Initialize with valid Hello first
    handler.handle(createHelloMessage({ compatVersion: 4 }));
    await new Promise(resolve => setImmediate(resolve));

    // Send garbage data - should trigger error handler
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    handler.handle(new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF, 0xFF]));
    await new Promise(resolve => setImmediate(resolve));

    consoleSpy.mockRestore();
    // Error should have been handled without crashing
  });

  test('should handle empty message', async () => {
    const socket = new FakeSocket();
    const handler = new protocol.Handler(socket, null);

    // Initialize
    handler.handle(createHelloMessage({ compatVersion: 4 }));
    await new Promise(resolve => setImmediate(resolve));

    // Send empty data
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    handler.handle(new Uint8Array([]));
    await new Promise(resolve => setImmediate(resolve));
    consoleSpy.mockRestore();

    // Should not crash
    expect(socket.closed).toBe(false);
  });

  test('should handle truncated protobuf message', async () => {
    const socket = new FakeSocket();
    const handler = new protocol.Handler(socket, null);

    // Initialize
    handler.handle(createHelloMessage({ compatVersion: 4 }));
    await new Promise(resolve => setImmediate(resolve));

    // Create a valid message and truncate it
    const validMsg = createSystemStructureResponse('Test');
    const truncated = validMsg.slice(0, Math.floor(validMsg.length / 2));

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    handler.handle(truncated);
    await new Promise(resolve => setImmediate(resolve));
    consoleSpy.mockRestore();

    // Should handle gracefully
    expect(socket.closed).toBe(false);
  });
});

describe('WebSocket Disconnect Handling', () => {
  test('FakeSocket should trigger onclose callback with code', () => {
    const socket = new FakeSocket();
    let closeEvent = null;

    socket.onclose = (event) => {
      closeEvent = event;
    };

    socket.close();

    expect(closeEvent).toBeDefined();
    expect(closeEvent.code).toBe(1000);
    expect(closeEvent.reason).toBe('Normal closure');
  });

  test('FakeSocket should update readyState on close', () => {
    const socket = new FakeSocket();
    expect(socket.readyState).toBe(1); // OPEN

    socket.close();

    expect(socket.readyState).toBe(3); // CLOSED
    expect(socket.closed).toBe(true);
  });

  test('FakeTransport should trigger onclose callback', () => {
    const transport = new FakeTransport();
    let closeEvent = null;

    transport.onclose = (event) => {
      closeEvent = event;
    };

    transport.close();

    expect(closeEvent).toBeDefined();
    expect(closeEvent.code).toBe(1000);
  });

  test('FakeSocket should trigger onerror on simulateError', () => {
    const socket = new FakeSocket();
    let errorEvent = null;

    socket.onerror = (event) => {
      errorEvent = event;
    };

    socket.simulateError('Connection reset');

    expect(errorEvent).toBeDefined();
    expect(errorEvent.data).toBe('Connection reset');
  });

  test('FakeSocket should trigger onopen on simulateOpen', () => {
    const socket = new FakeSocket();
    socket.readyState = 0; // CONNECTING
    let openCalled = false;

    socket.onopen = () => {
      openCalled = true;
    };

    socket.simulateOpen();

    expect(openCalled).toBe(true);
    expect(socket.readyState).toBe(1); // OPEN
  });
});

describe('Service Protocol - Service Removal', () => {
  test('AppConnection should clear services on receiving empty ServicesNotification', async () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);

    // Simulate initial services
    app.onServicesReceived([
      createStudioApiServiceInfo(1, 'App1'),
      createStudioApiServiceInfo(2, 'App2')
    ], { compatVersion: 4 });

    expect(app.services().size).toBe(2);

    // Simulate services going away
    app.onServicesReceived([], { compatVersion: 4 });

    expect(app.services().size).toBe(0);
  });

  test('AppConnection should update services when service list changes', async () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);

    // Initial services
    app.onServicesReceived([
      createStudioApiServiceInfo(1, 'App1'),
      createStudioApiServiceInfo(2, 'App2')
    ], { compatVersion: 4 });

    expect(app.services().size).toBe(2);

    // Service 2 goes away, Service 3 appears
    app.onServicesReceived([
      createStudioApiServiceInfo(1, 'App1'),
      createStudioApiServiceInfo(3, 'App3')
    ], { compatVersion: 4 });

    expect(app.services().size).toBe(2);
    expect(app.services().has(1)).toBe(true);
    expect(app.services().has(2)).toBe(false);
    expect(app.services().has(3)).toBe(true);
  });

  test('onServicesUpdated callback should NOT be called for non-primary connections', () => {
    // onServicesUpdated is only called for primary connections
    // When AppConnection is created with a transport (not URL), isPrimaryConnection=false
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);
    const onServicesUpdated = jest.fn();
    app.onServicesUpdated = onServicesUpdated;

    app.onServicesReceived([createStudioApiServiceInfo(1, 'App1')], { compatVersion: 4 });

    // For non-primary connections (transport-based), callback is not called
    // This is correct behavior - only the primary WebSocket connection notifies
    expect(onServicesUpdated).not.toHaveBeenCalled();
  });

  test('services should still be updated for non-primary connections', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);

    app.onServicesReceived([createStudioApiServiceInfo(1, 'App1')], { compatVersion: 4 });

    // Services should be updated regardless of primary/non-primary
    expect(app.services().size).toBe(1);
    expect(app.services().get(1).name).toBe('App1');
  });

  test('instance counters should NOT reset when service is removed and re-added (primary connection)', async () => {
    jest.useFakeTimers();

    // Mock WebSocket to test primary connection behavior
    const originalWebSocket = global.WebSocket;
    const { MockWebSocket, instances } = createMockWebSocketFactory();
    global.WebSocket = MockWebSocket;

    try {
      // Create primary connection (URL-based - this is the critical difference)
      const app = new internal.AppConnection('ws://127.0.0.1:7689', null, false);

      // WebSocket should be created immediately
      expect(instances.length).toBe(1);
      const ws = instances[0];

      // Simulate connection open
      await jest.advanceTimersByTimeAsync(10);

      // Simulate server Hello with compat version 4 (supports proxy protocol)
      ws.simulateMessage(createHelloMessage({ compatVersion: 4 }));
      await jest.advanceTimersByTimeAsync(10);

      // Simulate system structure response
      ws.simulateMessage(createSystemStructureResponse('TestSystem'));
      await jest.advanceTimersByTimeAsync(10);

      // Simulate services notification with a sibling app
      const service1 = createStudioApiServiceInfo(1, 'SiblingApp', '192.168.1.100', '7690');
      ws.simulateMessage(createServicesNotification([service1]));
      await jest.advanceTimersByTimeAsync(10);

      // Create proxy connections to sibling (simulate full handshake)
      const conn1Promise = app.connectViaProxy('192.168.1.100', '7690');
      simulateProxyHandshake(ws, 1, 0, { systemName: 'SiblingApp' });
      await jest.advanceTimersByTimeAsync(10);
      const conn1 = await conn1Promise;
      expect(conn1.instanceKey).toBe('1:0');

      const conn2Promise = app.connectViaProxy('192.168.1.100', '7690');
      simulateProxyHandshake(ws, 1, 1, { systemName: 'SiblingApp' });
      await jest.advanceTimersByTimeAsync(10);
      const conn2 = await conn2Promise;
      expect(conn2.instanceKey).toBe('1:1');

      // Simulate sibling going down - services notification without the sibling
      // This triggers the removal code path in onServicesReceived (isPrimaryConnection=true)
      ws.simulateMessage(createServicesNotification([]));
      await jest.advanceTimersByTimeAsync(10);

      // Simulate sibling coming back
      ws.simulateMessage(createServicesNotification([service1]));
      await jest.advanceTimersByTimeAsync(10);

      // New connection should get instanceId 2, NOT 0
      // This tests the bug fix: counters must NOT reset when service is removed
      const conn3Promise = app.connectViaProxy('192.168.1.100', '7690');
      simulateProxyHandshake(ws, 1, 2, { systemName: 'SiblingApp' });
      await jest.advanceTimersByTimeAsync(10);
      const conn3 = await conn3Promise;
      expect(conn3.instanceKey).toBe('1:2');

      const conn4Promise = app.connectViaProxy('192.168.1.100', '7690');
      simulateProxyHandshake(ws, 1, 3, { systemName: 'SiblingApp' });
      await jest.advanceTimersByTimeAsync(10);
      const conn4 = await conn4Promise;
      expect(conn4.instanceKey).toBe('1:3');

      // Verify all instance keys are unique
      const keys = [conn1.instanceKey, conn2.instanceKey, conn3.instanceKey, conn4.instanceKey];
      expect(new Set(keys).size).toBe(4);

      app.close();
    } finally {
      global.WebSocket = originalWebSocket;
      jest.useRealTimers();
    }
  });

  test('instance counters should be isolated per serviceId (primary connection)', async () => {
    jest.useFakeTimers();

    const originalWebSocket = global.WebSocket;
    const { MockWebSocket, instances } = createMockWebSocketFactory();
    global.WebSocket = MockWebSocket;

    try {
      const app = new internal.AppConnection('ws://127.0.0.1:7689', null, false);
      expect(instances.length).toBe(1);
      const ws = instances[0];

      await jest.advanceTimersByTimeAsync(10);
      ws.simulateMessage(createHelloMessage({ compatVersion: 4 }));
      await jest.advanceTimersByTimeAsync(10);
      ws.simulateMessage(createSystemStructureResponse('TestSystem'));
      await jest.advanceTimersByTimeAsync(10);

      // Two services
      const service1 = createStudioApiServiceInfo(1, 'App1', '192.168.1.100', '7690');
      const service2 = createStudioApiServiceInfo(2, 'App2', '192.168.1.101', '7691');
      ws.simulateMessage(createServicesNotification([service1, service2]));
      await jest.advanceTimersByTimeAsync(10);

      // Service 1 connections (simulate full handshake)
      const conn1aPromise = app.connectViaProxy('192.168.1.100', '7690');
      simulateProxyHandshake(ws, 1, 0, { systemName: 'App1' });
      await jest.advanceTimersByTimeAsync(10);
      const conn1a = await conn1aPromise;
      expect(conn1a.instanceKey).toBe('1:0');

      const conn1bPromise = app.connectViaProxy('192.168.1.100', '7690');
      simulateProxyHandshake(ws, 1, 1, { systemName: 'App1' });
      await jest.advanceTimersByTimeAsync(10);
      const conn1b = await conn1bPromise;
      expect(conn1b.instanceKey).toBe('1:1');

      // Service 2 connections - separate counter starting at 0
      const conn2aPromise = app.connectViaProxy('192.168.1.101', '7691');
      simulateProxyHandshake(ws, 2, 0, { systemName: 'App2' });
      await jest.advanceTimersByTimeAsync(10);
      const conn2a = await conn2aPromise;
      expect(conn2a.instanceKey).toBe('2:0');

      const conn2bPromise = app.connectViaProxy('192.168.1.101', '7691');
      simulateProxyHandshake(ws, 2, 1, { systemName: 'App2' });
      await jest.advanceTimersByTimeAsync(10);
      const conn2b = await conn2bPromise;
      expect(conn2b.instanceKey).toBe('2:1');

      // Back to service 1 - continues from 2
      const conn1cPromise = app.connectViaProxy('192.168.1.100', '7690');
      simulateProxyHandshake(ws, 1, 2, { systemName: 'App1' });
      await jest.advanceTimersByTimeAsync(10);
      const conn1c = await conn1cPromise;
      expect(conn1c.instanceKey).toBe('1:2');

      app.close();
    } finally {
      global.WebSocket = originalWebSocket;
      jest.useRealTimers();
    }
  });

  test('partial service removal should only disconnect removed services (Long vs Number bug fix)', async () => {
    // This test verifies the fix for the bug where removing ONE service from ServicesNotification
    // incorrectly removed ALL service connections. The bug was caused by serviceId being a Long
    // object after protobuf decode, but the comparison using Number - Set.has(Number) always
    // returned false when the Set contained Long objects.
    jest.useFakeTimers();

    const originalWebSocket = global.WebSocket;
    const { MockWebSocket, instances } = createMockWebSocketFactory();
    global.WebSocket = MockWebSocket;

    try {
      const app = new internal.AppConnection('ws://127.0.0.1:7689', null, false);

      expect(instances.length).toBe(1);
      const ws = instances[0];

      await jest.advanceTimersByTimeAsync(10);
      ws.simulateMessage(createHelloMessage({ compatVersion: 4 }));
      await jest.advanceTimersByTimeAsync(10);
      ws.simulateMessage(createSystemStructureResponse('TestSystem'));
      await jest.advanceTimersByTimeAsync(10);

      // Two services available
      const service1 = createStudioApiServiceInfo(1, 'App1', '192.168.1.100', '7690');
      const service2 = createStudioApiServiceInfo(2, 'App2', '192.168.1.101', '7691');
      ws.simulateMessage(createServicesNotification([service1, service2]));
      await jest.advanceTimersByTimeAsync(10);

      // Create connections to both services (simulate full handshake)
      const conn1Promise = app.connectViaProxy('192.168.1.100', '7690');
      simulateProxyHandshake(ws, 1, 0, { systemName: 'App1' });
      await jest.advanceTimersByTimeAsync(10);
      const conn1 = await conn1Promise;
      expect(conn1.instanceKey).toBe('1:0');

      const conn2Promise = app.connectViaProxy('192.168.1.101', '7691');
      simulateProxyHandshake(ws, 2, 0, { systemName: 'App2' });
      await jest.advanceTimersByTimeAsync(10);
      const conn2 = await conn2Promise;
      expect(conn2.instanceKey).toBe('2:0');

      // Verify both services are available
      expect(app.isProxyAvailable('192.168.1.100', '7690')).toBe(true);
      expect(app.isProxyAvailable('192.168.1.101', '7691')).toBe(true);

      // Remove ONLY service 2 (App2 goes down, App1 stays up)
      ws.simulateMessage(createServicesNotification([service1]));
      await jest.advanceTimersByTimeAsync(10);

      // Service 1 should still be available, service 2 should be gone
      expect(app.isProxyAvailable('192.168.1.100', '7690')).toBe(true);
      expect(app.isProxyAvailable('192.168.1.101', '7691')).toBe(false);

      // Should still be able to create new connections to service 1
      const conn3Promise = app.connectViaProxy('192.168.1.100', '7690');
      simulateProxyHandshake(ws, 1, 1, { systemName: 'App1' });
      await jest.advanceTimersByTimeAsync(10);
      const conn3 = await conn3Promise;
      expect(conn3.instanceKey).toBe('1:1');

      // Connection to removed service should fail
      await expect(app.connectViaProxy('192.168.1.101', '7691'))
        .rejects.toMatch(/No matching proxy service found/);

      app.close();
    } finally {
      global.WebSocket = originalWebSocket;
      jest.useRealTimers();
    }
  });
});

describe('Service Protocol - Proxy Service Lookup', () => {
  test('findProxyService should return null for non-existent service', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);

    app.onServicesReceived([createStudioApiServiceInfo(1, 'App1', '192.168.1.100', '7690')], { compatVersion: 4 });

    const result = app.findProxyService('192.168.1.200', '7690');
    expect(result).toBeNull();
  });

  test('isProxyAvailable should return false for non-existent service', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);

    app.onServicesReceived([createStudioApiServiceInfo(1, 'App1', '192.168.1.100', '7690')], { compatVersion: 4 });

    expect(app.isProxyAvailable('192.168.1.200', '7690')).toBe(false);
  });

  test('findProxyService should match by metadata.ip_address', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);

    const service = createStudioApiServiceInfo(1, 'App1', '192.168.1.100', '7690');

    app.onServicesReceived([service], { compatVersion: 4 });

    const result = app.findProxyService('192.168.1.100', '7690');
    expect(result).not.toBeNull();
    expect(result.name).toBe('App1');
  });
});

describe('Subscription Edge Cases', () => {
  test('should handle multiple subscriptions to same node', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);
    const systemNode = app.root();

    const consumer1 = jest.fn();
    const consumer2 = jest.fn();

    systemNode.async.subscribeToValues(consumer1, 5, 0);
    systemNode.async.subscribeToValues(consumer2, 5, 0);

    // Should have sent two getter requests (one per subscription)
    expect(transport.sent.length).toBe(2);
  });

  test('should handle unsubscribe when not subscribed', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);
    const systemNode = app.root();

    const consumer = jest.fn();

    // Unsubscribe without ever subscribing - should not crash
    systemNode.async.unsubscribeFromValues(consumer);

    // Should not have sent any messages
    expect(transport.sent.length).toBe(0);
  });

  test('should handle subscription with sampleRate=0 (all samples)', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);
    const systemNode = app.root();

    const consumer = jest.fn();
    systemNode.async.subscribeToValues(consumer, 5, 0);

    expect(transport.sent.length).toBe(1);
    const container = transport.getLastSentContainer();
    expect(container.getterRequest[0].sampleRate).toBeFalsy(); // 0 or undefined
  });

  test('should select maximum fs from multiple subscriptions', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);
    const systemNode = app.root();

    const consumer1 = jest.fn();
    const consumer2 = jest.fn();

    systemNode.async.subscribeToValues(consumer1, 5, 10);
    systemNode.async.subscribeToValues(consumer2, 20, 5);

    // Last request should have max fs=20
    const container = transport.getLastSentContainer();
    expect(container.getterRequest[0].fs).toBe(20);
  });

  test('should send stop request only after all consumers unsubscribe', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);
    const systemNode = app.root();

    const consumer1 = jest.fn();
    const consumer2 = jest.fn();

    systemNode.async.subscribeToValues(consumer1, 5, 0);
    systemNode.async.subscribeToValues(consumer2, 5, 0);
    expect(transport.sent.length).toBe(2);

    // Unsubscribe first consumer - should update but not stop
    systemNode.async.unsubscribeFromValues(consumer1);
    expect(transport.sent.length).toBe(3);
    let container = transport.getLastSentContainer();
    expect(container.getterRequest[0].stop).toBeFalsy();

    // Unsubscribe second consumer - should stop
    systemNode.async.unsubscribeFromValues(consumer2);
    expect(transport.sent.length).toBe(4);
    container = transport.getLastSentContainer();
    expect(container.getterRequest[0].stop).toBe(true);
  });
});

describe('Structure Subscription', () => {
  test('should handle subscribeToStructure callback', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);
    const systemNode = app.root();

    const structureConsumer = jest.fn();
    systemNode.async.subscribeToStructure(structureConsumer);

    // Structure subscription doesn't send messages until structure changes
    // Just verify no errors
    expect(transport.sent.length).toBe(0);
  });

  test('should handle unsubscribeFromStructure', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);
    const systemNode = app.root();

    const structureConsumer = jest.fn();
    systemNode.async.subscribeToStructure(structureConsumer);
    systemNode.async.unsubscribeFromStructure(structureConsumer);

    // Should not crash
    expect(transport.sent.length).toBe(0);
  });

  test('structure callback that unsubscribes another during dispatch does not skip the next', async () => {
    // Empirically verifies dispatchCallbacks .slice() semantics: a callback
    // that removes another during iteration must still deliver to all other
    // callbacks that were registered at dispatch-start. Without the slice
    // copy, forEach+splice would shift the iteration past a remaining
    // callback.
    const { app, ws, teardown } = await openConnection(4);
    try {
      const root = app.root();
      let cb1Calls = 0, cb2Calls = 0, cb3Calls = 0;
      const cb1 = () => { cb1Calls++; };
      const cb2 = () => {
        cb2Calls++;
        root.async.unsubscribeFromStructure(cb3);
      };
      const cb3 = () => { cb3Calls++; };
      root.async.subscribeToStructure(cb1);
      root.async.subscribeToStructure(cb2);
      root.async.subscribeToStructure(cb3);

      ws.simulateMessage(createSystemStructureResponse('TestSystem', [
        { nodeId: 77, name: 'NewChild', isLocal: true,
          nodeType: CDPNodeType.CDP_APPLICATION }
      ]));
      await jest.advanceTimersByTimeAsync(10);

      // All three must have fired — cb2 unsubscribing cb3 during dispatch
      // must NOT hide cb3 from this dispatch (snapshot semantics).
      expect(cb1Calls).toBe(1);
      expect(cb2Calls).toBe(1);
      expect(cb3Calls).toBe(1);
    } finally { teardown(); }
  });

  test('throwing value callback does not abort remaining callbacks', async () => {
    // Value-callback dispatch uses the same dispatchCallbacks helper as
    // structure. A throw in the first callback must not prevent the
    // second from being invoked.
    const { app, ws, teardown } = await openConnection(4);
    try {
      const root = app.root();
      let cb2Called = false;
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      root.async.subscribeToValues(() => { throw new Error('boom'); }, 1, 0);
      root.async.subscribeToValues(() => { cb2Called = true; }, 1, 0);

      ws.simulateMessage(createSingleGetterResponse(protocol.SYSTEM_NODE_ID, 42.5));
      await jest.advanceTimersByTimeAsync(10);

      expect(cb2Called).toBe(true);
      expect(errSpy).toHaveBeenCalled();
      errSpy.mockRestore();
    } finally { teardown(); }
  });
});

describe('Event Subscription', () => {
  test('should send event request on subscribeToEvents', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);
    const systemNode = app.root();

    const eventConsumer = jest.fn();
    systemNode.async.subscribeToEvents(eventConsumer, 0);

    expect(transport.sent.length).toBe(1);
    const container = transport.getLastSentContainer();
    expect(container.messageType).toBe(ContainerType.eEventRequest);
  });

  test('should send stop event request on unsubscribeFromEvents', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);
    const systemNode = app.root();

    const eventConsumer = jest.fn();
    systemNode.async.subscribeToEvents(eventConsumer, 0);
    systemNode.async.unsubscribeFromEvents(eventConsumer);

    expect(transport.sent.length).toBe(2);
    const container = transport.getLastSentContainer();
    expect(container.messageType).toBe(ContainerType.eEventRequest);
    expect(container.eventRequest[0].stop).toBe(true);
  });
});

describe('Child Add/Remove Requests', () => {
  test('should send child add request', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);
    const systemNode = app.root();

    systemNode.async.addChild('NewChild', 'CDPSignal<double>');

    expect(transport.sent.length).toBe(1);
    const container = transport.getLastSentContainer();
    expect(container.messageType).toBe(ContainerType.eChildAddRequest);
    expect(container.childAddRequest[0].childName).toBe('NewChild');
    expect(container.childAddRequest[0].childTypeName).toBe('CDPSignal<double>');
  });

  test('should send child remove request', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);
    const systemNode = app.root();

    systemNode.async.removeChild('OldChild');

    expect(transport.sent.length).toBe(1);
    const container = transport.getLastSentContainer();
    expect(container.messageType).toBe(ContainerType.eChildRemoveRequest);
    expect(container.childRemoveRequest[0].childName).toBe('OldChild');
  });

  test('empty Container (error unset) with childAdd request_id is handled as success ack', async () => {
    // The server uses a Container with message_type default (0 == eRemoteError)
    // and no error field set, only request_ids, as the success ack for
    // childAdd / childRemove. handleIncomingContainer routes containers with
    // a null error field to clearPendingByRequestIds instead of
    // parseErrorResponse, so the pending entry clears without a failure log.
    const { app, ws, teardown } = await openConnection(4);
    try {
      app.root().async.addChild('TestChild', 'CDPSignal<double>');
      await jest.advanceTimersByTimeAsync(10);

      const childAddReq = ws.getAllSentContainers()
        .find(c => c.messageType === ContainerType.eChildAddRequest);
      expect(childAddReq.requestIds.length).toBe(1);
      const reqId = childAddReq.requestIds[0];
      expect(reqId).toBeGreaterThan(0);

      const ackBytes = protocol.Container.encode(
        protocol.Container.create({ requestIds: [reqId] })
      ).finish();

      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      ws.simulateMessage(ackBytes);
      await jest.advanceTimersByTimeAsync(10);

      const handlerErrors = errSpy.mock.calls.filter(c => c[0].includes('Handler error'));
      expect(handlerErrors).toHaveLength(0);
      errSpy.mockRestore();

      // Verify the pending entry was actually cleared (not just "not-crashed").
      // Probe: a follow-up eRemoteError carrying the SAME reqId must fall
      // through the "no match" log branch — proving the ack path removed
      // the entry rather than silently ignoring the Container.
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      ws.simulateMessage(protocol.Container.encode(protocol.Container.create({
        messageType: ContainerType.eRemoteError,
        error: { code: protocol.RemoteErrorCode.eINTERNAL_ERROR, text: 'probe' },
        requestIds: [reqId]
      })).finish());
      await jest.advanceTimersByTimeAsync(10);
      const typeChildAddLogged = logSpy.mock.calls.some(c =>
        typeof c[0] === 'string' && /Request failed:.*type=childAdd/.test(c[0])
      );
      expect(typeChildAddLogged).toBe(false);
      logSpy.mockRestore();
    } finally { teardown(); }
  });

  test('compat < 3 server: no make*Request attaches request_ids', async () => {
    const { app, ws, teardown } = await openConnection(2);
    try {
      app.root().async.subscribeToValues(jest.fn(), 5, 0);
      app.root().async.subscribeToEvents(jest.fn());
      app.root().async.addChild('TestChild', 'CDPSignal<double>');
      app.root().async.removeChild('TestChild');
      app.root().async.fetch();
      await jest.advanceTimersByTimeAsync(10);

      const sent = ws.getAllSentContainers();
      const requestTypes = [
        ContainerType.eStructureRequest,
        ContainerType.eGetterRequest,
        ContainerType.eEventRequest,
        ContainerType.eChildAddRequest,
        ContainerType.eChildRemoveRequest,
      ];
      const requests = sent.filter(c => requestTypes.includes(c.messageType));
      expect(requests.length).toBeGreaterThan(0);
      for (const req of requests) {
        expect(req.requestIds).toEqual([]);
      }
    } finally { teardown(); }
  });

  test('compat >= 3 server: empty subscription-confirmation event IS filtered (not delivered to callback)', async () => {
    // Positive test for the empty-event filter. The server sends an event
    // with id=0, empty sender, timestamp=0, empty data as the first event
    // on a subscribe that carried a request_id (EventService.cpp:301-323
    // SendEmptyEventToConfirmSubscriptionActivated). The client must
    // filter it so user callbacks never see a spurious zero-alarm. Pairs
    // with the compat<3 pass-through test below.
    const { app, ws, teardown } = await openConnection(4);
    try {
      const eventCallback = jest.fn();
      app.root().async.subscribeToEvents(eventCallback);
      await jest.advanceTimersByTimeAsync(10);

      ws.simulateMessage(protocol.Container.encode(protocol.Container.create({
        messageType: ContainerType.eEventResponse,
        eventResponse: [{
          nodeId: [protocol.SYSTEM_NODE_ID],
          id: 0,
          sender: '',
          code: 0,
          status: 0,
          timestamp: 0,
        }]
      })).finish());
      await jest.advanceTimersByTimeAsync(10);

      expect(eventCallback).not.toHaveBeenCalled();
    } finally { teardown(); }
  });

  test('compat < 3 server: event matching confirmation pattern is still delivered (not filtered)', async () => {
    const { app, ws, teardown } = await openConnection(2);
    try {
      const eventCallback = jest.fn();
      app.root().async.subscribeToEvents(eventCallback);
      await jest.advanceTimersByTimeAsync(10);

      // Deliver an event that happens to match the compat-3 confirmation
      // pattern (id=0, no sender, timestamp=0, empty data). A legacy server
      // does not send that pattern as a confirmation message, so the
      // client must deliver it as a normal event.
      ws.simulateMessage(protocol.Container.encode(protocol.Container.create({
        messageType: ContainerType.eEventResponse,
        eventResponse: [{
          nodeId: [protocol.SYSTEM_NODE_ID],
          id: 0,
          sender: '',
          code: 0,
          status: 0,
          timestamp: 0,
        }]
      })).finish());
      await jest.advanceTimersByTimeAsync(10);

      expect(eventCallback).toHaveBeenCalledTimes(1);
    } finally { teardown(); }
  });

  test('eRemoteError with getter subscribe request_id clears pending and logs type+nodeId', async () => {
    const { app, ws, teardown } = await openConnection(4);
    try {
      app.root().async.subscribeToValues(jest.fn(), 5, 0);
      await jest.advanceTimersByTimeAsync(10);

      const getterReq = ws.getAllSentContainers()
        .find(c => c.messageType === ContainerType.eGetterRequest);
      expect(getterReq.requestIds[0]).toBeGreaterThan(0);
      const reqId = getterReq.requestIds[0];

      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      const errContainer = protocol.Container.encode(protocol.Container.create({
        messageType: ContainerType.eRemoteError,
        error: { nodeId: 0, code: protocol.RemoteErrorCode.eNODE_NOT_FOUND, text: 'Node not found' },
        requestIds: [reqId],
      })).finish();
      ws.simulateMessage(errContainer);
      await jest.advanceTimersByTimeAsync(10);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Request failed:.*type=getter.*nodeId=0/));
      logSpy.mockRestore();
    } finally { teardown(); }
  });

  test('_markStructureStale resets structureFetched so onDone blocks until new structure', async () => {
    const { app, ws, teardown } = await openConnection(4);
    try {
      const sys = app.root();
      let firstResolved = false;
      sys.async.onDone(() => { firstResolved = true; }, () => {}, sys);
      await jest.advanceTimersByTimeAsync(10);
      expect(firstResolved).toBe(true);

      sys._markStructureStale();
      let secondResolved = false;
      sys.async.onDone(() => { secondResolved = true; }, () => {}, sys);
      await jest.advanceTimersByTimeAsync(10);
      expect(secondResolved).toBe(false);

      ws.simulateMessage(createSystemStructureResponse('TestSystem'));
      await jest.advanceTimersByTimeAsync(10);
      expect(secondResolved).toBe(true);
    } finally { teardown(); }
  });

  test('invalidation batch with mixed tracked/untracked nodes refetches tracked and acks untracked', async () => {
    const { app, ws, teardown } = await openConnection(4);
    try {
      const trackedNodeId = protocol.SYSTEM_NODE_ID;
      const untrackedNodeId = 88888;
      const trackedReqId = 10;
      const untrackedReqId = 11;
      const invalidation = protocol.Container.encode(protocol.Container.create({
        messageType: ContainerType.eStructureChangeResponse,
        structureChangeResponse: [trackedNodeId, untrackedNodeId],
        requestIds: [trackedReqId, untrackedReqId],
      })).finish();

      const countBefore = ws.getAllSentContainers().length;
      ws.simulateMessage(invalidation);
      await jest.advanceTimersByTimeAsync(10);

      const sentAfter = ws.getAllSentContainers().slice(countBefore);
      const refetch = sentAfter.find(c =>
        c.messageType === ContainerType.eStructureRequest
        && c.structureRequest.includes(trackedNodeId)
      );
      expect(refetch).toBeDefined();
      const ack = sentAfter.find(c =>
        c.messageType === ContainerType.eStructureRequest
        && c.structureRequest.length === 0
        && c.requestIds.includes(untrackedReqId)
        && !c.requestIds.includes(trackedReqId)
      );
      expect(ack).toBeDefined();
    } finally { teardown(); }
  });

  test('reconnect walks previously-fetched descendant subtrees after markStructureStale', async () => {
    const { app, ws, teardown } = await openConnection(4);
    try {
      const sys = app.root();
      const childNodeId = 4242;
      const childName = 'ChildApp';

      // Re-deliver the root structure with a child so systemNode has a child
      // to walk. openConnection's initial structure had none.
      ws.simulateMessage(createSystemStructureResponse('TestSystem', [
        { nodeId: childNodeId, name: childName, isLocal: true,
          nodeType: CDPNodeType.CDP_APPLICATION }
      ]));
      await jest.advanceTimersByTimeAsync(10);

      let childNode = null;
      sys.forEachChild(function(c) { if (c.name() === childName) childNode = c; });
      expect(childNode).not.toBeNull();

      // Fetch the child's own structure so child.structureFetched becomes true.
      // Build the response inline — createStructureResponse puts nodeId at the
      // wrong level for parseStructureResponse's info.nodeId lookup.
      childNode.async.fetch();
      await jest.advanceTimersByTimeAsync(10);
      const childStructureBytes = protocol.Container.encode(protocol.Container.create({
        messageType: ContainerType.eStructureResponse,
        structureResponse: [{
          info: {
            nodeId: childNodeId,
            name: childName,
            nodeType: CDPNodeType.CDP_APPLICATION,
            isLocal: true
          },
          node: []
        }]
      })).finish();
      ws.simulateMessage(childStructureBytes);
      await jest.advanceTimersByTimeAsync(10);
      expect(childNode.isStructureFetched()).toBe(true);

      // Simulate the connectViaProxy reconnect path: _triggerReconnect clears
      // per-connection state (so the first-Hello block fires again) and
      // _markStructureStale resets root's structureFetched flag to match the
      // state connectViaProxy leaves its reconnect Promise waiting in.
      app._triggerReconnect();
      sys._markStructureStale();
      ws.clearSent();

      // Deliver a fresh Hello + root structure (still containing the child).
      ws.simulateMessage(createHelloMessage({ compatVersion: 4 }));
      await jest.advanceTimersByTimeAsync(10);
      ws.simulateMessage(createSystemStructureResponse('TestSystem', [
        { nodeId: childNodeId, name: childName, isLocal: true,
          nodeType: CDPNodeType.CDP_APPLICATION }
      ]));
      await jest.advanceTimersByTimeAsync(10);

      // Assert a structure_request for the child was sent. Only the post-Hello
      // descendant walk produces this — HelloHandler only re-fetches the root,
      // and update() only re-sends subscriptions for nodes whose structure is
      // in the response.
      const structureReqs = ws.getAllSentContainers()
        .filter(c => c.messageType === ContainerType.eStructureRequest);
      const childRefetch = structureReqs.find(r => r.structureRequest.includes(childNodeId));
      expect(childRefetch).toBeDefined();
      // The descendant refetch must carry a non-zero request_id. Without it,
      // a compat>=3 server's error would have no correlation target and the
      // whole resilience premise leaks on the reconnect path. The regression
      // this guards: if onOpen (or any earlier hook) fired resubscribe before
      // currentMetadata was set, make*Request would skip the attachRequestId
      // gate and emit an untagged request.
      expect(childRefetch.requestIds.length).toBeGreaterThan(0);
      expect(childRefetch.requestIds[0]).toBeGreaterThan(0);
    } finally { teardown(); }
  });

  test('eRemoteError for pending structure fetch rejects onDone waiters immediately', async () => {
    const { app, ws, teardown } = await openConnection(4);
    try {
      const staleChildId = 7777;
      const staleChildName = 'GoneChild';

      // Install the stale child in root's structure, then fetch its own
      // structure — the fetch's request_id is what we expect the server to
      // echo back in the error response.
      ws.simulateMessage(createSystemStructureResponse('TestSystem', [
        { nodeId: staleChildId, name: staleChildName, isLocal: true,
          nodeType: CDPNodeType.CDP_APPLICATION }
      ]));
      await jest.advanceTimersByTimeAsync(10);

      let childNode = null;
      app.root().forEachChild(function(c) {
        if (c.name() === staleChildName) childNode = c;
      });
      expect(childNode).not.toBeNull();

      const countBefore = ws.getAllSentContainers().length;
      childNode.async.fetch();
      await jest.advanceTimersByTimeAsync(10);

      // Extract the requestId that was attached to the structure_request.
      const childRequest = ws.getAllSentContainers()
        .slice(countBefore)
        .find(c => c.messageType === ContainerType.eStructureRequest
                && c.structureRequest.includes(staleChildId));
      expect(childRequest).toBeDefined();
      expect(childRequest.requestIds.length).toBeGreaterThan(0);
      const failedReqId = childRequest.requestIds[0];

      let onDoneResolved = false;
      let onDoneRejected = false;
      childNode.async.onDone(
        function() { onDoneResolved = true; },
        function() { onDoneRejected = true; },
        childNode
      );

      // Server returns eNODE_NOT_FOUND with the echoed request_id.
      const errorContainer = protocol.Container.encode(protocol.Container.create({
        messageType: ContainerType.eRemoteError,
        error: {
          code: protocol.RemoteErrorCode.eNODE_NOT_FOUND,
          text: 'stale node'
        },
        requestIds: [failedReqId]
      })).finish();

      // Advance <<< STRUCTURE_REQUEST_TIMEOUT_MS (30s) — the rejection must
      // arrive via the error correlation, not the client-side timeout.
      ws.simulateMessage(errorContainer);
      await jest.advanceTimersByTimeAsync(100);

      expect(onDoneRejected).toBe(true);
      expect(onDoneResolved).toBe(false);
      // Validity is left intact: flipping it here without also pruning the
      // node from its parent's childMap and nodeMap would leave the client
      // in a contradictory state (invalid but still reachable via navigation
      // APIs). The parent's next structure fetch will prune stale children
      // through the normal removeMissingChildNodesByNames path.
      expect(childNode.isValid()).toBe(true);
    } finally { teardown(); }
  });

  // Regression for the H2 remap race: if a structure fetch is in flight when
  // parseChildNode remaps the node id, clearPendingByNodeAndType must clear
  // the old entry when a new fetch is issued on the same logical node —
  // otherwise the captured-node rejection path propagates the old error to
  // the new fetch's waiters. Match on node reference (stable across remap),
  // not on the stored nodeId (stale after remap).
  test('late error for remapped old id does NOT reject waiters of a newer fetch on the same node', async () => {
    const { app, ws, teardown } = await openConnection(4);
    try {
      const origId = 3030;
      const newId = 4040;
      const childName = 'RemapChild';

      ws.simulateMessage(createSystemStructureResponse('TestSystem', [
        { nodeId: origId, name: childName, isLocal: true,
          nodeType: CDPNodeType.CDP_APPLICATION }
      ]));
      await jest.advanceTimersByTimeAsync(10);

      let childNode = null;
      app.root().forEachChild(function(c) {
        if (c.name() === childName) childNode = c;
      });
      expect(childNode.id()).toBe(origId);

      const countBeforeOrig = ws.getAllSentContainers().length;
      childNode.async.fetch();
      await jest.advanceTimersByTimeAsync(10);
      const origRequest = ws.getAllSentContainers()
        .slice(countBeforeOrig)
        .find(c => c.messageType === ContainerType.eStructureRequest
                && c.structureRequest.includes(origId));
      const origReqId = origRequest.requestIds[0];

      // Remap before origFetch's response arrives.
      ws.simulateMessage(createSystemStructureResponse('TestSystem', [
        { nodeId: newId, name: childName, isLocal: true,
          nodeType: CDPNodeType.CDP_APPLICATION }
      ]));
      await jest.advanceTimersByTimeAsync(10);
      expect(childNode.id()).toBe(newId);

      // New fetch on the same logical node, now under the new id.
      const countBeforeNew = ws.getAllSentContainers().length;
      childNode.async.fetch();
      await jest.advanceTimersByTimeAsync(10);
      const newRequest = ws.getAllSentContainers()
        .slice(countBeforeNew)
        .find(c => c.messageType === ContainerType.eStructureRequest
                && c.structureRequest.includes(newId));
      const newReqId = newRequest.requestIds[0];
      expect(newReqId).not.toBe(origReqId);

      let newFetchResolved = false;
      let newFetchRejected = false;
      childNode.async.onDone(
        function() { newFetchResolved = true; },
        function() { newFetchRejected = true; },
        childNode
      );

      // Late error for the ORIG reqId arrives. Must not reject the newer
      // fetch's waiters (different requestId, same logical node).
      ws.simulateMessage(protocol.Container.encode(protocol.Container.create({
        messageType: ContainerType.eRemoteError,
        error: {
          code: protocol.RemoteErrorCode.eNODE_NOT_FOUND,
          text: 'late error for orig id'
        },
        requestIds: [origReqId]
      })).finish());
      await jest.advanceTimersByTimeAsync(10);

      expect(newFetchRejected).toBe(false);
      expect(newFetchResolved).toBe(false);
    } finally { teardown(); }
  });

  test('late eRemoteError after node id remap still rejects waiters via captured node reference', async () => {
    const { app, ws, teardown } = await openConnection(4);
    try {
      const origId = 3030;
      const newId = 4040;
      const childName = 'RemapChild';

      ws.simulateMessage(createSystemStructureResponse('TestSystem', [
        { nodeId: origId, name: childName, isLocal: true,
          nodeType: CDPNodeType.CDP_APPLICATION }
      ]));
      await jest.advanceTimersByTimeAsync(10);

      let childNode = null;
      app.root().forEachChild(function(c) {
        if (c.name() === childName) childNode = c;
      });

      const countBefore = ws.getAllSentContainers().length;
      childNode.async.fetch();
      await jest.advanceTimersByTimeAsync(10);
      const childRequest = ws.getAllSentContainers()
        .slice(countBefore)
        .find(c => c.messageType === ContainerType.eStructureRequest
                && c.structureRequest.includes(origId));
      const failedReqId = childRequest.requestIds[0];

      // Remap: same child name, new id. parseChildNode rewrites nodeMap so
      // nodeMap.get(origId) is no longer the child — only the captured node
      // reference from trackPendingRequest can still reach it.
      ws.simulateMessage(createSystemStructureResponse('TestSystem', [
        { nodeId: newId, name: childName, isLocal: true,
          nodeType: CDPNodeType.CDP_APPLICATION }
      ]));
      await jest.advanceTimersByTimeAsync(10);
      expect(childNode.id()).toBe(newId);

      let onDoneRejected = false;
      childNode.async.onDone(
        function() {},
        function() { onDoneRejected = true; },
        childNode
      );

      ws.simulateMessage(protocol.Container.encode(protocol.Container.create({
        messageType: ContainerType.eRemoteError,
        error: {
          code: protocol.RemoteErrorCode.eNODE_NOT_FOUND,
          text: 'late error for orig id'
        },
        requestIds: [failedReqId]
      })).finish());
      await jest.advanceTimersByTimeAsync(10);

      expect(onDoneRejected).toBe(true);
    } finally { teardown(); }
  });

  test('direct reconnect onReconnected fires after new root structure has pruned stale children', async () => {
    jest.useFakeTimers();
    const originalWebSocket = global.WebSocket;
    const { MockWebSocket, instances } = createMockWebSocketFactory();
    global.WebSocket = MockWebSocket;
    try {
      // autoConnect=true so scheduleReconnect fires a new MockWebSocket.
      const app = new internal.AppConnection('ws://127.0.0.1:7689', null, true);
      const ws = instances[0];
      await jest.advanceTimersByTimeAsync(10);
      ws.simulateMessage(createHelloMessage({ compatVersion: 4 }));
      await jest.advanceTimersByTimeAsync(10);

      const oldChildId = 6161;
      const oldChildName = 'OldChild';

      // Pre-disconnect: root has OldChild. structureFetched=true after this.
      ws.simulateMessage(createSystemStructureResponse('TestSystem', [
        { nodeId: oldChildId, name: oldChildName, isLocal: true,
          nodeType: CDPNodeType.CDP_APPLICATION }
      ]));
      await jest.advanceTimersByTimeAsync(10);
      expect(app.root().isStructureFetched()).toBe(true);

      let onReconnectedCalls = 0;
      let reconnectedSawOldOnly = false;
      app.onReconnected = function() {
        onReconnectedCalls++;
        var names = [];
        app.root().forEachChild(function(c) { names.push(c.name()); });
        if (names.length === 1 && names[0] === oldChildName) reconnectedSawOldOnly = true;
      };

      // Real WebSocket disconnect: onClosed → cleanupPrimaryConnectionState,
      // then scheduleReconnect's setTimeout body calls _markStructureStale
      // before opening the new socket.
      ws.closed = true;
      ws.readyState = 3;
      ws.onclose({ code: 1006, reason: 'Connection lost' });
      await jest.advanceTimersByTimeAsync(3000);

      expect(instances.length).toBe(2);
      const ws2 = instances[1];
      ws2.readyState = 1;
      ws2.onopen({});
      await jest.advanceTimersByTimeAsync(10);

      // If the reconnect hook did not defer, the descendant walk + onReconnected
      // fire synchronously against the pre-disconnect child map here.
      ws2.simulateMessage(createHelloMessage({ compatVersion: 4 }));
      await jest.advanceTimersByTimeAsync(10);

      // New root structure with NO children — pruning runs inside the same
      // parseStructureResponse call that sets structureFetched=true, so
      // onReconnected must fire against the post-prune tree (zero children).
      ws2.simulateMessage(createSystemStructureResponse('TestSystem'));
      await jest.advanceTimersByTimeAsync(10);

      // Assert the callback actually fired — a "saw old only"-only check would
      // silently pass if onReconnected were dropped entirely.
      expect(onReconnectedCalls).toBe(1);
      expect(reconnectedSawOldOnly).toBe(false);
      app.close();
    } finally {
      global.WebSocket = originalWebSocket;
      jest.useRealTimers();
    }
  });

  test('buffered containers arriving after close() are dropped (no reconnect, no tree mutation, no user callbacks)', async () => {
    const { app, ws, teardown } = await openConnection(4);
    try {
      let onReconnectedCalls = 0;
      app.onReconnected = function() { onReconnectedCalls++; };

      // Subscribe so a late getter response has a callback target.
      const valueCallback = jest.fn();
      app.root().async.subscribeToValues(valueCallback, 5, 0);
      await jest.advanceTimersByTimeAsync(10);
      const valueCallsBeforeClose = valueCallback.mock.calls.length;

      app.close();

      // Late structure response — would otherwise enter first-Hello, walk
      // stale children, and fire onReconnected; would also mutate the tree
      // through parseStructureResponse.
      ws.simulateMessage(createSystemStructureResponse('TestSystem', [
        { nodeId: 42, name: 'ShouldNotAppear', isLocal: true,
          nodeType: CDPNodeType.CDP_APPLICATION }
      ]));
      await jest.advanceTimersByTimeAsync(10);

      // Late getter response — would otherwise invoke the user callback on
      // a connection the user just closed.
      ws.simulateMessage(createGetterResponse([
        { nodeId: protocol.SYSTEM_NODE_ID, value: 1.0, timestamp: 1 }
      ]));
      await jest.advanceTimersByTimeAsync(10);

      expect(onReconnectedCalls).toBe(0);
      expect(valueCallback.mock.calls.length).toBe(valueCallsBeforeClose);
      let foundGhost = false;
      app.root().forEachChild(function(c) { if (c.name() === 'ShouldNotAppear') foundGhost = true; });
      expect(foundGhost).toBe(false);
    } finally { teardown(); }
  });

  test('buffered eStructureResponse arriving after abnormal disconnect but before reconnect fires does not fire onReconnected', async () => {
    jest.useFakeTimers();
    const originalWebSocket = global.WebSocket;
    const { MockWebSocket, instances } = createMockWebSocketFactory();
    global.WebSocket = MockWebSocket;
    try {
      // autoConnect=true so onClosed → scheduleReconnect is reached.
      const app = new internal.AppConnection('ws://127.0.0.1:7689', null, true);
      const ws = instances[0];
      await jest.advanceTimersByTimeAsync(10);
      ws.simulateMessage(createHelloMessage({ compatVersion: 4 }));
      await jest.advanceTimersByTimeAsync(10);
      ws.simulateMessage(createSystemStructureResponse('TestSystem', [
        { nodeId: 52, name: 'PreDisconnectChild', isLocal: true,
          nodeType: CDPNodeType.CDP_APPLICATION }
      ]));
      await jest.advanceTimersByTimeAsync(10);

      let onReconnectedCalls = 0;
      app.onReconnected = function() { onReconnectedCalls++; };

      // Abnormal disconnect (code 1006, not an app.close() call) — onClosed
      // fires, cleanupPrimaryConnectionState clears currentMetadata, and
      // scheduleReconnect marks the root stale synchronously before the
      // backoff timer.
      ws.closed = true;
      ws.readyState = 3;
      ws.onclose({ code: 1006, reason: 'Connection lost' });

      // Do NOT advance past the backoff — simulate a buffered frame from
      // the old socket arriving in the gap between onClosed and the new
      // WebSocket opening. This frame carries the OLD session's system
      // structure with NO children: if it were processed, PreDisconnectChild
      // would be pruned by removeMissingChildNodesByNames and onReconnected
      // would fire against the stale tree.
      ws.simulateMessage(createSystemStructureResponse('TestSystem'));
      await jest.advanceTimersByTimeAsync(10);

      expect(onReconnectedCalls).toBe(0);
      // Tree must NOT have been mutated by the dropped frame. Use
      // forEachChildImmediate because structureFetched is now false
      // (scheduleReconnect marked the root stale) and forEachChild would
      // defer behind a new structure_request instead of iterating.
      let preStillThere = false;
      app.root().forEachChildImmediate(function(c) {
        if (c.name() === 'PreDisconnectChild') preStillThere = true;
      });
      expect(preStillThere).toBe(true);
      app.close();
    } finally {
      global.WebSocket = originalWebSocket;
      jest.useRealTimers();
    }
  });

  test('buffered frames from old closed socket are dropped by readyState gate', async () => {
    jest.useFakeTimers();
    const originalWebSocket = global.WebSocket;
    const { MockWebSocket, instances } = createMockWebSocketFactory();
    global.WebSocket = MockWebSocket;
    try {
      const app = new internal.AppConnection('ws://127.0.0.1:7689', null, true);
      const ws1 = instances[0];
      await jest.advanceTimersByTimeAsync(10);
      ws1.simulateMessage(createHelloMessage({ compatVersion: 4 }));
      await jest.advanceTimersByTimeAsync(10);
      ws1.simulateMessage(createSystemStructureResponse('TestSystem', [
        { nodeId: 101, name: 'AliveChild', isLocal: true,
          nodeType: CDPNodeType.CDP_APPLICATION }
      ]));
      await jest.advanceTimersByTimeAsync(10);

      // Abnormal disconnect → onClosed → scheduleReconnect → (later) reconnect
      ws1.closed = true;
      ws1.readyState = 3;
      ws1.onclose({ code: 1006, reason: 'Connection lost' });
      await jest.advanceTimersByTimeAsync(5000);

      // Old ws is now CLOSED (readyState=3) and has been replaced by a new
      // one. The transport's original onmessage handler is still wired on
      // ws1, but it checks readyState === 1 before forwarding; a buffered
      // frame pretending to carry an empty TestSystem (which would prune
      // AliveChild if processed) must therefore be ignored.
      ws1.simulateMessage(createSystemStructureResponse('TestSystem'));
      await jest.advanceTimersByTimeAsync(10);

      let aliveStillThere = false;
      app.root().forEachChildImmediate(function(c) {
        if (c.name() === 'AliveChild') aliveStillThere = true;
      });
      expect(aliveStillThere).toBe(true);

      app.close();
    } finally {
      global.WebSocket = originalWebSocket;
      jest.useRealTimers();
    }
  });

  test('onerror without onclose: real containers during backoff are processed', async () => {
    jest.useFakeTimers();
    const originalWebSocket = global.WebSocket;
    const { MockWebSocket, instances } = createMockWebSocketFactory();
    global.WebSocket = MockWebSocket;
    try {
      const app = new internal.AppConnection('ws://127.0.0.1:7689', null, true);
      const ws = instances[0];
      await jest.advanceTimersByTimeAsync(10);
      ws.simulateMessage(createHelloMessage({ compatVersion: 4 }));
      await jest.advanceTimersByTimeAsync(10);
      ws.simulateMessage(createSystemStructureResponse('TestSystem'));
      await jest.advanceTimersByTimeAsync(10);

      // Node's ws library can fire 'error' without 'close' following.
      // onError schedules a reconnect, but the socket stays OPEN
      // (readyState=1). A real container arriving in the backoff window
      // must still be processed — the earlier drop-guard that keyed off
      // reconnectTimeoutId discarded these silently and was the
      // regression this test locks down.
      ws.onerror({ data: 'transient' });
      expect(ws.readyState).toBe(1);

      ws.simulateMessage(createSystemStructureResponse('TestSystem', [
        { nodeId: 555, name: 'LateArrival', isLocal: true,
          nodeType: CDPNodeType.CDP_APPLICATION }
      ]));
      await jest.advanceTimersByTimeAsync(10);

      let seen = false;
      app.root().forEachChildImmediate(function(c) {
        if (c.name() === 'LateArrival') seen = true;
      });
      expect(seen).toBe(true);

      app.close();
    } finally {
      global.WebSocket = originalWebSocket;
      jest.useRealTimers();
    }
  });

  test('overlapping structure fetches: late error for old requestId does not reject newer fetch waiter', async () => {
    const { app, ws, teardown } = await openConnection(4);
    try {
      // Walk to an application child so we have a non-root node to fetch
      // overlapping structures on.
      ws.simulateMessage(createSystemStructureResponse('TestSystem', [
        { nodeId: 77, name: 'ChildNode', isLocal: true,
          nodeType: CDPNodeType.CDP_APPLICATION }
      ]));
      await jest.advanceTimersByTimeAsync(10);

      let child = null;
      app.root().forEachChild(function(c) { if (c.name() === 'ChildNode') child = c; });
      expect(child).not.toBeNull();

      // First fetch — records requestId in pendingRequests.
      child.async.fetch();
      await jest.advanceTimersByTimeAsync(10);
      const firstReq = ws.getAllSentContainers()
        .filter(c => c.messageType === ContainerType.eStructureRequest)
        .pop();
      const oldReqId = firstReq.requestIds[0];
      expect(oldReqId).toBeGreaterThan(0);

      // Second fetch on the same node — attachRequestId must drop the old
      // pending structure entry so a late error for oldReqId cannot match.
      child.async.fetch();
      await jest.advanceTimersByTimeAsync(10);
      const secondReq = ws.getAllSentContainers()
        .filter(c => c.messageType === ContainerType.eStructureRequest)
        .pop();
      const newReqId = secondReq.requestIds[0];
      expect(newReqId).toBeGreaterThan(oldReqId);

      // Waiter for the *newer* fetch.
      let waiterResolved = false;
      let waiterRejected = false;
      child.async.onDone(
        function() { waiterResolved = true; },
        function() { waiterRejected = true; },
        child
      );

      // Server returns an error for the superseded requestId. The old
      // behavior walked entry.node.rejectPendingFetches() which wiped the
      // newer waiter along with the old; the fix clears the old pending
      // entry on fetch2 so this error finds no match and the newer waiter
      // stays armed.
      ws.simulateMessage(protocol.Container.encode(protocol.Container.create({
        messageType: ContainerType.eRemoteError,
        error: { code: protocol.RemoteErrorCode.eINTERNAL_ERROR, text: 'old fetch failed' },
        requestIds: [oldReqId]
      })).finish());
      await jest.advanceTimersByTimeAsync(10);

      expect(waiterRejected).toBe(false);
      expect(waiterResolved).toBe(false);
    } finally { teardown(); }
  });

  test('pre-Hello queued requests are flushed WITH request_ids (builder runs after Hello sets currentMetadata)', async () => {
    // Adversarial-review finding (Codex pass 2): if send() stored encoded
    // bytes, any make*Request called BEFORE Hello would be built WITHOUT a
    // request_id (currentMetadata is null → attachRequestId early-returns),
    // then flushRequests later replays those untagged bytes even on compat≥3.
    // The fix stores builder functions that run at flush time, when
    // currentMetadata IS set and attachRequestId can tag the message.
    jest.useFakeTimers();
    const originalWebSocket = global.WebSocket;
    const { MockWebSocket, instances } = createMockWebSocketFactory();
    global.WebSocket = MockWebSocket;
    try {
      const app = new internal.AppConnection('ws://127.0.0.1:7689', null, false);
      const ws = instances[0];
      // Force readyState to CONNECTING so send() queues instead of flushing.
      ws.readyState = 0;

      // User calls fetch() BEFORE Hello arrives. With the old bytes-queue
      // this produced untagged bytes in the queue.
      app.root().async.fetch();

      // Restore OPEN, deliver Hello (sets currentMetadata), then deliver
      // the first structure response — which triggers
      // handleIncomingContainer → flushRequests. That flush is where the
      // queued builder must run: if it ran at queue-time (counterfactual),
      // the structure request would be untagged; if it runs now, tagged.
      ws.readyState = 1;
      ws.simulateMessage(createHelloMessage({ compatVersion: 4 }));
      await jest.advanceTimersByTimeAsync(10);
      ws.sent = []; // isolate flushed bytes from HelloHandler's own sends
      ws.simulateMessage(createSystemStructureResponse('TestSystem'));
      await jest.advanceTimersByTimeAsync(10);

      const flushedStructureReqs = ws.sent.map(b => protocol.Container.decode(b))
        .filter(c => c.messageType === ContainerType.eStructureRequest);
      // The queued fetch() produces a structure request that flushes after
      // the first post-Hello container. On compat 4 it MUST carry a
      // non-zero request_id.
      expect(flushedStructureReqs.length).toBeGreaterThan(0);
      for (const req of flushedStructureReqs) {
        expect(req.requestIds.length).toBeGreaterThan(0);
        expect(req.requestIds[0]).toBeGreaterThan(0);
      }

      app.close();
    } finally {
      global.WebSocket = originalWebSocket;
      jest.useRealTimers();
    }
  });

  test('overlapping structure fetches: late STALE success response for old requestId does not resolve newer fetch waiter with old tree', async () => {
    // Adversarial-review finding: without guarding parseStructureResponse
    // on the active pending request_id, an out-of-order success response
    // for a superseded fetch would call node.done() and resolve the
    // newer fetch's onDone waiters against the stale tree. The fix gates
    // parseStructureResponse on pendingRequests.has(requestIds[i]);
    // stale responses are dropped.
    const { app, ws, teardown } = await openConnection(4);
    try {
      ws.simulateMessage(createSystemStructureResponse('TestSystem', [
        { nodeId: 88, name: 'ChildNode', isLocal: true,
          nodeType: CDPNodeType.CDP_APPLICATION }
      ]));
      await jest.advanceTimersByTimeAsync(10);

      let child = null;
      app.root().forEachChild(function(c) { if (c.name() === 'ChildNode') child = c; });
      expect(child).not.toBeNull();

      // fetch1 → reqId_A; fetch2 → reqId_B. attachRequestId drops reqId_A
      // from pendingRequests so reqId_B alone is tracked.
      child.async.fetch();
      await jest.advanceTimersByTimeAsync(10);
      const firstReq = ws.getAllSentContainers()
        .filter(c => c.messageType === ContainerType.eStructureRequest)
        .pop();
      const oldReqId = firstReq.requestIds[0];

      child.async.fetch();
      await jest.advanceTimersByTimeAsync(10);

      // Waiter on the NEWER fetch.
      let waiterResolved = false;
      let waiterRejected = false;
      child.async.onDone(
        function() { waiterResolved = true; },
        function() { waiterRejected = true; },
        child
      );

      // Server (misbehaving / out-of-order) sends an eStructureResponse
      // carrying the SUPERSEDED oldReqId. Without the stale-response
      // guard, parseStructureResponse would call node.done() and resolve
      // the newer waiter against whatever tree the old response encoded.
      ws.simulateMessage(protocol.Container.encode(protocol.Container.create({
        messageType: ContainerType.eStructureResponse,
        structureResponse: [{
          info: { nodeId: 88, name: 'ChildNode', nodeType: CDPNodeType.CDP_APPLICATION, isLocal: true },
          node: []
        }],
        requestIds: [oldReqId]
      })).finish());
      await jest.advanceTimersByTimeAsync(10);

      // The waiter MUST still be pending — the stale response must have
      // been dropped before node.done() was called.
      expect(waiterResolved).toBe(false);
      expect(waiterRejected).toBe(false);
    } finally { teardown(); }
  });

  test('successful getter subscribe confirmation clears pendingRequests entry', async () => {
    const { app, ws, teardown } = await openConnection(4);
    try {
      app.root().async.subscribeToValues(jest.fn(), 5, 0);
      await jest.advanceTimersByTimeAsync(10);
      const getterReq = ws.getAllSentContainers()
        .find(c => c.messageType === ContainerType.eGetterRequest);
      const reqId = getterReq.requestIds[0];
      expect(reqId).toBeGreaterThan(0);

      // Server's first-value confirmation echoes the subscribe's request_id.
      // The entry should be retired now — the id is single-use on the wire
      // per GetterService, and leaking entries risks misrouting when the
      // uint32 counter wraps around. createGetterResponse doesn't attach
      // requestIds, so build the confirmation manually:
      ws.simulateMessage(protocol.Container.encode(protocol.Container.create({
        messageType: ContainerType.eGetterResponse,
        getterResponse: [{ nodeId: protocol.SYSTEM_NODE_ID, dValue: 1.5, timestamp: 1 }],
        requestIds: [reqId]
      })).finish());
      await jest.advanceTimersByTimeAsync(10);

      // Probe: if the entry was cleared, a subsequent error with the same
      // request_id should hit the "no match" log branch, NOT the
      // per-entry "type=getter" log.
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      ws.simulateMessage(protocol.Container.encode(protocol.Container.create({
        messageType: ContainerType.eRemoteError,
        error: { code: protocol.RemoteErrorCode.eNODE_NOT_FOUND, text: 'stale' },
        requestIds: [reqId]
      })).finish());
      await jest.advanceTimersByTimeAsync(10);

      const typeGetterLogged = logSpy.mock.calls.some(c =>
        typeof c[0] === 'string' && /Request failed:.*type=getter/.test(c[0])
      );
      expect(typeGetterLogged).toBe(false);
      logSpy.mockRestore();
    } finally { teardown(); }
  });

  // Non-happy-path coverage for the resilience contract: out-of-order
  // delivery, partial drops, interleaved success/error, stale supersession,
  // late errors, requestId=0 placeholder, and AUTH_RESPONSE_EXPIRED's
  // connection-wide rejection. Each verifies a path that would route wrong
  // (or crash) without the per-request requestId echo or its consumers.

  function findStructureRequest(ws, fromIdx, nodeId) {
    return ws.sent.slice(fromIdx)
      .map(buf => protocol.Container.decode(buf))
      .find(c => c.messageType === ContainerType.eStructureRequest
              && c.structureRequest.includes(nodeId));
  }

  function makeStructureResponse(nodeId, name, requestId) {
    return protocol.Container.encode(protocol.Container.create({
      messageType: ContainerType.eStructureResponse,
      structureResponse: [{
        info: { nodeId: nodeId, name: name,
                nodeType: CDPNodeType.CDP_APPLICATION },
        node: []
      }],
      requestIds: [requestId]
    })).finish();
  }

  function makeError(reqId, code, text) {
    return protocol.Container.encode(protocol.Container.create({
      messageType: ContainerType.eRemoteError,
      error: { code: code, text: text },
      requestIds: [reqId]
    })).finish();
  }

  test('error for one fetch does NOT reject another concurrent fetch on a different node', async () => {
    const { app, ws, teardown } = await openConnection(4);
    try {
      const idA = 3030, idB = 4040;
      ws.simulateMessage(createSystemStructureResponse('Sys', [
        { nodeId: idA, name: 'NodeA', isLocal: true,
          nodeType: CDPNodeType.CDP_APPLICATION },
        { nodeId: idB, name: 'NodeB', isLocal: true,
          nodeType: CDPNodeType.CDP_APPLICATION }
      ]));
      await jest.advanceTimersByTimeAsync(10);

      let nodeA = null, nodeB = null;
      app.root().forEachChild(function(c) {
        if (c.name() === 'NodeA') nodeA = c;
        if (c.name() === 'NodeB') nodeB = c;
      });

      const fromIdx = ws.sent.length;
      nodeA.async.fetch();
      nodeB.async.fetch();
      await jest.advanceTimersByTimeAsync(10);
      const reqA = findStructureRequest(ws, fromIdx, idA).requestIds[0];
      const reqB = findStructureRequest(ws, fromIdx, idB).requestIds[0];

      let aResolved = false, bResolved = false;
      let aRejected = false, bRejected = false;
      nodeA.async.onDone(() => { aResolved = true; }, () => { aRejected = true; }, nodeA);
      nodeB.async.onDone(() => { bResolved = true; }, () => { bRejected = true; }, nodeB);

      ws.simulateMessage(makeError(reqA, protocol.RemoteErrorCode.eNODE_NOT_FOUND, 'A failed'));
      await jest.advanceTimersByTimeAsync(10);
      expect(aRejected).toBe(true);
      expect(bResolved).toBe(false);
      expect(bRejected).toBe(false);

      ws.simulateMessage(makeStructureResponse(idB, 'NodeB', reqB));
      await jest.advanceTimersByTimeAsync(10);
      expect(bResolved).toBe(true);
      expect(bRejected).toBe(false);
    } finally { teardown(); }
  });

  test('partial drop: B succeeds; A never gets a response; only A times out at 30s', async () => {
    const { app, ws, teardown } = await openConnection(4);
    try {
      const idA = 6001, idB = 6002;
      ws.simulateMessage(createSystemStructureResponse('Sys', [
        { nodeId: idA, name: 'NodeA', isLocal: true,
          nodeType: CDPNodeType.CDP_APPLICATION },
        { nodeId: idB, name: 'NodeB', isLocal: true,
          nodeType: CDPNodeType.CDP_APPLICATION }
      ]));
      await jest.advanceTimersByTimeAsync(10);

      let nodeA = null, nodeB = null;
      app.root().forEachChild(function(c) {
        if (c.name() === 'NodeA') nodeA = c;
        if (c.name() === 'NodeB') nodeB = c;
      });

      const fromIdx = ws.sent.length;
      nodeA.async.fetch();
      nodeB.async.fetch();
      await jest.advanceTimersByTimeAsync(10);
      const reqB = findStructureRequest(ws, fromIdx, idB).requestIds[0];

      let aResolved = false, bResolved = false;
      let aRejected = false, bRejected = false;
      nodeA.async.onDone(() => { aResolved = true; }, () => { aRejected = true; }, nodeA);
      nodeB.async.onDone(() => { bResolved = true; }, () => { bRejected = true; }, nodeB);

      ws.simulateMessage(makeStructureResponse(idB, 'NodeB', reqB));
      await jest.advanceTimersByTimeAsync(10);
      expect(bResolved).toBe(true);
      expect(aResolved).toBe(false);
      expect(aRejected).toBe(false);

      // Advance past STRUCTURE_REQUEST_TIMEOUT_MS (30s).
      await jest.advanceTimersByTimeAsync(31000);
      expect(aRejected).toBe(true);
      expect(aResolved).toBe(false);
    } finally { teardown(); }
  });

  test('late error after fetch already succeeded falls through generic log; node stays valid', async () => {
    const { app, ws, teardown } = await openConnection(4);
    try {
      const idA = 7001;
      ws.simulateMessage(createSystemStructureResponse('Sys', [
        { nodeId: idA, name: 'NodeA', isLocal: true,
          nodeType: CDPNodeType.CDP_APPLICATION }
      ]));
      await jest.advanceTimersByTimeAsync(10);

      let nodeA = null;
      app.root().forEachChild(function(c) {
        if (c.name() === 'NodeA') nodeA = c;
      });

      const fromIdx = ws.sent.length;
      nodeA.async.fetch();
      await jest.advanceTimersByTimeAsync(10);
      const reqA = findStructureRequest(ws, fromIdx, idA).requestIds[0];

      // First success clears the pending entry.
      ws.simulateMessage(makeStructureResponse(idA, 'NodeA', reqA));
      await jest.advanceTimersByTimeAsync(10);
      expect(nodeA.isValid()).toBe(true);

      // Late error for the same reqId. pendingRequests no longer has the
      // entry, so parseErrorResponse must log via the generic path —
      // NOT "Request failed: type=structure …" — and must NOT call
      // rejectPendingFetches on the node.
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      ws.simulateMessage(makeError(reqA, protocol.RemoteErrorCode.eNODE_NOT_FOUND, 'late'));
      await jest.advanceTimersByTimeAsync(10);

      const typeStructureLogged = logSpy.mock.calls.some(c =>
        typeof c[0] === 'string' && /Request failed:.*type=structure/.test(c[0])
      );
      const genericLogged = logSpy.mock.calls.some(c =>
        typeof c[0] === 'string' && /Received error response with code/.test(c[0])
      );
      expect(typeStructureLogged).toBe(false);
      expect(genericLogged).toBe(true);
      expect(nodeA.isValid()).toBe(true);
      logSpy.mockRestore();
    } finally { teardown(); }
  });

  test('late structure response after onDone timeout does not mutate the tree', async () => {
    // Regression for the lifecycle gap that the PR's onDone-timeout cleanup
    // closes: pendingRequests.set runs at make*Request time, and the 30s
    // timeout used to reject the user without clearing the entry. A response
    // arriving at 31s would still pass parseStructureResponse's stale-success
    // guard (entry still present) and call node.done() — the user has already
    // seen the rejection and moved on, but the tree silently mutates.
    // Counterfactual: remove the `app.dropPendingStructureForNode(id)` call
    // in the onDone timeout body and the assertion below flips: the late
    // response would set structureFetched=true.
    const { app, ws, teardown } = await openConnection(4);
    try {
      const idA = 6101;
      ws.simulateMessage(createSystemStructureResponse('Sys', [
        { nodeId: idA, name: 'NodeA', isLocal: true,
          nodeType: CDPNodeType.CDP_APPLICATION }
      ]));
      await jest.advanceTimersByTimeAsync(10);

      let nodeA = null;
      app.root().forEachChild(function(c) {
        if (c.name() === 'NodeA') nodeA = c;
      });

      const fromIdx = ws.sent.length;
      nodeA.async.fetch();
      await jest.advanceTimersByTimeAsync(10);
      const reqA = findStructureRequest(ws, fromIdx, idA).requestIds[0];

      let aResolved = false, aRejected = false;
      nodeA.async.onDone(() => { aResolved = true; }, () => { aRejected = true; }, nodeA);

      // No response. Drive through the 30s timeout — user's onDone rejects.
      await jest.advanceTimersByTimeAsync(31000);
      expect(aRejected).toBe(true);
      expect(aResolved).toBe(false);
      expect(nodeA.isStructureFetched()).toBe(false);

      // Late response arrives now. It must be silently absorbed (the pending
      // entry was dropped on timeout, so the stale-success guard skips this).
      ws.simulateMessage(makeStructureResponse(idA, 'NodeA', reqA));
      await jest.advanceTimersByTimeAsync(10);

      // structureFetched must still be false — the tree must not mutate.
      expect(nodeA.isStructureFetched()).toBe(false);
      expect(aResolved).toBe(false);
    } finally { teardown(); }
  });

  test('empty event keepalive resets per-subscription liveness clock', async () => {
    // Regression for the PR's _noteEventKeepalive hook in parseEventResponse.
    // The server resends an empty event (id=0, no sender, ts=0, no data) on
    // inactivity_resend_interval for event subscriptions whose last sent
    // event is still the confirmation. Without _noteEventKeepalive, the
    // liveness monitor would falsely fire after 135s on a quiet but healthy
    // subscription.
    // Counterfactual: replace _noteEventKeepalive() with an empty body (just
    // `continue`) and the assertion `expect(requests.length).toBe(0)` flips —
    // a stray resubscribe getter+event request appears at the 150s tick.
    const { app, ws, teardown } = await openConnection(4);
    try {
      const idA = 30005;
      ws.simulateMessage(createSystemStructureResponse('Sys', [
        { nodeId: idA, name: 'NodeA', isLocal: true,
          nodeType: CDPNodeType.CDP_APPLICATION,
          valueType: CDPValueType.eDOUBLE }
      ]));
      await jest.advanceTimersByTimeAsync(10);

      let nodeA = null;
      app.root().forEachChild(function(c) {
        if (c.name() === 'NodeA') nodeA = c;
      });

      const eventCb = jest.fn();
      nodeA.async.subscribeToEvents(eventCb);
      await jest.advanceTimersByTimeAsync(10);

      // Advance close to the 135s threshold without a real event.
      await jest.advanceTimersByTimeAsync(120000);

      // Server sends the inactivity-keepalive empty event.
      ws.simulateMessage(protocol.Container.encode(protocol.Container.create({
        messageType: ContainerType.eEventResponse,
        eventResponse: [{
          nodeId: [idA],
          id: 0,
          sender: '',
          code: 0,
          status: 0,
          timestamp: 0,
        }]
      })).finish());
      await jest.advanceTimersByTimeAsync(10);
      // User callback must not have fired (empty keepalive is filtered).
      expect(eventCb).not.toHaveBeenCalled();

      // Snapshot wire traffic before the advance that would otherwise trip
      // the resubscribe — the keepalive must have moved lastEventActivityMs
      // forward, so the next 150s tick should NOT cross the threshold.
      const fromIdx = ws.sent.length;
      // 130s further (total 250s since subscribe, 130s since keepalive).
      // Without the keepalive reset: 250s > 135s → resub fires.
      // With the keepalive reset: 130s < 135s → no resub.
      await jest.advanceTimersByTimeAsync(130000);

      const requests = ws.sent.slice(fromIdx)
        .map(buf => protocol.Container.decode(buf))
        .filter(c => c.messageType === ContainerType.eEventRequest
                  || c.messageType === ContainerType.eGetterRequest);
      expect(requests.length).toBe(0);
    } finally { teardown(); }
  });

  test('AUTH_RESPONSE_EXPIRED with NO requestId field rejects ALL pending structure waiters', async () => {
    jest.useFakeTimers();
    const originalWebSocket = global.WebSocket;
    const { MockWebSocket, instances } = createMockWebSocketFactory();
    global.WebSocket = MockWebSocket;
    const notificationListener = {
      credentialsRequested: () => new Promise(() => {})
    };
    const app = new internal.AppConnection('ws://127.0.0.1:7689', notificationListener, false);
    const ws = instances[0];
    await jest.advanceTimersByTimeAsync(10);
    ws.simulateMessage(createHelloMessage({ compatVersion: 4 }));
    await jest.advanceTimersByTimeAsync(10);
    ws.simulateMessage(createSystemStructureResponse('TestSystem'));
    await jest.advanceTimersByTimeAsync(10);
    try {
      const idA = 10001, idB = 10002;
      ws.simulateMessage(createSystemStructureResponse('Sys', [
        { nodeId: idA, name: 'NodeA', isLocal: true,
          nodeType: CDPNodeType.CDP_APPLICATION },
        { nodeId: idB, name: 'NodeB', isLocal: true,
          nodeType: CDPNodeType.CDP_APPLICATION }
      ]));
      await jest.advanceTimersByTimeAsync(10);

      let nodeA = null, nodeB = null;
      app.root().forEachChild(function(c) {
        if (c.name() === 'NodeA') nodeA = c;
        if (c.name() === 'NodeB') nodeB = c;
      });

      nodeA.async.fetch();
      nodeB.async.fetch();
      await jest.advanceTimersByTimeAsync(10);

      let aRejected = false, bRejected = false;
      nodeA.async.onDone(() => {}, () => { aRejected = true; }, nodeA);
      nodeB.async.onDone(() => {}, () => { bRejected = true; }, nodeB);

      // Server's SendAuthenticationExpiredError does NOT add request_ids.
      // Per-id correlation cannot match, so the client must walk all
      // pending entries and reject structure waiters connection-wide.
      const authExpired = protocol.Container.encode(protocol.Container.create({
        messageType: ContainerType.eRemoteError,
        error: {
          code: protocol.RemoteErrorCode.eAUTH_RESPONSE_EXPIRED,
          text: 'Session locked out',
          challenge: new Uint8Array([1, 2, 3])
        }
      })).finish();
      ws.simulateMessage(authExpired);
      await jest.advanceTimersByTimeAsync(10);

      expect(aRejected).toBe(true);
      expect(bRejected).toBe(true);
    } finally {
      global.WebSocket = originalWebSocket;
      jest.useRealTimers();
    }
  });

  test('eSetterRequest → server eGetterResponse with reqId echo clears pending entry', async () => {
    const { app, ws, teardown } = await openConnection(4);
    try {
      const idA = 11001;
      ws.simulateMessage(createSystemStructureResponse('Sys', [
        { nodeId: idA, name: 'NodeA', isLocal: true,
          nodeType: CDPNodeType.CDP_APPLICATION,
          valueType: CDPValueType.eDOUBLE }
      ]));
      await jest.advanceTimersByTimeAsync(10);

      // Send setter — capture the reqId that was attached.
      const fromIdx = ws.sent.length;
      app.makeSetterRequest(idA, CDPValueType.eDOUBLE, 42.5, 1700000000);
      await jest.advanceTimersByTimeAsync(10);
      const setterReq = ws.sent.slice(fromIdx)
        .map(buf => protocol.Container.decode(buf))
        .find(c => c.messageType === ContainerType.eSetterRequest);
      expect(setterReq).toBeDefined();
      expect(setterReq.requestIds.length).toBeGreaterThan(0);
      const setterReqId = setterReq.requestIds[0];
      expect(setterReqId).toBeGreaterThan(0);

      // Server response per spec: eGetterResponse echoing the setter's reqId
      // with the actually-set value. The dispatcher's clearPendingByRequestIds
      // for eGetterResponse must clear the pending entry.
      const setterResponse = protocol.Container.encode(protocol.Container.create({
        messageType: ContainerType.eGetterResponse,
        getterResponse: [{ nodeId: idA, timestamp: 1700000001, dValue: 42.5 }],
        requestIds: [setterReqId]
      })).finish();
      ws.simulateMessage(setterResponse);
      await jest.advanceTimersByTimeAsync(10);

      // Probe: late error for the same reqId. If pending entry was cleared
      // by the success response, the error must fall through to the generic
      // log path (no entry match), NOT log "Request failed: type=setter".
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      ws.simulateMessage(makeError(setterReqId, protocol.RemoteErrorCode.eINTERNAL_ERROR, 'late'));
      await jest.advanceTimersByTimeAsync(10);

      const typeSetterLogged = logSpy.mock.calls.some(c =>
        typeof c[0] === 'string' && /Request failed:.*type=setter/.test(c[0])
      );
      const genericLogged = logSpy.mock.calls.some(c =>
        typeof c[0] === 'string' && /Received error response with code/.test(c[0])
      );
      expect(typeSetterLogged).toBe(false);
      expect(genericLogged).toBe(true);
      logSpy.mockRestore();
    } finally { teardown(); }
  });

  test('multi-response container with stale + fresh requestIds: stale entry is skipped, fresh resolves', async () => {
    const { app, ws, teardown } = await openConnection(4);
    try {
      const idA = 14001, idB = 14002;
      ws.simulateMessage(createSystemStructureResponse('Sys', [
        { nodeId: idA, name: 'NodeA', isLocal: true,
          nodeType: CDPNodeType.CDP_APPLICATION },
        { nodeId: idB, name: 'NodeB', isLocal: true,
          nodeType: CDPNodeType.CDP_APPLICATION }
      ]));
      await jest.advanceTimersByTimeAsync(10);

      let nodeA = null, nodeB = null;
      app.root().forEachChild(function(c) {
        if (c.name() === 'NodeA') nodeA = c;
        if (c.name() === 'NodeB') nodeB = c;
      });

      const fromIdx1 = ws.sent.length;
      nodeA.async.fetch();
      await jest.advanceTimersByTimeAsync(10);
      const staleReq = findStructureRequest(ws, fromIdx1, idA).requestIds[0];

      // Supersede A's first fetch with a second fetch on the same node.
      // attachRequestId's clearPendingByNodeAndType drops the stale entry
      // for staleReq.
      const fromIdx2 = ws.sent.length;
      nodeA.async.fetch();
      await jest.advanceTimersByTimeAsync(10);
      const freshReq = findStructureRequest(ws, fromIdx2, idA).requestIds[0];
      expect(freshReq).not.toBe(staleReq);

      const fromIdx3 = ws.sent.length;
      nodeB.async.fetch();
      await jest.advanceTimersByTimeAsync(10);
      const reqB = findStructureRequest(ws, fromIdx3, idB).requestIds[0];

      let aResolveCount = 0, bResolveCount = 0;
      let aRejected = false, bRejected = false;
      nodeA.async.onDone(() => { aResolveCount++; }, () => { aRejected = true; }, nodeA);
      nodeB.async.onDone(() => { bResolveCount++; }, () => { bRejected = true; }, nodeB);

      // Server bundles BOTH the stale A response AND B's response in one
      // Container, with per-position requestIds. Stale-guard at line 2303
      // must skip the stale A entry (its reqId is no longer in
      // pendingRequests after supersession), while B resolves normally.
      const bundled = protocol.Container.encode(protocol.Container.create({
        messageType: ContainerType.eStructureResponse,
        structureResponse: [
          { info: { nodeId: idA, name: 'NodeA',
                    nodeType: CDPNodeType.CDP_APPLICATION }, node: [] },
          { info: { nodeId: idB, name: 'NodeB',
                    nodeType: CDPNodeType.CDP_APPLICATION }, node: [] }
        ],
        requestIds: [staleReq, reqB]
      })).finish();
      ws.simulateMessage(bundled);
      await jest.advanceTimersByTimeAsync(10);

      // A's stale response was skipped — its waiter is still pending.
      expect(aResolveCount).toBe(0);
      expect(aRejected).toBe(false);
      // B resolved.
      expect(bResolveCount).toBe(1);
      expect(bRejected).toBe(false);

      // Fresh A response (under freshReq) now arrives separately and
      // resolves the still-pending waiter.
      ws.simulateMessage(makeStructureResponse(idA, 'NodeA', freshReq));
      await jest.advanceTimersByTimeAsync(10);
      expect(aResolveCount).toBe(1);
    } finally { teardown(); }
  });

  test('reconnect monotonicity: nextRequestId is NOT reset on cleanup, so old-socket reqIds cannot alias new fetches', async () => {
    const { app, ws, teardown } = await openConnection(4);
    try {
      const idA = 13001;
      ws.simulateMessage(createSystemStructureResponse('Sys', [
        { nodeId: idA, name: 'NodeA', isLocal: true,
          nodeType: CDPNodeType.CDP_APPLICATION }
      ]));
      await jest.advanceTimersByTimeAsync(10);

      let nodeA = null;
      app.root().forEachChild(function(c) {
        if (c.name() === 'NodeA') nodeA = c;
      });

      const fromIdx1 = ws.sent.length;
      nodeA.async.fetch();
      await jest.advanceTimersByTimeAsync(10);
      const oldReq = findStructureRequest(ws, fromIdx1, idA).requestIds[0];

      // Simulate the proxy/tunnel reconnect path: cleanup clears
      // pendingRequests but per the in-code comment must NOT reset
      // nextRequestId — buffered frames from the old session can still
      // arrive via the persistent primary socket. A reset would let them
      // alias newly-issued ids.
      app._triggerReconnect();
      ws.clearSent();
      ws.simulateMessage(createHelloMessage({ compatVersion: 4 }));
      await jest.advanceTimersByTimeAsync(10);
      ws.simulateMessage(createSystemStructureResponse('TestSystem', [
        { nodeId: idA, name: 'NodeA', isLocal: true,
          nodeType: CDPNodeType.CDP_APPLICATION }
      ]));
      await jest.advanceTimersByTimeAsync(10);

      const fromIdx2 = ws.sent.length;
      nodeA.async.fetch();
      await jest.advanceTimersByTimeAsync(10);
      const newReqMsg = findStructureRequest(ws, fromIdx2, idA);
      const newReq = newReqMsg ? newReqMsg.requestIds[0] : undefined;

      // The post-reconnect fetch's reqId must be strictly greater than the
      // pre-reconnect fetch's reqId. Equality would mean the counter reset
      // and a stale frame for oldReq could now match the new fetch's
      // pendingRequests entry, applying old-server data to new-server
      // waiters or rejecting new-server waiters from old-server errors.
      expect(newReq).toBeGreaterThan(oldReq);

      // Stale frame for oldReq lands now: it must NOT match the new
      // fetch's pending entry, NOT resolve the new waiter, NOT reject it.
      let resolved = false, rejected = false;
      nodeA.async.onDone(() => { resolved = true; }, () => { rejected = true; }, nodeA);

      // Synthetic stale success carrying oldReq.
      ws.simulateMessage(makeStructureResponse(idA, 'NodeA', oldReq));
      await jest.advanceTimersByTimeAsync(10);
      expect(resolved).toBe(false);
      expect(rejected).toBe(false);

      // The genuine new response under newReq resolves the waiter.
      ws.simulateMessage(makeStructureResponse(idA, 'NodeA', newReq));
      await jest.advanceTimersByTimeAsync(10);
      expect(resolved).toBe(true);
    } finally { teardown(); }
  });
  // Per-subscription liveness monitoring (mechanism #2 of the wiki —
  // monitor + resubscribe when server-side resends stop arriving).
  // One-shot guard prevents storming if the server stays silent.

  test('value subscription idle past liveness threshold triggers exactly one resubscribe (one-shot)', async () => {
    const { app, ws, teardown } = await openConnection(4);
    try {
      const idA = 30001;
      ws.simulateMessage(createSystemStructureResponse('Sys', [
        { nodeId: idA, name: 'NodeA', isLocal: true,
          nodeType: CDPNodeType.CDP_APPLICATION,
          valueType: CDPValueType.eDOUBLE }
      ]));
      await jest.advanceTimersByTimeAsync(10);

      let nodeA = null;
      app.root().forEachChild(function(c) {
        if (c.name() === 'NodeA') nodeA = c;
      });
      expect(nodeA).not.toBeNull();

      const fromIdx = ws.sent.length;
      nodeA.async.subscribeToValues(() => {}, 5, 0);
      await jest.advanceTimersByTimeAsync(10);

      // Initial subscribe getter request was sent.
      const subscribeReq = ws.sent.slice(fromIdx)
        .map(buf => protocol.Container.decode(buf))
        .find(c => c.messageType === ContainerType.eGetterRequest);
      expect(subscribeReq).toBeDefined();

      // Advance to just past the 150s tick. SUBSCRIPTION_LIVENESS_THRESHOLD_MS
      // is 135s; the 15s stall-check timer fires monitoring at the 150s tick
      // (135s tick has diff exactly 135s, not strictly greater, so it doesn't
      // trigger). Connection-stall at 150s tick: diff = 150s - lastServerMessageTime
      // (~10ms) = 149990ms, not > 150000, so no force-close.
      await jest.advanceTimersByTimeAsync(150100);

      const requestsAfterFirstAdvance = ws.sent.slice(fromIdx)
        .map(buf => protocol.Container.decode(buf))
        .filter(c => c.messageType === ContainerType.eGetterRequest);
      expect(requestsAfterFirstAdvance.length).toBe(2); // initial + 1 resub

      // One-shot: a direct call to _resubscribeValues must NOT fire again
      // until the flag is cleared (by a value arriving or a fresh subscribe).
      const countAfterFirstResub = ws.sent.length;
      nodeA._resubscribeValues();
      await jest.advanceTimersByTimeAsync(1);
      const blockedRequests = ws.sent.slice(countAfterFirstResub)
        .map(buf => protocol.Container.decode(buf))
        .filter(c => c.messageType === ContainerType.eGetterRequest);
      expect(blockedRequests.length).toBe(0);

      // Recovery: deliver a real value response. receiveValue resets the
      // one-shot flag, allowing future resubscribes.
      const valueReq = requestsAfterFirstAdvance[1];
      const valueResponse = protocol.Container.encode(protocol.Container.create({
        messageType: ContainerType.eGetterResponse,
        getterResponse: [{ nodeId: idA, timestamp: 100, dValue: 42.5 }],
        requestIds: valueReq.requestIds
      })).finish();
      const countBeforeRecovery = ws.sent.length;
      ws.simulateMessage(valueResponse);
      await jest.advanceTimersByTimeAsync(10);

      // Now another _resubscribeValues call should fire (flag cleared).
      nodeA._resubscribeValues();
      await jest.advanceTimersByTimeAsync(1);
      const recoveredRequests = ws.sent.slice(countBeforeRecovery)
        .map(buf => protocol.Container.decode(buf))
        .filter(c => c.messageType === ContainerType.eGetterRequest);
      expect(recoveredRequests.length).toBe(1);
    } finally { teardown(); }
  });

  test('compat <3 disables liveness monitoring (would false-positive on legacy server)', async () => {
    const { app, ws, teardown } = await openConnection(2);
    try {
      const idA = 30002;
      ws.simulateMessage(createSystemStructureResponse('Sys', [
        { nodeId: idA, name: 'NodeA', isLocal: true,
          nodeType: CDPNodeType.CDP_APPLICATION,
          valueType: CDPValueType.eDOUBLE }
      ]));
      await jest.advanceTimersByTimeAsync(10);

      let nodeA = null;
      app.root().forEachChild(function(c) {
        if (c.name() === 'NodeA') nodeA = c;
      });

      const fromIdx = ws.sent.length;
      nodeA.async.subscribeToValues(() => {}, 5, 0);
      await jest.advanceTimersByTimeAsync(10);

      // Refresh lastServerMessageTime periodically with eCurrentTimeResponse
      // (a no-op in the dispatcher beyond the lastServerMessageTime update,
      // unlike a structure response which would trigger node.update() and
      // re-issue the subscription, polluting the request count).
      const noop = protocol.Container.encode(protocol.Container.create({
        messageType: ContainerType.eCurrentTimeResponse
      })).finish();
      for (var i = 0; i < 5; i++) {
        await jest.advanceTimersByTimeAsync(40000);
        ws.simulateMessage(noop);
      }
      // Total advanced ~200s with periodic refreshes. Subscription monitor
      // would fire at any post-150s tick if compat<3 monitoring weren't
      // gated — assertion below proves the gate works.

      const requests = ws.sent.slice(fromIdx)
        .map(buf => protocol.Container.decode(buf))
        .filter(c => c.messageType === ContainerType.eGetterRequest);
      // Exactly 1: the initial subscribe. No monitor-driven resubscribe.
      expect(requests.length).toBe(1);
    } finally { teardown(); }
  });

  test('event subscription idle past liveness threshold triggers resubscribe (separate channel from values)', async () => {
    const { app, ws, teardown } = await openConnection(4);
    try {
      const idA = 30003;
      ws.simulateMessage(createSystemStructureResponse('Sys', [
        { nodeId: idA, name: 'NodeA', isLocal: true,
          nodeType: CDPNodeType.CDP_APPLICATION }
      ]));
      await jest.advanceTimersByTimeAsync(10);

      let nodeA = null;
      app.root().forEachChild(function(c) {
        if (c.name() === 'NodeA') nodeA = c;
      });

      const fromIdx = ws.sent.length;
      nodeA.async.subscribeToEvents(() => {}, 0);
      await jest.advanceTimersByTimeAsync(10);

      const subscribeReq = ws.sent.slice(fromIdx)
        .map(buf => protocol.Container.decode(buf))
        .find(c => c.messageType === ContainerType.eEventRequest);
      expect(subscribeReq).toBeDefined();

      await jest.advanceTimersByTimeAsync(150100);

      const requests = ws.sent.slice(fromIdx)
        .map(buf => protocol.Container.decode(buf))
        .filter(c => c.messageType === ContainerType.eEventRequest);
      expect(requests.length).toBe(2); // initial + 1 resub
    } finally { teardown(); }
  });
});

describe('Node State Management', () => {
  test('root node should start as valid', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);
    const systemNode = app.root();

    expect(systemNode.isValid()).toBe(true);
  });

  test('root node should have id 0 (SYSTEM_NODE_ID)', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);
    const systemNode = app.root();

    expect(systemNode.id()).toBe(0);
  });

  test('root node structure should not be fetched initially', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);
    const systemNode = app.root();

    expect(systemNode.isStructureFetched()).toBe(false);
  });

  test('fetch should send structure request', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);
    const systemNode = app.root();

    systemNode.async.fetch();

    expect(transport.sent.length).toBe(1);
    const container = transport.getLastSentContainer();
    expect(container.messageType).toBe(ContainerType.eStructureRequest);
  });
});

describe('Handler Message Queue', () => {
  test('should process messages in order', async () => {
    const socket = new FakeSocket();
    const handler = new protocol.Handler(socket, null);
    const receivedContainers = [];

    handler.onContainer = (container) => {
      receivedContainers.push(container);
    };

    // Send Hello first
    handler.handle(createHelloMessage({ compatVersion: 4 }));

    // Send multiple messages quickly
    handler.handle(createServicesNotification([createStudioApiServiceInfo(1, 'App1')]));
    handler.handle(createServicesNotification([createStudioApiServiceInfo(2, 'App2')]));

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 50));

    // Should have received both in order
    expect(receivedContainers.length).toBe(2);
    expect(receivedContainers[0].servicesNotification.services[0].name).toBe('App1');
    expect(receivedContainers[1].servicesNotification.services[0].name).toBe('App2');
  });
});

describe('supportsProxyProtocol after Hello', () => {
  test('should return true after receiving compat >= 4', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);

    // Before any messages, should be false
    expect(app.supportsProxyProtocol()).toBeFalsy();

    // Simulate receiving services notification which sets metadata
    app.onServicesReceived([createStudioApiServiceInfo(1, 'App1')], { compatVersion: 4 });

    expect(app.supportsProxyProtocol()).toBe(true);
  });

  test('should return false for compat < 4', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);

    app.onServicesReceived([createStudioApiServiceInfo(1, 'App1')], { compatVersion: 3 });

    expect(app.supportsProxyProtocol()).toBe(false);
  });
});

describe('Value Edge Cases', () => {
  test('should handle zero values correctly', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);

    // Zero should be a valid value to set
    app.makeSetterRequest(123, CDPValueType.eDOUBLE, 0, Date.now() / 1000);

    expect(transport.sent.length).toBe(1);
    const container = transport.getLastSentContainer();
    expect(container.setterRequest[0].dValue).toBe(0);
  });

  test('should handle negative values correctly', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);

    app.makeSetterRequest(123, CDPValueType.eDOUBLE, -42.5, Date.now() / 1000);

    expect(transport.sent.length).toBe(1);
    const container = transport.getLastSentContainer();
    expect(container.setterRequest[0].dValue).toBeCloseTo(-42.5);
  });

  test('should handle very large values', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);

    app.makeSetterRequest(123, CDPValueType.eDOUBLE, 1e308, Date.now() / 1000);

    expect(transport.sent.length).toBe(1);
    const container = transport.getLastSentContainer();
    expect(container.setterRequest[0].dValue).toBe(1e308);
  });

  test('should handle empty string value', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);

    app.makeSetterRequest(123, CDPValueType.eSTRING, '', Date.now() / 1000);

    expect(transport.sent.length).toBe(1);
    const container = transport.getLastSentContainer();
    expect(container.setterRequest[0].strValue).toBe('');
  });
});

describe('Protocol createServicesRequestBytes', () => {
  test('should create valid ServicesRequest container', () => {
    const bytes = protocol.createServicesRequestBytes();

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);

    // Decode and verify
    const container = protocol.Container.decode(bytes);
    expect(container.messageType).toBe(ContainerType.eServicesRequest);
    expect(container.servicesRequest.subscribe).toBe(true);
    expect(container.servicesRequest.inactivityResendInterval).toBe(120);
  });
});
