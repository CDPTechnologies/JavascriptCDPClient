/**
 * Service and Protocol Tests
 *
 * Tests protocol message encoding/decoding including:
 * 1. ServicesRequest/ServicesNotification encoding
 * 2. ServiceMessage encoding and parsing
 * 3. ServiceInfo metadata handling
 * 4. Protocol buffer serialization
 */

global.WebSocket = require('ws');
const studio = require('../index');
const fakeData = require('./fakeData');

const { protocol, internal } = studio;
const {
  FakeSocket,
  FakeTransport,
  ContainerType,
  ServiceMessageKind,
  createHelloMessage,
  createServicesNotification,
  createStudioApiServiceInfo,
  createLoggerServiceInfo
} = fakeData;

describe('Service Instance Management', () => {
  test('should generate unique instance IDs for service connections', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);

    // Send two connect messages for different services
    app.sendServiceMessage(1, 100, ServiceMessageKind.eConnect);
    app.sendServiceMessage(2, 101, ServiceMessageKind.eConnect);

    const containers = transport.getAllSentContainers();
    expect(containers.length).toBe(2);

    const instance1 = Number(containers[0].serviceMessage[0].instanceId);
    const instance2 = Number(containers[1].serviceMessage[0].instanceId);

    // Instance IDs should be as specified
    expect(instance1).toBe(100);
    expect(instance2).toBe(101);
  });

  test('should properly encode service payload data', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);

    const testPayload = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]);
    app.sendServiceMessage(42, 1, ServiceMessageKind.eData, testPayload);

    const container = transport.getLastSentContainer();
    const serviceMsg = container.serviceMessage[0];

    expect(Buffer.from(serviceMsg.payload).toString('hex')).toBe('deadbeef');
  });
});

describe('Protocol Compat Version Features', () => {
  test('exposes compat v4 service container types', () => {
    // These should be the actual values from the protocol
    expect(ContainerType.eServicesRequest).toBe(16);
    expect(ContainerType.eServicesNotification).toBe(17);
    expect(ContainerType.eServiceMessage).toBe(18);
  });

  test('exposes all ServiceMessage kinds', () => {
    expect(ServiceMessageKind.eConnect).toBe(0);
    expect(ServiceMessageKind.eConnected).toBe(1);
    expect(ServiceMessageKind.eDisconnect).toBe(2);
    expect(ServiceMessageKind.eData).toBe(3);
    expect(ServiceMessageKind.eError).toBe(4);
  });

  test('should request services subscription for compat >= 4', async () => {
    const socket = new FakeSocket();
    const handler = new protocol.Handler(socket, null);

    handler.handle(createHelloMessage({ compatVersion: 4 }));
    await new Promise(resolve => setImmediate(resolve));

    const containers = socket.getAllSentContainers();
    const servicesReq = containers.find(c => c.messageType === ContainerType.eServicesRequest);

    expect(servicesReq).toBeDefined();
    expect(servicesReq.servicesRequest.subscribe).toBe(true);
  });

  test('should NOT request services subscription for compat < 4', async () => {
    const socket = new FakeSocket();
    const handler = new protocol.Handler(socket, null);

    handler.handle(createHelloMessage({ compatVersion: 3 }));
    await new Promise(resolve => setImmediate(resolve));

    const containers = socket.getAllSentContainers();
    const servicesReq = containers.find(c => c.messageType === ContainerType.eServicesRequest);

    expect(servicesReq).toBeUndefined();
  });
});

describe('Services Notification Container Handling', () => {
  test('should forward studioapi service metadata in container', async () => {
    const socket = new FakeSocket();
    const handler = new protocol.Handler(socket, null);
    const receivedContainers = [];

    handler.onContainer = (container) => {
      receivedContainers.push(container);
    };

    handler.handle(createHelloMessage({ compatVersion: 4 }));
    await new Promise(resolve => setImmediate(resolve));

    handler.handle(createServicesNotification([
      createStudioApiServiceInfo(1, 'TestApp', '192.168.1.50', '7690')
    ]));
    await new Promise(resolve => setImmediate(resolve));

    expect(receivedContainers.length).toBe(1);
    const services = receivedContainers[0].servicesNotification.services;
    expect(services.length).toBe(1);
    expect(services[0].name).toBe('TestApp');
    expect(services[0].metadata.ip_address).toBe('192.168.1.50');
    expect(services[0].metadata.port).toBe('7690');
    expect(services[0].metadata.proxy_type).toBe('studioapi');
    expect(services[0].metadata.node_model).toBe('StudioAPIServer');
  });

  test('should forward logger service metadata in container', async () => {
    const socket = new FakeSocket();
    const handler = new protocol.Handler(socket, null);
    const receivedContainers = [];

    handler.onContainer = (container) => {
      receivedContainers.push(container);
    };

    handler.handle(createHelloMessage({ compatVersion: 4 }));
    await new Promise(resolve => setImmediate(resolve));

    handler.handle(createServicesNotification([
      createLoggerServiceInfo(1, 'App1.Logger1', '192.168.1.50', '17000')
    ]));
    await new Promise(resolve => setImmediate(resolve));

    expect(receivedContainers.length).toBe(1);
    const services = receivedContainers[0].servicesNotification.services;
    expect(services.length).toBe(1);
    expect(services[0].name).toBe('App1.Logger1');
    expect(services[0].metadata.proxy_type).toBe('logserver');
    expect(services[0].metadata.node_model).toBe('CDPLogger');
  });

  test('should forward multiple services in container', async () => {
    const socket = new FakeSocket();
    const handler = new protocol.Handler(socket, null);
    const receivedContainers = [];

    handler.onContainer = (container) => {
      receivedContainers.push(container);
    };

    handler.handle(createHelloMessage({ compatVersion: 4 }));
    await new Promise(resolve => setImmediate(resolve));

    handler.handle(createServicesNotification([
      createStudioApiServiceInfo(1, 'App1', '192.168.1.100', '7690'),
      createStudioApiServiceInfo(2, 'App2', '192.168.1.101', '7691'),
      createLoggerServiceInfo(3, 'App1.Logger', '192.168.1.100', '17000')
    ]));
    await new Promise(resolve => setImmediate(resolve));

    expect(receivedContainers.length).toBe(1);
    const services = receivedContainers[0].servicesNotification.services;
    expect(services.length).toBe(3);

    const studioApiCount = services.filter(s => s.metadata.proxy_type === 'studioapi').length;
    const loggerCount = services.filter(s => s.metadata.proxy_type === 'logserver').length;

    expect(studioApiCount).toBe(2);
    expect(loggerCount).toBe(1);
  });
});
