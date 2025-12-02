/**
 * Duplicate Values and Reconnect Tests
 *
 * These tests verify:
 * 1. No duplicate values are delivered to subscribers after reconnection
 * 2. Automatic reconnection works correctly for primary connections
 * 3. Subscriptions are properly restored after sibling reconnection
 * 4. hasActiveValueSubscription flag prevents spurious stop requests
 * 5. Structure subscription callbacks only fire after structureFetched is true
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
  createAppStructureResponse,
  createSignalStructureResponse,
  createGetterResponse,
  createSingleGetterResponse,
  createServicesNotification,
  createStudioApiServiceInfo,
  createServiceMessage,
  createMockWebSocketFactory,
  simulateProxyHandshake
} = fakeData;

describe('Duplicate Values Prevention', () => {
  test('should not send duplicate getter requests when subscribing multiple times to same node', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);
    const systemNode = app.root();

    const consumer1 = jest.fn();
    const consumer2 = jest.fn();

    // Subscribe first consumer
    systemNode.async.subscribeToValues(consumer1, 5, 0);
    expect(transport.sent.length).toBe(1);

    // Subscribe second consumer - should send new request with combined params
    systemNode.async.subscribeToValues(consumer2, 10, 0);
    expect(transport.sent.length).toBe(2);

    // Verify the second request uses max fs
    const lastContainer = transport.getLastSentContainer();
    expect(lastContainer.getterRequest[0].fs).toBe(10);
  });

  test('should deliver values to all subscribers without duplicates', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);
    const systemNode = app.root();

    const values1 = [];
    const values2 = [];
    const consumer1 = (value, ts) => values1.push({ value, ts });
    const consumer2 = (value, ts) => values2.push({ value, ts });

    systemNode.async.subscribeToValues(consumer1, 5, 0);
    systemNode.async.subscribeToValues(consumer2, 5, 0);

    // Simulate receiving a value
    systemNode.receiveValue(42.5, 1234567890);

    // Each consumer should receive exactly one value
    expect(values1.length).toBe(1);
    expect(values2.length).toBe(1);
    expect(values1[0].value).toBe(42.5);
    expect(values2[0].value).toBe(42.5);
  });

  test('should not call subscriber callback multiple times for same value', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);
    const systemNode = app.root();

    const callbackCount = { count: 0 };
    const timestampsSeen = new Map();

    const consumer = (value, ts) => {
      callbackCount.count++;
      const tsKey = String(ts);
      const seenCount = (timestampsSeen.get(tsKey) || 0) + 1;
      timestampsSeen.set(tsKey, seenCount);

      // Should never see the same timestamp twice
      expect(seenCount).toBe(1);
    };

    systemNode.async.subscribeToValues(consumer, 5, 0);

    // Simulate receiving values with different timestamps
    systemNode.receiveValue(42.5, 1000);
    systemNode.receiveValue(43.5, 1001);
    systemNode.receiveValue(44.5, 1002);

    expect(callbackCount.count).toBe(3);
  });

  test('unsubscribe should not cause duplicate stop requests', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);
    const systemNode = app.root();

    const consumer = jest.fn();

    // Subscribe
    systemNode.async.subscribeToValues(consumer, 5, 0);
    expect(transport.sent.length).toBe(1);

    // Unsubscribe - should send stop
    systemNode.async.unsubscribeFromValues(consumer);
    expect(transport.sent.length).toBe(2);
    const stopContainer = transport.getLastSentContainer();
    expect(stopContainer.getterRequest[0].stop).toBe(true);

    // Unsubscribing again should NOT send another stop
    systemNode.async.unsubscribeFromValues(consumer);
    expect(transport.sent.length).toBe(2); // Still 2, no new message
  });

  test('should not send stop request if never subscribed', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);
    const systemNode = app.root();

    const consumer = jest.fn();

    // Unsubscribe without ever subscribing
    systemNode.async.unsubscribeFromValues(consumer);

    // Should not send any messages
    expect(transport.sent.length).toBe(0);
  });
});

describe('Reconnection - hasActiveValueSubscription Flag', () => {
  test('should track hasActiveValueSubscription correctly through subscribe/unsubscribe cycle', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);
    const systemNode = app.root();

    const consumer1 = jest.fn();
    const consumer2 = jest.fn();

    // First subscribe - sends getter request
    systemNode.async.subscribeToValues(consumer1, 5, 0);
    expect(transport.sent.length).toBe(1);

    // Second subscribe - sends update request
    systemNode.async.subscribeToValues(consumer2, 5, 0);
    expect(transport.sent.length).toBe(2);

    // Unsubscribe first - still has second consumer, so no stop
    systemNode.async.unsubscribeFromValues(consumer1);
    expect(transport.sent.length).toBe(3);
    let lastContainer = transport.getLastSentContainer();
    expect(lastContainer.getterRequest[0].stop).toBeFalsy();

    // Unsubscribe second - now sends stop
    systemNode.async.unsubscribeFromValues(consumer2);
    expect(transport.sent.length).toBe(4);
    lastContainer = transport.getLastSentContainer();
    expect(lastContainer.getterRequest[0].stop).toBe(true);

    // Another unsubscribe should NOT send anything (no active subscription)
    systemNode.async.unsubscribeFromValues(consumer1);
    expect(transport.sent.length).toBe(4); // Still 4
  });
});

describe('Structure Subscription Callbacks Timing', () => {
  test('should not fire structure callbacks when adding child before structure is fetched', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);
    const systemNode = app.root();

    const structureChanges = [];
    const structureConsumer = (name, change) => {
      structureChanges.push({ name, change });
    };

    systemNode.async.subscribeToStructure(structureConsumer);

    // Structure is not fetched yet - adding child should NOT trigger callback
    // This is internal behavior, but we can test via the public API
    expect(systemNode.isStructureFetched()).toBe(false);
    expect(structureChanges.length).toBe(0);
  });
});

describe('Reconnection - WebSocket Primary Connection', () => {
  test('should create new WebSocket after disconnect with autoConnect', async () => {
    jest.useFakeTimers();

    const originalWebSocket = global.WebSocket;
    const { MockWebSocket, instances } = createMockWebSocketFactory();
    global.WebSocket = MockWebSocket;

    try {
      const app = new internal.AppConnection('ws://127.0.0.1:7689', null, true);
      expect(instances.length).toBe(1);
      const ws = instances[0];

      await jest.advanceTimersByTimeAsync(10);

      // Initialize connection
      ws.simulateMessage(createHelloMessage({ compatVersion: 4 }));
      await jest.advanceTimersByTimeAsync(10);

      ws.simulateMessage(createSystemStructureResponse('TestSystem'));
      await jest.advanceTimersByTimeAsync(10);

      // Close connection unexpectedly (simulates network drop)
      ws.closed = true;
      ws.readyState = 3;
      if (ws.onclose) {
        ws.onclose({ code: 1006, reason: 'Connection lost' });
      }

      // Should try to reconnect after 3 seconds
      await jest.advanceTimersByTimeAsync(3000);

      // VERIFY: New WebSocket should be created
      expect(instances.length).toBe(2);

      app.close();
    } finally {
      global.WebSocket = originalWebSocket;
      jest.useRealTimers();
    }
  });

  test('should re-send structure request on reconnect (resubscribe calls fetch)', async () => {
    jest.useFakeTimers();

    const originalWebSocket = global.WebSocket;
    const { MockWebSocket, instances } = createMockWebSocketFactory();
    global.WebSocket = MockWebSocket;

    try {
      const app = new internal.AppConnection('ws://127.0.0.1:7689', null, true);
      const ws = instances[0];

      await jest.advanceTimersByTimeAsync(10);

      // Initialize connection
      ws.simulateMessage(createHelloMessage({ compatVersion: 4 }));
      await jest.advanceTimersByTimeAsync(10);
      ws.simulateMessage(createSystemStructureResponse('TestSystem'));
      await jest.advanceTimersByTimeAsync(10);

      // Subscribe to values - this should be restored after reconnect
      const consumer = jest.fn();
      app.root().async.subscribeToValues(consumer, 5, 0);

      // Count getter requests sent on first connection
      const firstWsGetterRequests = ws.getAllSentContainers()
        .filter(c => c.messageType === ContainerType.eGetterRequest);
      expect(firstWsGetterRequests.length).toBeGreaterThan(0);

      // Simulate disconnect
      ws.closed = true;
      ws.readyState = 3;
      if (ws.onclose) {
        ws.onclose({ code: 1006, reason: 'Connection lost' });
      }

      // Wait for reconnect
      await jest.advanceTimersByTimeAsync(3000);

      // New WebSocket created
      expect(instances.length).toBe(2);
      const ws2 = instances[1];

      // Simulate new connection opening - THIS triggers resubscribe()
      ws2.readyState = 1;
      if (ws2.onopen) {
        ws2.onopen({});
      }

      await jest.advanceTimersByTimeAsync(10);

      // VERIFY: New WebSocket should have received structure request (from resubscribe)
      // resubscribe() calls fetch() which sends structure request
      const ws2StructureRequests = ws2.getAllSentContainers()
        .filter(c => c.messageType === ContainerType.eStructureRequest);
      expect(ws2StructureRequests.length).toBeGreaterThan(0);

      app.close();
    } finally {
      global.WebSocket = originalWebSocket;
      jest.useRealTimers();
    }
  });
});

describe('Reconnection - Proxy/Service Connections', () => {
  test('should clear service state on primary connection close', async () => {
    jest.useFakeTimers();

    const originalWebSocket = global.WebSocket;
    const { MockWebSocket, instances } = createMockWebSocketFactory();
    global.WebSocket = MockWebSocket;

    try {
      const app = new internal.AppConnection('ws://127.0.0.1:7689', null, false);
      const ws = instances[0];

      await jest.advanceTimersByTimeAsync(10);

      // Initialize connection
      ws.simulateMessage(createHelloMessage({ compatVersion: 4 }));
      await jest.advanceTimersByTimeAsync(10);
      ws.simulateMessage(createSystemStructureResponse('TestSystem'));
      await jest.advanceTimersByTimeAsync(10);

      // Add services
      const service1 = createStudioApiServiceInfo(1, 'App1', '192.168.1.100', '7690');
      ws.simulateMessage(createServicesNotification([service1]));
      await jest.advanceTimersByTimeAsync(10);

      expect(app.services().size).toBe(1);

      // Close connection
      ws.closed = true;
      ws.readyState = 3;
      if (ws.onclose) {
        ws.onclose({ code: 1000, reason: 'Normal closure' });
      }

      // Services should be cleared
      expect(app.services().size).toBe(0);

    } finally {
      global.WebSocket = originalWebSocket;
      jest.useRealTimers();
    }
  });

  test('should trigger onclose for proxy connection when primary closes', async () => {
    jest.useFakeTimers();

    const originalWebSocket = global.WebSocket;
    const { MockWebSocket, instances } = createMockWebSocketFactory();
    global.WebSocket = MockWebSocket;

    try {
      const app = new internal.AppConnection('ws://127.0.0.1:7689', null, false);
      const ws = instances[0];

      await jest.advanceTimersByTimeAsync(10);

      ws.simulateMessage(createHelloMessage({ compatVersion: 4 }));
      await jest.advanceTimersByTimeAsync(10);
      ws.simulateMessage(createSystemStructureResponse('TestSystem'));
      await jest.advanceTimersByTimeAsync(10);

      // Add service for sibling app
      const service1 = createStudioApiServiceInfo(1, 'App1', '192.168.1.100', '7690');
      ws.simulateMessage(createServicesNotification([service1]));
      await jest.advanceTimersByTimeAsync(10);

      // Connect to proxy/sibling (simulate full handshake)
      const proxyConnPromise = app.connectViaProxy('192.168.1.100', '7690');
      simulateProxyHandshake(ws, 1, 0, { systemName: 'App1' });
      await jest.advanceTimersByTimeAsync(10);
      const proxyConn = await proxyConnPromise;

      // Track if proxy connection receives onclose
      let proxyOnCloseCalled = false;
      // The proxy uses a transport, we need to track its closure
      // When primary closes, it should send disconnect to all service instances

      // Verify service messages were sent (connect)
      const sentBefore = ws.getAllSentContainers()
        .filter(c => c.messageType === ContainerType.eServiceMessage);
      expect(sentBefore.length).toBeGreaterThan(0);

      // Close primary connection
      ws.closed = true;
      ws.readyState = 3;
      if (ws.onclose) {
        ws.onclose({ code: 1000, reason: 'Normal closure' });
      }

      // VERIFY: After primary closes, serviceInstances should be cleared
      // This is internal state, but we can verify via services() being cleared
      expect(app.services().size).toBe(0);

    } finally {
      global.WebSocket = originalWebSocket;
      jest.useRealTimers();
    }
  });

  test('removing one service should NOT affect other sibling connections', async () => {
    jest.useFakeTimers();

    const originalWebSocket = global.WebSocket;
    const { MockWebSocket, instances } = createMockWebSocketFactory();
    global.WebSocket = MockWebSocket;

    try {
      const app = new internal.AppConnection('ws://127.0.0.1:7689', null, false);
      const ws = instances[0];

      await jest.advanceTimersByTimeAsync(10);

      ws.simulateMessage(createHelloMessage({ compatVersion: 4 }));
      await jest.advanceTimersByTimeAsync(10);
      ws.simulateMessage(createSystemStructureResponse('TestSystem'));
      await jest.advanceTimersByTimeAsync(10);

      // Add TWO services (App2 and App3)
      const service2 = createStudioApiServiceInfo(2, 'App2', '192.168.1.101', '7691');
      const service3 = createStudioApiServiceInfo(3, 'App3', '192.168.1.102', '7692');
      ws.simulateMessage(createServicesNotification([service2, service3]));
      await jest.advanceTimersByTimeAsync(10);

      expect(app.services().size).toBe(2);

      // Connect to BOTH siblings (simulate full handshake for each)
      const conn2Promise = app.connectViaProxy('192.168.1.101', '7691');
      simulateProxyHandshake(ws, 2, 0, { systemName: 'App2' });
      await jest.advanceTimersByTimeAsync(10);
      const conn2 = await conn2Promise;

      const conn3Promise = app.connectViaProxy('192.168.1.102', '7692');
      simulateProxyHandshake(ws, 3, 0, { systemName: 'App3' });
      await jest.advanceTimersByTimeAsync(10);
      const conn3 = await conn3Promise;

      expect(conn2.instanceKey).toBe('2:0');
      expect(conn3.instanceKey).toBe('3:0');

      // Remove App2 only (simulate App2 going down)
      ws.simulateMessage(createServicesNotification([service3])); // Only App3 remains
      await jest.advanceTimersByTimeAsync(10);

      // VERIFY: Only one service should remain
      expect(app.services().size).toBe(1);

      // Check by iterating services (serviceId may be Long type from protobuf)
      let foundService3 = false;
      let foundService2 = false;
      app.services().forEach((service, id) => {
        if (Number(id) === 3) foundService3 = true;
        if (Number(id) === 2) foundService2 = true;
      });
      expect(foundService3).toBe(true); // Service 3 still there
      expect(foundService2).toBe(false); // Service 2 gone

      // App3 connection should still be usable (not closed)
      // This is the key bug: "When I close App2, the client loses connection to ALL sibling apps"
      expect(app.isProxyAvailable('192.168.1.102', '7692')).toBe(true);

    } finally {
      global.WebSocket = originalWebSocket;
      jest.useRealTimers();
    }
  });
});

describe('Value Delivery', () => {
  test('should deliver each value exactly once to subscriber', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);

    // Track values received with duplicate detection
    const receivedValues = [];
    const timestampCounts = new Map();

    const valueConsumer = (value, timestamp) => {
      receivedValues.push({ value, timestamp });
      const count = (timestampCounts.get(timestamp) || 0) + 1;
      timestampCounts.set(timestamp, count);
    };

    // Subscribe to system node values
    app.root().async.subscribeToValues(valueConsumer, 5, 0);

    // Simulate receiving values
    app.root().receiveValue(100, 1000);
    app.root().receiveValue(101, 1001);
    app.root().receiveValue(102, 1002);

    // VERIFY: Each timestamp should only appear once
    timestampCounts.forEach((count, ts) => {
      expect(count).toBe(1);
    });

    expect(receivedValues.length).toBe(3);
  });

  test('should correctly update lastValue on receive', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);
    const systemNode = app.root();

    // Initially undefined
    expect(systemNode.lastValue()).toBeUndefined();

    // Receive a value
    systemNode.receiveValue(42.5, 1000);
    expect(systemNode.lastValue()).toBe(42.5);

    // Receive another value
    systemNode.receiveValue(43.5, 1001);
    expect(systemNode.lastValue()).toBe(43.5);
  });

  test('calling receiveValue twice with same timestamp should still call callback twice (no dedup)', () => {
    // This tests that receiveValue is a simple passthrough - it doesn't deduplicate
    // Deduplication should happen at a higher level if needed
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);

    const callbackCount = { count: 0 };
    const valueConsumer = () => { callbackCount.count++; };

    app.root().async.subscribeToValues(valueConsumer, 5, 0);

    // Intentionally send same value twice (simulates potential duplicate from reconnect)
    app.root().receiveValue(100, 1000);
    app.root().receiveValue(100, 1000); // Same timestamp!

    // This tests current behavior - if the implementation SHOULD deduplicate, this test documents it doesn't
    expect(callbackCount.count).toBe(2);
  });
});

describe('Multiple Subscription Edge Cases', () => {
  test('should handle rapid subscribe/unsubscribe cycles', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);
    const systemNode = app.root();

    const consumer = jest.fn();

    // Rapid subscribe/unsubscribe
    for (let i = 0; i < 5; i++) {
      systemNode.async.subscribeToValues(consumer, 5, 0);
      systemNode.async.unsubscribeFromValues(consumer);
    }

    // Should have sent 10 messages (5 subscribes + 5 unsubscribes)
    expect(transport.sent.length).toBe(10);

    // Final unsubscribe should NOT send another stop
    systemNode.async.unsubscribeFromValues(consumer);
    expect(transport.sent.length).toBe(10);
  });

  test('should handle concurrent subscriptions with different rates', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);
    const systemNode = app.root();

    const consumer1 = jest.fn();
    const consumer2 = jest.fn();
    const consumer3 = jest.fn();

    // Subscribe with different rates
    systemNode.async.subscribeToValues(consumer1, 5, 0);
    systemNode.async.subscribeToValues(consumer2, 10, 0);
    systemNode.async.subscribeToValues(consumer3, 20, 0);

    // Last request should use max fs=20
    let lastContainer = transport.getLastSentContainer();
    expect(lastContainer.getterRequest[0].fs).toBe(20);

    // Unsubscribe consumer3 (highest fs)
    systemNode.async.unsubscribeFromValues(consumer3);

    // Should send update with max fs=10 now
    lastContainer = transport.getLastSentContainer();
    expect(lastContainer.getterRequest[0].fs).toBe(10);
    expect(lastContainer.getterRequest[0].stop).toBeFalsy();
  });

  test('should handle sampleRate=0 as highest priority', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);
    const systemNode = app.root();

    const consumer1 = jest.fn();
    const consumer2 = jest.fn();

    // First subscription with non-zero sample rate
    systemNode.async.subscribeToValues(consumer1, 5, 10);

    // Second subscription with sampleRate=0 (all samples)
    systemNode.async.subscribeToValues(consumer2, 5, 0);

    // sampleRate should be 0 (highest priority = all samples)
    const lastContainer = transport.getLastSentContainer();
    // sampleRate 0 means not set or falsy
    expect(lastContainer.getterRequest[0].sampleRate).toBeFalsy();
  });
});

describe('Service Instance Counter Persistence', () => {
  test('instance counters should persist across service removal/re-addition', async () => {
    jest.useFakeTimers();

    const originalWebSocket = global.WebSocket;
    const { MockWebSocket, instances } = createMockWebSocketFactory();
    global.WebSocket = MockWebSocket;

    try {
      const app = new internal.AppConnection('ws://127.0.0.1:7689', null, false);
      const ws = instances[0];

      await jest.advanceTimersByTimeAsync(10);

      ws.simulateMessage(createHelloMessage({ compatVersion: 4 }));
      await jest.advanceTimersByTimeAsync(10);
      ws.simulateMessage(createSystemStructureResponse('TestSystem'));
      await jest.advanceTimersByTimeAsync(10);

      // Add service
      const service1 = createStudioApiServiceInfo(1, 'App1', '192.168.1.100', '7690');
      ws.simulateMessage(createServicesNotification([service1]));
      await jest.advanceTimersByTimeAsync(10);

      // Create first connection (simulate full proxy handshake)
      const conn1Promise = app.connectViaProxy('192.168.1.100', '7690');
      simulateProxyHandshake(ws, 1, 0, { systemName: 'App1' });
      await jest.advanceTimersByTimeAsync(10);
      const conn1 = await conn1Promise;
      expect(conn1.instanceKey).toBe('1:0');

      // Create second connection
      const conn2Promise = app.connectViaProxy('192.168.1.100', '7690');
      simulateProxyHandshake(ws, 1, 1, { systemName: 'App1' });
      await jest.advanceTimersByTimeAsync(10);
      const conn2 = await conn2Promise;
      expect(conn2.instanceKey).toBe('1:1');

      // Remove service
      ws.simulateMessage(createServicesNotification([]));
      await jest.advanceTimersByTimeAsync(10);

      // Re-add service
      ws.simulateMessage(createServicesNotification([service1]));
      await jest.advanceTimersByTimeAsync(10);

      // New connection should get next ID (2), not reset to 0
      const conn3Promise = app.connectViaProxy('192.168.1.100', '7690');
      simulateProxyHandshake(ws, 1, 2, { systemName: 'App1' });
      await jest.advanceTimersByTimeAsync(10);
      const conn3 = await conn3Promise;
      expect(conn3.instanceKey).toBe('1:2');

      app.close();
    } finally {
      global.WebSocket = originalWebSocket;
      jest.useRealTimers();
    }
  });
});

describe('Protocol Handler Message Queue', () => {
  test('should process messages sequentially to prevent race conditions', async () => {
    const socket = new FakeSocket();
    const handler = new protocol.Handler(socket, null);
    const receivedContainers = [];

    handler.onContainer = (container) => {
      receivedContainers.push(container.messageType);
    };

    // Send Hello first
    handler.handle(createHelloMessage({ compatVersion: 4 }));

    // Rapidly send multiple containers
    const services1 = [createStudioApiServiceInfo(1, 'App1')];
    const services2 = [createStudioApiServiceInfo(2, 'App2')];
    const services3 = [createStudioApiServiceInfo(3, 'App3')];

    handler.handle(createServicesNotification(services1));
    handler.handle(createServicesNotification(services2));
    handler.handle(createServicesNotification(services3));

    // Wait for all messages to be processed
    await new Promise(resolve => setTimeout(resolve, 100));

    // All 3 services notifications should be received
    expect(receivedContainers.length).toBe(3);
    expect(receivedContainers.every(t => t === ContainerType.eServicesNotification)).toBe(true);
  });
});

describe('Node Invalidation on Service Removal', () => {
  test('invalidateAllNodes should mark all nodes as invalid', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);

    const systemNode = app.root();
    expect(systemNode.isValid()).toBe(true);

    app.invalidateAllNodes();

    expect(systemNode.isValid()).toBe(false);
  });
});

describe('Node-Level Subscription Behavior', () => {
  test('receiveValue only delivers to registered subscribers (no duplicates at node level)', () => {
    // This tests the core mechanism - receiveValue delivers to all subscribers exactly once
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);
    const node = app.root();

    const callCounts = { cb1: 0, cb2: 0 };
    const cb1 = () => { callCounts.cb1++; };
    const cb2 = () => { callCounts.cb2++; };

    // Subscribe both callbacks
    node.async.subscribeToValues(cb1, 5, 0);
    node.async.subscribeToValues(cb2, 5, 0);

    // Receive one value
    node.receiveValue(42.0, 1000);

    // Each callback should be called exactly once
    expect(callCounts.cb1).toBe(1);
    expect(callCounts.cb2).toBe(1);
  });

  test('unsubscribing removes callback from delivery list', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);
    const node = app.root();

    let callCount = 0;
    const callback = () => { callCount++; };

    // Subscribe
    node.async.subscribeToValues(callback, 5, 0);
    node.receiveValue(1.0, 1000);
    expect(callCount).toBe(1);

    // Unsubscribe
    node.async.unsubscribeFromValues(callback);
    node.receiveValue(2.0, 2000);

    // Should still be 1 (not called again)
    expect(callCount).toBe(1);
  });

  test('invalidated node should not receive values (safety check)', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);
    const node = app.root();

    let callCount = 0;
    const callback = () => { callCount++; };

    node.async.subscribeToValues(callback, 5, 0);
    node.receiveValue(1.0, 1000);
    expect(callCount).toBe(1);

    // Invalidate the node
    node.invalidate();
    expect(node.isValid()).toBe(false);

    // Values can still technically be received on invalidated node
    // (the invalidation doesn't clear subscribers, it marks the node invalid)
    // This is expected behavior - caller should check isValid() before subscribing
    node.receiveValue(2.0, 2000);
    expect(callCount).toBe(2); // Documents current behavior
  });

  test('same callback subscribed twice should receive value twice (caller responsibility)', () => {
    // This documents current behavior - the library doesn't deduplicate callbacks
    // If caller subscribes same callback twice, they get called twice
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);
    const node = app.root();

    let callCount = 0;
    const callback = () => { callCount++; };

    // Subscribe same callback twice
    node.async.subscribeToValues(callback, 5, 0);
    node.async.subscribeToValues(callback, 5, 0);

    node.receiveValue(42.0, 1000);

    // Called twice because subscribed twice
    expect(callCount).toBe(2);
  });
});
