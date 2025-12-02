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
