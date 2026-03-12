/**
 * Test Utilities and Mock Data
 *
 * Provides mock objects and factory functions for testing:
 * 1. FakeSocket - Mock WebSocket for unit testing
 * 2. FakeTransport - Mock transport layer
 * 3. Message creation helpers (Hello, Structure, Getter, etc.)
 * 4. MockWebSocket factory for integration testing
 */

// Import actual protocol for encoding/decoding
const studio = require('../index');
const { protocol } = studio;

// Re-export actual protocol enums for convenience (ensures tests use correct values)
const ContainerType = protocol.ContainerType;
const CDPNodeType = protocol.CDPNodeType;
const CDPValueType = protocol.CDPValueType;
const ServiceMessageKind = protocol.ServiceMessageKind;
const AuthResultCode = protocol.AuthResultCode;

/**
 * Mock WebSocket that captures sent messages and can simulate receiving messages.
 * Use simulateMessage() to trigger the handler's onmessage callback.
 */
class FakeSocket {
  constructor() {
    this.sent = [];
    this.binaryType = null;
    this.closed = false;
    this.readyState = 1; // WebSocket.OPEN
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    this.onopen = null;
  }

  send(buf) {
    if (this.closed) {
      throw new Error('WebSocket is closed');
    }
    this.sent.push(buf);
  }

  close() {
    this.closed = true;
    this.readyState = 3; // WebSocket.CLOSED
    if (this.onclose) {
      this.onclose({ code: 1000, reason: 'Normal closure' });
    }
  }

  /**
   * Simulate receiving a message from the server
   * @param {Uint8Array} data - The raw message data
   */
  simulateMessage(data) {
    if (this.onmessage) {
      this.onmessage({ data: data });
    }
  }

  /**
   * Simulate a connection error
   * @param {string} message - Error message
   */
  simulateError(message) {
    if (this.onerror) {
      this.onerror({ data: message });
    }
  }

  /**
   * Simulate connection open
   */
  simulateOpen() {
    this.readyState = 1;
    if (this.onopen) {
      this.onopen({});
    }
  }

  /**
   * Get the last sent message decoded as a Container
   * @returns {Object} Decoded Container message
   */
  getLastSentContainer() {
    if (this.sent.length === 0) return null;
    return protocol.Container.decode(this.sent[this.sent.length - 1]);
  }

  /**
   * Get all sent messages decoded as Containers
   * @returns {Array} Array of decoded Container messages
   */
  getAllSentContainers() {
    return this.sent.map(buf => protocol.Container.decode(buf));
  }

  /**
   * Clear sent messages
   */
  clearSent() {
    this.sent = [];
  }
}

/**
 * Mock transport for AppConnection testing.
 * Mirrors the interface expected by AppConnection.
 */
class FakeTransport {
  constructor() {
    this.sent = [];
    this.closed = false;
    this._readyState = 1; // WebSocket.OPEN
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    this.onopen = null;
  }

  readyState() {
    return this._readyState;
  }

  send(buf) {
    if (this.closed) {
      throw new Error('Transport is closed');
    }
    this.sent.push(buf);
  }

  close() {
    this.closed = true;
    this._readyState = 3;
    if (this.onclose) {
      this.onclose({ code: 1000, reason: 'Normal closure' });
    }
  }

  /**
   * Simulate receiving a message
   * @param {Uint8Array} data - The raw message data
   */
  simulateMessage(data) {
    if (this.onmessage) {
      this.onmessage({ data: data });
    }
  }

  /**
   * Get the last sent message decoded as a Container
   * @returns {Object} Decoded Container message
   */
  getLastSentContainer() {
    if (this.sent.length === 0) return null;
    return protocol.Container.decode(this.sent[this.sent.length - 1]);
  }

  /**
   * Get all sent messages decoded as Containers
   * @returns {Array} Array of decoded Container messages
   */
  getAllSentContainers() {
    return this.sent.map(buf => protocol.Container.decode(buf));
  }

  /**
   * Clear sent messages
   */
  clearSent() {
    this.sent = [];
  }
}

// ============================================================================
// Message Factory Functions
// ============================================================================

/**
 * Create a Hello message (sent by server on connection)
 * @param {Object} options
 * @param {string} options.systemName - System name (default: "TestSystem")
 * @param {string} options.applicationName - App name (default: "TestApp")
 * @param {number} options.compatVersion - Protocol compat version (default: 4)
 * @param {Uint8Array} options.challenge - Auth challenge bytes (optional)
 * @returns {Uint8Array} Encoded Hello message
 */
function createHelloMessage(options = {}) {
  const {
    systemName = 'TestSystem',
    applicationName = 'TestApp',
    compatVersion = 4,
    incrementalVersion = 0,
    cdpVersionMajor = 5,
    cdpVersionMinor = 1,
    cdpVersionPatch = 0,
    challenge = null
  } = options;

  const hello = protocol.Hello.create({
    systemName,
    applicationName,
    compatVersion,
    incrementalVersion,
    cdpVersionMajor,
    cdpVersionMinor,
    cdpVersionPatch
  });

  if (challenge) {
    hello.challenge = challenge;
  }

  return protocol.Hello.encode(hello).finish();
}

/**
 * Create a structure response Container
 * @param {Array} nodes - Array of node definitions [{nodeId, name, nodeType, valueType, flags, isLocal}]
 * @returns {Uint8Array} Encoded Container message
 */
function createStructureResponse(nodes) {
  const structureResponse = nodes.map(node => ({
    nodeId: node.nodeId,
    info: {
      name: node.name,
      nodeType: node.nodeType !== undefined ? node.nodeType : CDPNodeType.CDP_PROPERTY,
      valueType: node.valueType !== undefined ? node.valueType : CDPValueType.eUNDEFINED,
      flags: node.flags || 0,
      isLocal: node.isLocal !== undefined ? node.isLocal : true,
      // protobufjs v7 uses camelCase property names
      serverAddr: node.serverAddr,
      serverPort: node.serverPort
    }
  }));

  const container = protocol.Container.create({
    messageType: ContainerType.eStructureResponse,
    structureResponse
  });

  return protocol.Container.encode(container).finish();
}

/**
 * Create a structure response for the system node (nodeId 0)
 * @param {string} systemName - System name
 * @param {Array} children - Optional array of child app definitions
 * @returns {Uint8Array} Encoded Container message
 */
function createSystemStructureResponse(systemName = 'TestSystem', children = []) {
  // Build child nodes in the nested tree format required by the protocol
  const childNodes = children.map(child => ({
    info: {
      nodeId: child.nodeId,
      name: child.name,
      nodeType: child.nodeType !== undefined ? child.nodeType : CDPNodeType.CDP_APPLICATION,
      valueType: child.valueType !== undefined ? child.valueType : CDPValueType.eUNDEFINED,
      flags: child.flags || 0,
      isLocal: child.isLocal !== undefined ? child.isLocal : true,
      // protobufjs v7 uses camelCase property names
      serverAddr: child.serverAddr,
      serverPort: child.serverPort
    },
    node: [] // Child apps can have their own children
  }));

  // Create the system node with nested children
  const systemNode = {
    info: {
      nodeId: 0,
      name: systemName,
      nodeType: CDPNodeType.CDP_SYSTEM,
      valueType: CDPValueType.eUNDEFINED,
      flags: 0,
      isLocal: true
    },
    node: childNodes
  };

  const container = protocol.Container.create({
    messageType: ContainerType.eStructureResponse,
    structureResponse: [systemNode]
  });

  return protocol.Container.encode(container).finish();
}

/**
 * Create a structure response for an application node
 * @param {number} nodeId - Node ID
 * @param {string} appName - Application name
 * @param {boolean} isLocal - Whether app is local
 * @param {string} serverAddr - Server address for remote apps
 * @param {number} serverPort - Server port for remote apps
 * @returns {Uint8Array} Encoded Container message
 */
function createAppStructureResponse(nodeId, appName, isLocal = true, serverAddr = null, serverPort = null) {
  return createStructureResponse([{
    nodeId,
    name: appName,
    nodeType: CDPNodeType.CDP_APPLICATION,
    valueType: CDPValueType.eUNDEFINED,
    isLocal,
    serverAddr,
    serverPort
  }]);
}

/**
 * Create a structure response for a signal/property node
 * @param {number} nodeId - Node ID
 * @param {string} name - Signal name
 * @param {number} valueType - CDPValueType (default: eDOUBLE)
 * @returns {Uint8Array} Encoded Container message
 */
function createSignalStructureResponse(nodeId, name, valueType = CDPValueType.eDOUBLE) {
  return createStructureResponse([{
    nodeId,
    name,
    nodeType: CDPNodeType.CDP_PROPERTY,
    valueType,
    isLocal: true
  }]);
}

/**
 * Create a getter response Container with value(s)
 * @param {Array} values - Array of {nodeId, value, valueType, timestamp}
 * @returns {Uint8Array} Encoded Container message
 */
function createGetterResponse(values) {
  const getterResponse = values.map(v => {
    const response = {
      nodeId: v.nodeId,
      timestamp: v.timestamp || Date.now() / 1000
    };

    // Set the appropriate value field based on type
    const valueType = v.valueType !== undefined ? v.valueType : CDPValueType.eDOUBLE;
    switch (valueType) {
      case CDPValueType.eDOUBLE:
        response.dValue = v.value;
        break;
      case CDPValueType.eFLOAT:
        response.fValue = v.value;
        break;
      case CDPValueType.eINT64:
      case CDPValueType.eINT:
      case CDPValueType.eSHORT:
      case CDPValueType.eCHAR:
        response.i64Value = v.value;
        break;
      case CDPValueType.eUINT64:
      case CDPValueType.eUINT:
      case CDPValueType.eUSHORT:
      case CDPValueType.eUCHAR:
        response.ui64Value = v.value;
        break;
      case CDPValueType.eBOOL:
        response.bValue = v.value;
        break;
      case CDPValueType.eSTRING:
        response.strValue = v.value;
        break;
      default:
        response.dValue = v.value;
    }

    return response;
  });

  const container = protocol.Container.create({
    messageType: ContainerType.eGetterResponse,
    getterResponse
  });

  return protocol.Container.encode(container).finish();
}

/**
 * Create a single-value getter response (convenience function)
 * @param {number} nodeId - Node ID
 * @param {*} value - The value
 * @param {number} valueType - CDPValueType
 * @param {number} timestamp - Unix timestamp in seconds
 * @returns {Uint8Array} Encoded Container message
 */
function createSingleGetterResponse(nodeId, value, valueType = CDPValueType.eDOUBLE, timestamp = null) {
  return createGetterResponse([{ nodeId, value, valueType, timestamp }]);
}

/**
 * Create a services notification Container
 * @param {Array} services - Array of service definitions
 * @returns {Uint8Array} Encoded Container message
 */
function createServicesNotification(services) {
  const container = protocol.Container.create({
    messageType: ContainerType.eServicesNotification,
    servicesNotification: { services }
  });

  return protocol.Container.encode(container).finish();
}

/**
 * Create a studioapi proxy service info object
 * @param {number} serviceId - Service ID
 * @param {string} name - Application name
 * @param {string} ip - IP address
 * @param {string} port - Port number
 * @returns {Object} Service info object (not encoded)
 */
function createStudioApiServiceInfo(serviceId, name, ip = '127.0.0.1', port = '7690') {
  return {
    serviceId,
    name,
    type: 'websocketproxy',
    metadata: {
      ip_address: ip,
      port,
      proxy_type: 'studioapi',
      node_path: `${name}.CDP.StudioAPIServer`,
      node_model: 'StudioAPIServer'
    }
  };
}

/**
 * Create a logger proxy service info object
 * @param {number} serviceId - Service ID
 * @param {string} name - Logger name
 * @param {string} ip - IP address
 * @param {string} port - Port number
 * @returns {Object} Service info object (not encoded)
 */
function createLoggerServiceInfo(serviceId, name, ip = '127.0.0.1', port = '17000') {
  return {
    serviceId,
    name,
    type: 'websocketproxy',
    metadata: {
      ip_address: ip,
      port,
      proxy_type: 'logserver',
      node_path: name,
      node_model: 'CDPLogger'
    }
  };
}

/**
 * Create a ServiceMessage Container
 * @param {number} serviceId - Service ID
 * @param {number} instanceId - Instance ID
 * @param {number} kind - ServiceMessageKind
 * @param {Uint8Array} payload - Optional payload data
 * @returns {Uint8Array} Encoded Container message
 */
function createServiceMessage(serviceId, instanceId, kind, payload = null) {
  const serviceMessage = {
    serviceId,
    instanceId,
    kind
  };

  if (payload) {
    serviceMessage.payload = payload;
  }

  const container = protocol.Container.create({
    messageType: ContainerType.eServiceMessage,
    serviceMessage: [serviceMessage]
  });

  return protocol.Container.encode(container).finish();
}

/**
 * Create an auth response message
 * @param {number} resultCode - AuthResultCode
 * @param {string} resultText - Result message
 * @param {Uint8Array} challenge - New challenge for re-auth (sent when credentials fail)
 * @returns {Uint8Array} Encoded AuthResponse message
 */
function createAuthResponse(resultCode, resultText = '', challenge = null) {
  // AuthResponse is sent directly when in AuthHandler state
  const authResponse = protocol.AuthResponse.create({
    resultCode,
    resultText
  });

  if (challenge) {
    authResponse.challenge = challenge;
  }

  return protocol.AuthResponse.encode(authResponse).finish();
}

/**
 * Create a remote error Container
 * @param {number} nodeId - Node ID that caused error
 * @param {number} errorCode - Error code
 * @param {string} errorMessage - Error message
 * @param {Uint8Array} challenge - Optional challenge for reauth
 * @returns {Uint8Array} Encoded Container message
 */
function createRemoteError(nodeId, errorCode, errorMessage, challenge) {
  const error = {
    nodeId,
    code: errorCode,
    text: errorMessage
  };
  if (challenge) {
    error.challenge = challenge;
  }
  const container = protocol.Container.create({
    messageType: ContainerType.eRemoteError,
    error: error
  });

  return protocol.Container.encode(container).finish();
}

/**
 * Create a reauth response Container
 * @param {number} resultCode - AuthResultCode value
 * @param {string} resultText - Result description
 * @returns {Uint8Array} Encoded Container message
 */
function createReauthResponse(resultCode, resultText) {
  const container = protocol.Container.create({
    messageType: 12, // eReauthResponse
    reAuthResponse: {
      resultCode: resultCode,
      resultText: resultText || ''
    }
  });

  return protocol.Container.encode(container).finish();
}

/**
 * Create an event response Container
 * @param {number} nodeId - Node ID
 * @param {Array} events - Array of event objects
 * @returns {Uint8Array} Encoded Container message
 */
function createEventResponse(nodeId, events = []) {
  const container = protocol.Container.create({
    messageType: ContainerType.eEventResponse,
    eventResponse: [{
      nodeId,
      event: events
    }]
  });

  return protocol.Container.encode(container).finish();
}

/**
 * Create a structure change response (child list update)
 * @param {number} nodeId - Parent node ID
 * @param {Array} childIds - Array of child node IDs
 * @returns {Uint8Array} Encoded Container message
 */
function createStructureChangeResponse(nodeId, childIds) {
  const container = protocol.Container.create({
    messageType: ContainerType.eStructureChangeResponse,
    structureChangeResponse: [{
      nodeId,
      childId: childIds
    }]
  });

  return protocol.Container.encode(container).finish();
}

// ============================================================================
// Test Scenario Helpers
// ============================================================================

/**
 * Simulate a full connection handshake on a FakeSocket
 * Sends Hello, then structure response for system node
 * @param {FakeSocket} socket - The fake socket
 * @param {Object} options - Hello options
 */
function simulateConnectionHandshake(socket, options = {}) {
  // Send Hello
  socket.simulateMessage(createHelloMessage(options));

  // Wait for structure request, then send system structure response
  return new Promise(resolve => {
    setImmediate(() => {
      socket.simulateMessage(createSystemStructureResponse(options.systemName || 'TestSystem'));
      resolve();
    });
  });
}

/**
 * Simulate proxy connection handshake via ServiceMessage tunnel
 * Sends eConnected, then Hello and StructureResponse as eData payloads
 * @param {FakeSocket} socket - The fake socket (primary connection)
 * @param {number} serviceId - Service ID for the proxy
 * @param {number} instanceId - Instance ID for the proxy connection
 * @param {Object} options - Options for Hello/Structure
 */
function simulateProxyHandshake(socket, serviceId, instanceId, options = {}) {
  // Send eConnected to open the transport
  socket.simulateMessage(createServiceMessage(serviceId, instanceId, ServiceMessageKind.eConnected));

  // Send Hello via eData
  const helloPayload = createHelloMessage(options);
  socket.simulateMessage(createServiceMessage(serviceId, instanceId, ServiceMessageKind.eData, helloPayload));

  // Send StructureResponse via eData
  const structPayload = createSystemStructureResponse(options.systemName || 'ProxyApp');
  socket.simulateMessage(createServiceMessage(serviceId, instanceId, ServiceMessageKind.eData, structPayload));
}

/**
 * Create a notification listener that captures callbacks
 * @returns {Object} Listener with captured data and Jest mocks
 */
function createMockNotificationListener() {
  return {
    onOpen: jest.fn(),
    onClose: jest.fn(),
    onError: jest.fn(),
    onServicesAvailable: jest.fn(),
    onAuthRequested: jest.fn(),
    credentialsRequested: jest.fn().mockResolvedValue({ Username: 'test', Password: 'test' })
  };
}

/**
 * Creates a mock WebSocket constructor that captures created instances.
 * Use this to test primary connections (URL-based AppConnection).
 * @returns {Object} { MockWebSocket, instances }
 */
function createMockWebSocketFactory() {
  const instances = [];

  function MockWebSocket(url) {
    this.url = url;
    this.sent = [];
    this.binaryType = null;
    this.closed = false;
    this.readyState = 1; // WebSocket.OPEN
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    this.onopen = null;
    instances.push(this);

    // Auto-open after a tick to simulate real WebSocket behavior
    setTimeout(() => {
      if (this.onopen) {
        this.onopen({});
      }
    }, 0);
  }

  MockWebSocket.prototype.send = function(buf) {
    if (this.closed) {
      throw new Error('WebSocket is closed');
    }
    this.sent.push(buf);
  };

  MockWebSocket.prototype.close = function() {
    this.closed = true;
    this.readyState = 3;
    if (this.onclose) {
      this.onclose({ code: 1000, reason: 'Normal closure' });
    }
  };

  MockWebSocket.prototype.simulateMessage = function(data) {
    if (this.onmessage) {
      this.onmessage({ data: data });
    }
  };

  MockWebSocket.prototype.getLastSentContainer = function() {
    if (this.sent.length === 0) return null;
    return protocol.Container.decode(this.sent[this.sent.length - 1]);
  };

  MockWebSocket.prototype.getAllSentContainers = function() {
    return this.sent.map(buf => protocol.Container.decode(buf));
  };

  MockWebSocket.prototype.clearSent = function() {
    this.sent = [];
  };

  MockWebSocket.CONNECTING = 0;
  MockWebSocket.OPEN = 1;
  MockWebSocket.CLOSING = 2;
  MockWebSocket.CLOSED = 3;

  return { MockWebSocket, instances };
}

module.exports = {
  // Enums (re-exported from actual protocol)
  ContainerType,
  CDPNodeType,
  CDPValueType,
  ServiceMessageKind,
  AuthResultCode,

  // Mock classes
  FakeSocket,
  FakeTransport,
  createMockWebSocketFactory,

  // Message factories
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
  createReauthResponse,
  createEventResponse,
  createStructureChangeResponse,

  // Test helpers
  simulateConnectionHandshake,
  simulateProxyHandshake,
  createMockNotificationListener,

  // Re-export protocol for direct access
  protocol
};
