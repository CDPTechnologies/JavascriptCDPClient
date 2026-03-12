/**
 * Core Client Tests
 *
 * Tests the core CDP client functionality including:
 * 1. Protocol types and enum values
 * 2. Hello message handling
 * 3. Structure request/response
 * 4. Getter/setter requests
 * 5. Service discovery and proxy support
 * 6. Node tree traversal and subscriptions
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
  AuthResultCode,
  createHelloMessage,
  createStructureResponse,
  createSystemStructureResponse,
  createAppStructureResponse,
  createSignalStructureResponse,
  createGetterResponse,
  createSingleGetterResponse,
  createServicesNotification,
  createStudioApiServiceInfo,
  createLoggerServiceInfo,
  createServiceMessage,
  createAuthResponse,
  createRemoteError,
  createStructureChangeResponse,
  createMockNotificationListener
} = fakeData;

// Test constants
const TEST_NODE_ID = 123;
const TEST_SIGNAL_NODE_ID = 456;
const SAMPLE_RATE_HZ = 5;

describe('Protocol Types', () => {
  test('should have all required Container types', () => {
    expect(ContainerType.eStructureRequest).toBe(1);
    expect(ContainerType.eStructureResponse).toBe(2);
    expect(ContainerType.eGetterRequest).toBe(3);
    expect(ContainerType.eGetterResponse).toBe(4);
    expect(ContainerType.eSetterRequest).toBe(5);
    expect(ContainerType.eServicesRequest).toBe(16);
    expect(ContainerType.eServicesNotification).toBe(17);
    expect(ContainerType.eServiceMessage).toBe(18);
  });

  test('should have all ServiceMessage kinds', () => {
    expect(ServiceMessageKind.eConnect).toBe(0);
    expect(ServiceMessageKind.eConnected).toBe(1);
    expect(ServiceMessageKind.eDisconnect).toBe(2);
    expect(ServiceMessageKind.eData).toBe(3);
    expect(ServiceMessageKind.eError).toBe(4);
  });

  test('should have CDPNodeType enum with correct values', () => {
    expect(CDPNodeType.CDP_UNDEFINED).toBe(-1);
    expect(CDPNodeType.CDP_SYSTEM).toBe(0);
    expect(CDPNodeType.CDP_APPLICATION).toBe(1);
    expect(CDPNodeType.CDP_COMPONENT).toBe(2);
    expect(CDPNodeType.CDP_PROPERTY).toBe(6);
  });

  test('should have CDPValueType enum with correct values', () => {
    expect(CDPValueType.eUNDEFINED).toBe(0);
    expect(CDPValueType.eDOUBLE).toBe(1);
    expect(CDPValueType.eINT64).toBe(3);
    expect(CDPValueType.eFLOAT).toBe(4);
    expect(CDPValueType.eSTRING).toBe(12);
  });

  test('should have AuthResultCode enum with correct values', () => {
    expect(AuthResultCode.eCredentialsRequired).toBe(0);
    expect(AuthResultCode.eGranted).toBe(1);
    expect(AuthResultCode.eInvalidChallengeResponse).toBe(11);
    expect(AuthResultCode.eTemporarilyBlocked).toBe(13);
  });
});

describe('Protocol Handler - Hello Message', () => {
  test('should send structure request after Hello with compat < 2', async () => {
    const socket = new FakeSocket();
    const handler = new protocol.Handler(socket, null);

    // Call handler.handle() directly with encoded Hello message
    handler.handle(createHelloMessage({ compatVersion: 2 }));
    await new Promise(resolve => setImmediate(resolve));

    expect(socket.sent.length).toBe(1);
    const container = socket.getLastSentContainer();
    expect(container.messageType).toBe(ContainerType.eStructureRequest);
  });

  test('should send structure request AND services request after Hello with compat >= 4', async () => {
    const socket = new FakeSocket();
    const handler = new protocol.Handler(socket, null);

    handler.handle(createHelloMessage({ compatVersion: 4 }));
    await new Promise(resolve => setImmediate(resolve));

    expect(socket.sent.length).toBe(2);

    const containers = socket.getAllSentContainers();
    expect(containers[0].messageType).toBe(ContainerType.eStructureRequest);
    expect(containers[1].messageType).toBe(ContainerType.eServicesRequest);
    expect(containers[1].servicesRequest.subscribe).toBe(true);
  });

  test('should handle Hello with compat version 5', async () => {
    const socket = new FakeSocket();
    const handler = new protocol.Handler(socket, null);

    handler.handle(createHelloMessage({ compatVersion: 5 }));
    await new Promise(resolve => setImmediate(resolve));

    // With compat 5, should send both structure and services requests
    expect(socket.sent.length).toBe(2);
  });
});

describe('AppConnection - Value Subscriptions', () => {
  test('should send getter request on subscribeToValues', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);
    const systemNode = app.root();
    const consumer = jest.fn();

    systemNode.async.subscribeToValues(consumer, SAMPLE_RATE_HZ, 0);

    expect(transport.sent.length).toBe(1);
    const container = transport.getLastSentContainer();
    expect(container.messageType).toBe(ContainerType.eGetterRequest);
    expect(container.getterRequest[0].stop).toBeFalsy();
  });

  test('should send stop getter request on unsubscribeFromValues', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);
    const systemNode = app.root();
    const consumer = jest.fn();

    // Subscribe first
    systemNode.async.subscribeToValues(consumer, SAMPLE_RATE_HZ, 0);
    expect(transport.sent.length).toBe(1);

    // Then unsubscribe
    systemNode.async.unsubscribeFromValues(consumer);
    expect(transport.sent.length).toBe(2);

    const stopMsg = transport.getLastSentContainer();
    expect(stopMsg.messageType).toBe(ContainerType.eGetterRequest);
    expect(stopMsg.getterRequest[0].stop).toBe(true);
  });

  test('should update subscription rate when re-subscribing', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);
    const systemNode = app.root();
    const consumer1 = jest.fn();
    const consumer2 = jest.fn();

    // First subscription
    systemNode.async.subscribeToValues(consumer1, 5, 0);
    expect(transport.sent.length).toBe(1);

    // Second subscription with different rate sends new request
    systemNode.async.subscribeToValues(consumer2, 10, 0);
    expect(transport.sent.length).toBe(2);
  });
});

describe('AppConnection - ServiceMessage', () => {
  test('should wrap payload in ServiceMessage container', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);

    app.sendServiceMessage(42, 3, ServiceMessageKind.eData, new Uint8Array([1, 2, 3]));

    expect(transport.sent.length).toBe(1);
    const container = transport.getLastSentContainer();
    expect(container.messageType).toBe(ContainerType.eServiceMessage);

    const serviceMsg = container.serviceMessage[0];
    expect(Number(serviceMsg.serviceId)).toBe(42);
    expect(Number(serviceMsg.instanceId)).toBe(3);
    expect(serviceMsg.kind).toBe(ServiceMessageKind.eData);
    expect(Buffer.from(serviceMsg.payload).toString('hex')).toBe('010203');
  });

  test('should send eConnect message correctly', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);

    app.sendServiceMessage(99, 1, ServiceMessageKind.eConnect);

    expect(transport.sent.length).toBe(1);
    const container = transport.getLastSentContainer();
    const serviceMsg = container.serviceMessage[0];

    expect(Number(serviceMsg.serviceId)).toBe(99);
    expect(Number(serviceMsg.instanceId)).toBe(1);
    expect(serviceMsg.kind).toBe(ServiceMessageKind.eConnect);
  });

  test('should send eDisconnect message correctly', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);

    app.sendServiceMessage(99, 1, ServiceMessageKind.eDisconnect);

    expect(transport.sent.length).toBe(1);
    const container = transport.getLastSentContainer();
    const serviceMsg = container.serviceMessage[0];

    expect(serviceMsg.kind).toBe(ServiceMessageKind.eDisconnect);
  });
});

describe('AppConnection - supportsProxyProtocol', () => {
  test('should return falsy when no metadata set', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);

    expect(app.supportsProxyProtocol()).toBeFalsy();
  });

  test('supportsProxyProtocol is a function', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);

    expect(typeof app.supportsProxyProtocol).toBe('function');
  });
});

describe('Protocol Handler - Container Forwarding', () => {
  test('should forward ServicesNotification container via onContainer callback', async () => {
    const socket = new FakeSocket();
    const handler = new protocol.Handler(socket, null);
    const receivedContainers = [];

    handler.onContainer = (container, metadata) => {
      receivedContainers.push(container);
    };

    // Send Hello to initialize
    handler.handle(createHelloMessage({ compatVersion: 4 }));
    await new Promise(resolve => setImmediate(resolve));

    // Send ServicesNotification
    const services = [
      createStudioApiServiceInfo(1, 'App1', '192.168.1.100', '7691'),
      createStudioApiServiceInfo(2, 'App2', '192.168.1.101', '7692')
    ];
    handler.handle(createServicesNotification(services));
    await new Promise(resolve => setImmediate(resolve));

    // Verify container was forwarded
    expect(receivedContainers.length).toBe(1);
    expect(receivedContainers[0].messageType).toBe(ContainerType.eServicesNotification);
    expect(receivedContainers[0].servicesNotification.services.length).toBe(2);
  });

  test('should forward empty services notification', async () => {
    const socket = new FakeSocket();
    const handler = new protocol.Handler(socket, null);
    const receivedContainers = [];

    handler.onContainer = (container) => {
      receivedContainers.push(container);
    };

    handler.handle(createHelloMessage({ compatVersion: 4 }));
    await new Promise(resolve => setImmediate(resolve));

    handler.handle(createServicesNotification([]));
    await new Promise(resolve => setImmediate(resolve));

    expect(receivedContainers.length).toBe(1);
    expect(receivedContainers[0].servicesNotification.services).toEqual([]);
  });

  test('should forward container with logger services metadata', async () => {
    const socket = new FakeSocket();
    const handler = new protocol.Handler(socket, null);
    const receivedContainers = [];

    handler.onContainer = (container) => {
      receivedContainers.push(container);
    };

    handler.handle(createHelloMessage({ compatVersion: 4 }));
    await new Promise(resolve => setImmediate(resolve));

    const services = [
      createStudioApiServiceInfo(1, 'App1'),
      createLoggerServiceInfo(2, 'App1.Logger1', '127.0.0.1', '17000')
    ];
    handler.handle(createServicesNotification(services));
    await new Promise(resolve => setImmediate(resolve));

    expect(receivedContainers.length).toBe(1);
    const receivedServices = receivedContainers[0].servicesNotification.services;
    expect(receivedServices.length).toBe(2);
    expect(receivedServices[1].metadata.proxy_type).toBe('logserver');
  });
});

describe('Protocol Handler - Setter Request', () => {
  test('should encode setter request with double value', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);

    app.makeSetterRequest(TEST_NODE_ID, CDPValueType.eDOUBLE, 42.5, Date.now() / 1000);

    expect(transport.sent.length).toBe(1);
    const container = transport.getLastSentContainer();
    expect(container.messageType).toBe(ContainerType.eSetterRequest);
    expect(container.setterRequest.length).toBe(1);
    expect(Number(container.setterRequest[0].nodeId)).toBe(TEST_NODE_ID);
    expect(container.setterRequest[0].dValue).toBeCloseTo(42.5);
  });

  test('should encode setter request with int value', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);

    app.makeSetterRequest(TEST_SIGNAL_NODE_ID, CDPValueType.eINT64, 999, Date.now() / 1000);

    expect(transport.sent.length).toBe(1);
    const container = transport.getLastSentContainer();
    expect(container.messageType).toBe(ContainerType.eSetterRequest);
    expect(Number(container.setterRequest[0].nodeId)).toBe(TEST_SIGNAL_NODE_ID);
    expect(Number(container.setterRequest[0].i64Value)).toBe(999);
  });

  test('should encode setter request with string value', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);

    app.makeSetterRequest(789, CDPValueType.eSTRING, 'test string', Date.now() / 1000);

    expect(transport.sent.length).toBe(1);
    const container = transport.getLastSentContainer();
    expect(container.setterRequest[0].strValue).toBe('test string');
  });

  test('should encode setter request with boolean value', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);

    app.makeSetterRequest(789, CDPValueType.eBOOL, true, Date.now() / 1000);

    expect(transport.sent.length).toBe(1);
    const container = transport.getLastSentContainer();
    expect(container.setterRequest[0].bValue).toBe(true);
  });
});

describe('Protocol Handler - Structure Request', () => {
  test('should send structure request for node', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);

    app.makeStructureRequest(TEST_NODE_ID);

    expect(transport.sent.length).toBe(1);
    const container = transport.getLastSentContainer();
    expect(container.messageType).toBe(ContainerType.eStructureRequest);
    // structureRequest is an array of nodeIds (integers), not objects
    expect(Number(container.structureRequest[0])).toBe(TEST_NODE_ID);
  });
});

describe('Protocol - Value Conversion', () => {
  test('should convert double value to variant', () => {
    const variant = protocol.VariantValue.create();
    protocol.valueToVariant(variant, CDPValueType.eDOUBLE, 3.14159);

    expect(variant.dValue).toBeCloseTo(3.14159);
  });

  test('should convert int value to variant', () => {
    const variant = protocol.VariantValue.create();
    protocol.valueToVariant(variant, CDPValueType.eINT64, 12345);

    expect(Number(variant.i64Value)).toBe(12345);
  });

  test('should convert uint value to variant', () => {
    const variant = protocol.VariantValue.create();
    protocol.valueToVariant(variant, CDPValueType.eUINT64, 99999);

    expect(Number(variant.ui64Value)).toBe(99999);
  });

  test('should convert string value to variant', () => {
    const variant = protocol.VariantValue.create();
    protocol.valueToVariant(variant, CDPValueType.eSTRING, 'hello world');

    expect(variant.strValue).toBe('hello world');
  });

  test('should convert bool true to variant', () => {
    const variant = protocol.VariantValue.create();
    protocol.valueToVariant(variant, CDPValueType.eBOOL, true);

    expect(variant.bValue).toBe(true);
  });

  test('should convert bool false to variant', () => {
    const variant = protocol.VariantValue.create();
    protocol.valueToVariant(variant, CDPValueType.eBOOL, false);

    expect(variant.bValue).toBe(false);
  });

  test('should convert float value to variant', () => {
    const variant = protocol.VariantValue.create();
    protocol.valueToVariant(variant, CDPValueType.eFLOAT, 1.5);

    expect(variant.fValue).toBeCloseTo(1.5);
  });
});

describe('Protocol - appendBuffer', () => {
  test('should concatenate two buffers', () => {
    const buf1 = new Uint8Array([1, 2, 3]);
    const buf2 = new Uint8Array([4, 5, 6]);

    const result = protocol.appendBuffer(buf1, buf2);

    expect(result.byteLength).toBe(6);
    const arr = new Uint8Array(result);
    expect(arr[0]).toBe(1);
    expect(arr[5]).toBe(6);
  });

  test('should handle empty first buffer', () => {
    const buf1 = new Uint8Array([]);
    const buf2 = new Uint8Array([1, 2, 3]);

    const result = protocol.appendBuffer(buf1, buf2);

    expect(result.byteLength).toBe(3);
  });

  test('should handle empty second buffer', () => {
    const buf1 = new Uint8Array([1, 2, 3]);
    const buf2 = new Uint8Array([]);

    const result = protocol.appendBuffer(buf1, buf2);

    expect(result.byteLength).toBe(3);
  });
});

describe('Protocol - CreateAuthRequest', () => {
  test('should create auth request with hashed credentials', async () => {
    const credentials = { Username: 'testuser', Password: 'testpass' };
    const challenge = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

    const authRequest = await protocol.CreateAuthRequest(credentials, challenge);

    expect(authRequest).toBeDefined();
    expect(authRequest.userId).toBe('testuser');
    expect(authRequest.challengeResponse).toBeDefined();
    expect(authRequest.challengeResponse.length).toBe(1);
    expect(authRequest.challengeResponse[0].type).toBe('PasswordHash');
    expect(authRequest.challengeResponse[0].response).toBeDefined();
    expect(authRequest.challengeResponse[0].response.byteLength).toBe(32); // SHA-256 = 32 bytes
  });

  test('should lowercase username in auth request', async () => {
    const credentials = { Username: 'TestUser', Password: 'testpass' };
    const challenge = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

    const authRequest = await protocol.CreateAuthRequest(credentials, challenge);

    expect(authRequest.userId).toBe('testuser');
  });

  test('should produce different hashes for different passwords', async () => {
    const challenge = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

    const auth1 = await protocol.CreateAuthRequest({ Username: 'user', Password: 'pass1' }, challenge);
    const auth2 = await protocol.CreateAuthRequest({ Username: 'user', Password: 'pass2' }, challenge);

    const hash1 = Buffer.from(auth1.challengeResponse[0].response).toString('hex');
    const hash2 = Buffer.from(auth2.challengeResponse[0].response).toString('hex');

    expect(hash1).not.toBe(hash2);
  });

  test('should produce different hashes for different challenges', async () => {
    const credentials = { Username: 'user', Password: 'pass' };

    const auth1 = await protocol.CreateAuthRequest(credentials, new Uint8Array([1, 2, 3, 4]));
    const auth2 = await protocol.CreateAuthRequest(credentials, new Uint8Array([5, 6, 7, 8]));

    const hash1 = Buffer.from(auth1.challengeResponse[0].response).toString('hex');
    const hash2 = Buffer.from(auth2.challengeResponse[0].response).toString('hex');

    expect(hash1).not.toBe(hash2);
  });

  test('should handle empty password', async () => {
    const credentials = { Username: 'user', Password: '' };
    const challenge = new Uint8Array([1, 2, 3, 4]);

    const authRequest = await protocol.CreateAuthRequest(credentials, challenge);

    expect(authRequest.userId).toBe('user');
    expect(authRequest.challengeResponse[0].response.byteLength).toBe(32);
  });
});

describe('FakeSocket and FakeTransport helpers', () => {
  test('FakeSocket should track sent messages', () => {
    const socket = new FakeSocket();

    socket.send(new Uint8Array([1, 2, 3]));
    socket.send(new Uint8Array([4, 5, 6]));

    expect(socket.sent.length).toBe(2);
  });

  test('FakeSocket should throw when sending after close', () => {
    const socket = new FakeSocket();
    socket.close();

    expect(() => socket.send(new Uint8Array([1]))).toThrow('WebSocket is closed');
  });

  test('FakeSocket should call onclose when closed', () => {
    const socket = new FakeSocket();
    const onClose = jest.fn();
    socket.onclose = onClose;

    socket.close();

    expect(onClose).toHaveBeenCalled();
    expect(socket.readyState).toBe(3);
  });

  test('FakeSocket.clearSent should clear sent messages', () => {
    const socket = new FakeSocket();
    socket.send(new Uint8Array([1, 2, 3]));
    expect(socket.sent.length).toBe(1);

    socket.clearSent();

    expect(socket.sent.length).toBe(0);
  });

  test('FakeTransport should track sent messages', () => {
    const transport = new FakeTransport();

    transport.send(new Uint8Array([1, 2, 3]));

    expect(transport.sent.length).toBe(1);
    expect(transport.readyState()).toBe(1);
  });

  test('FakeTransport should simulate receiving messages', () => {
    const transport = new FakeTransport();
    const onMessage = jest.fn();
    transport.onmessage = onMessage;

    transport.simulateMessage(new Uint8Array([1, 2, 3]));

    expect(onMessage).toHaveBeenCalledWith({ data: expect.any(Uint8Array) });
  });
});

describe('Proto Schema Validation', () => {
  test('should have correct Container.Type enum values', () => {
    const protobuf = require('protobufjs');
    const root = protobuf.parse(require('../studioapi.proto.js')).root;

    const containerTypes = root.lookupEnum('Container.Type').values;

    expect(containerTypes.eStructureRequest).toBe(1);
    expect(containerTypes.eStructureResponse).toBe(2);
    expect(containerTypes.eGetterRequest).toBe(3);
    expect(containerTypes.eGetterResponse).toBe(4);
    expect(containerTypes.eSetterRequest).toBe(5);
    expect(containerTypes.eServicesRequest).toBe(16);
    expect(containerTypes.eServicesNotification).toBe(17);
    expect(containerTypes.eServiceMessage).toBe(18);
  });

  test('should have correct ServiceMessage.Kind enum values', () => {
    const protobuf = require('protobufjs');
    const root = protobuf.parse(require('../studioapi.proto.js')).root;

    const serviceKind = root.lookupEnum('ServiceMessage.Kind').values;

    expect(serviceKind.eConnect).toBe(0);
    expect(serviceKind.eConnected).toBe(1);
    expect(serviceKind.eDisconnect).toBe(2);
    expect(serviceKind.eData).toBe(3);
    expect(serviceKind.eError).toBe(4);
  });

  test('should have EventInfo.CodeFlags enum', () => {
    const protobuf = require('protobufjs');
    const root = protobuf.parse(require('../studioapi.proto.js')).root;

    const eventInfo = root.lookupType('EventInfo');
    const codeFlags = eventInfo.nested['CodeFlags'].values;

    expect(codeFlags.aAlarmSet).toBe(1);
    expect(codeFlags.eAlarmClr).toBe(2);
    expect(codeFlags.eAlarmAck).toBe(4);
  });

  test('should have AuthResultCode enum', () => {
    const protobuf = require('protobufjs');
    const root = protobuf.parse(require('../studioapi.proto.js')).root;

    const authResp = root.lookupType('AuthResponse');
    const authCodes = authResp.nested['AuthResultCode'].values;

    expect(authCodes.eGranted).toBe(1);
    expect(authCodes.eInvalidChallengeResponse).toBe(11);
    expect(authCodes.eTemporarilyBlocked).toBe(13);
  });
});
