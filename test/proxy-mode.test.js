/**
 * Proxy Mode Tests
 *
 * Tests the proxy protocol functionality including:
 * 1. ServicesNotification parsing
 * 2. Proxy service detection
 * 3. Service connection via proxy
 * 4. Virtual transport over ServiceMessage
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
  createHelloMessage,
  createServicesNotification,
  createStudioApiServiceInfo
} = fakeData;

describe('Proxy Mode - Services Request', () => {
  test('should send services request with subscribe=true for compat >= 4', async () => {
    const socket = new FakeSocket();
    const handler = new protocol.Handler(socket, null);

    handler.handle(createHelloMessage({ compatVersion: 4 }));
    await new Promise(resolve => setImmediate(resolve));

    // Should have sent both structure and services request
    expect(socket.sent.length).toBe(2);

    const servicesRequest = socket.getAllSentContainers()[1];
    expect(servicesRequest.messageType).toBe(ContainerType.eServicesRequest);
    expect(servicesRequest.servicesRequest.subscribe).toBe(true);
  });

  test('should NOT send services request for compat < 4', async () => {
    const socket = new FakeSocket();
    const handler = new protocol.Handler(socket, null);

    handler.handle(createHelloMessage({ compatVersion: 3 }));
    await new Promise(resolve => setImmediate(resolve));

    // Should only have sent structure request
    expect(socket.sent.length).toBe(1);
    const container = socket.getLastSentContainer();
    expect(container.messageType).toBe(ContainerType.eStructureRequest);
  });
});

describe('Proxy Mode - Service Discovery via onContainer', () => {
  test('should receive studioapi services via ServicesNotification container', async () => {
    const socket = new FakeSocket();
    const handler = new protocol.Handler(socket, null);
    const receivedContainers = [];

    handler.onContainer = (container) => {
      receivedContainers.push(container);
    };

    // Initialize connection
    handler.handle(createHelloMessage({ compatVersion: 4 }));
    await new Promise(resolve => setImmediate(resolve));

    // Send services notification
    const services = [
      createStudioApiServiceInfo(1, 'App1', '192.168.1.100', '7691'),
      createStudioApiServiceInfo(2, 'App2', '192.168.1.101', '7692')
    ];
    handler.handle(createServicesNotification(services));
    await new Promise(resolve => setImmediate(resolve));

    expect(receivedContainers.length).toBe(1);
    const receivedServices = receivedContainers[0].servicesNotification.services;
    expect(receivedServices.length).toBe(2);
    expect(receivedServices[0].metadata.proxy_type).toBe('studioapi');
    expect(receivedServices[1].metadata.proxy_type).toBe('studioapi');
  });

  test('should receive mixed services via ServicesNotification container', async () => {
    const socket = new FakeSocket();
    const handler = new protocol.Handler(socket, null);
    const receivedContainers = [];

    handler.onContainer = (container) => {
      receivedContainers.push(container);
    };

    handler.handle(createHelloMessage({ compatVersion: 4 }));
    await new Promise(resolve => setImmediate(resolve));

    // Send mixed services
    handler.handle(createServicesNotification([
      createStudioApiServiceInfo(1, 'App1'),
      {
        serviceId: 2,
        name: 'Logger1',
        type: 'websocketproxy',
        metadata: { proxy_type: 'logserver', ip: '127.0.0.1', port: '17000' }
      }
    ]));
    await new Promise(resolve => setImmediate(resolve));

    expect(receivedContainers.length).toBe(1);
    const receivedServices = receivedContainers[0].servicesNotification.services;
    expect(receivedServices.length).toBe(2);

    const studioApiServices = receivedServices.filter(s => s.metadata.proxy_type === 'studioapi');
    const loggerServices = receivedServices.filter(s => s.metadata.proxy_type === 'logserver');

    expect(studioApiServices.length).toBe(1);
    expect(loggerServices.length).toBe(1);
  });
});

describe('AppConnection - Proxy Protocol Support', () => {
  test('should return falsy for supportsProxyProtocol before Hello', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);

    expect(app.supportsProxyProtocol()).toBeFalsy();
  });

  test('supportsProxyProtocol should be a function', () => {
    const transport = new FakeTransport();
    const app = new internal.AppConnection(transport, null, false);

    expect(typeof app.supportsProxyProtocol).toBe('function');
  });
});
