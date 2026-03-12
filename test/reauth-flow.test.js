/**
 * Reauthentication Flow Tests
 *
 * Tests the reauthentication flow when:
 * 1. Server sends eRemoteError with eAUTH_RESPONSE_EXPIRED
 * 2. Server sends eReauthResponse with non-granted result
 */

global.WebSocket = require('ws');
const studio = require('../index');
const fakeData = require('./fakeData');

const { protocol } = studio;
const {
  ContainerType,
  CDPNodeType,
  AuthResultCode,
  createHelloMessage,
  createSystemStructureResponse,
  createRemoteError,
  createReauthResponse,
  createMockWebSocketFactory
} = fakeData;

// RemoteErrorCode.eAUTH_RESPONSE_EXPIRED = 1
const eAUTH_RESPONSE_EXPIRED = 1;

describe('Reauthentication - Auth Response Expired Error', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should request credentials when receiving AUTH_RESPONSE_EXPIRED error', async () => {
    const originalWebSocket = global.WebSocket;
    const { MockWebSocket, instances } = createMockWebSocketFactory();
    global.WebSocket = MockWebSocket;

    try {
      const credentialsCalled = jest.fn().mockResolvedValue({
        Username: 'testuser',
        Password: 'newpassword'
      });

      const notificationListener = {
        credentialsRequested: credentialsCalled
      };

      const client = new studio.api.Client('ws://127.0.0.1:7689', notificationListener, false);

      // Trigger connection
      const rootPromise = client.root();
      await jest.advanceTimersByTimeAsync(10);

      expect(instances.length).toBe(1);
      const ws = instances[0];

      // Complete handshake without initial auth (no challenge)
      ws.simulateMessage(createHelloMessage({ compatVersion: 4 }));
      await jest.advanceTimersByTimeAsync(10);

      ws.simulateMessage(createSystemStructureResponse('TestSystem', [
        { name: 'App1', nodeId: 100, isLocal: true, nodeType: CDPNodeType.CDP_APPLICATION }
      ]));
      await jest.advanceTimersByTimeAsync(10);

      const root = await rootPromise;
      expect(root).toBeDefined();

      // No credentials should have been requested yet
      expect(credentialsCalled).toHaveBeenCalledTimes(0);

      // Now simulate session expiry - server sends AUTH_RESPONSE_EXPIRED error
      const newChallenge = new Uint8Array([16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
      ws.simulateMessage(createRemoteError(0, eAUTH_RESPONSE_EXPIRED, 'Session expired', newChallenge));
      await jest.advanceTimersByTimeAsync(200);

      // Should have requested credentials for reauth
      expect(credentialsCalled).toHaveBeenCalledTimes(1);

      // Verify the request has correct result code indicating reauth needed
      const request = credentialsCalled.mock.calls[0][0];
      expect(request.userAuthResult().code()).toBe(protocol.AuthResultCode.eReauthenticationRequired);

    } finally {
      global.WebSocket = originalWebSocket;
    }
  });

  test('should NOT request credentials for other error types', async () => {
    const originalWebSocket = global.WebSocket;
    const { MockWebSocket, instances } = createMockWebSocketFactory();
    global.WebSocket = MockWebSocket;

    try {
      const credentialsCalled = jest.fn().mockResolvedValue({
        Username: 'testuser',
        Password: 'password'
      });

      const notificationListener = {
        credentialsRequested: credentialsCalled
      };

      const client = new studio.api.Client('ws://127.0.0.1:7689', notificationListener, false);

      // Trigger connection
      const rootPromise = client.root();
      await jest.advanceTimersByTimeAsync(10);

      const ws = instances[0];

      // Complete handshake without auth (no challenge)
      ws.simulateMessage(createHelloMessage({ compatVersion: 4 }));
      await jest.advanceTimersByTimeAsync(10);

      ws.simulateMessage(createSystemStructureResponse('TestSystem', [
        { name: 'App1', nodeId: 100, isLocal: true, nodeType: CDPNodeType.CDP_APPLICATION }
      ]));
      await jest.advanceTimersByTimeAsync(10);

      await rootPromise;

      // No credentials should be requested (no auth required)
      expect(credentialsCalled).toHaveBeenCalledTimes(0);

      // Send a different error type (e.g., NODE_NOT_FOUND = 60)
      ws.simulateMessage(createRemoteError(999, 60, 'Node not found'));
      await jest.advanceTimersByTimeAsync(100);

      // Should still not request credentials for non-auth errors
      expect(credentialsCalled).toHaveBeenCalledTimes(0);

    } finally {
      global.WebSocket = originalWebSocket;
    }
  });
});

describe('Reauthentication - Reauth Response Handling', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should request credentials again when reauth response fails', async () => {
    const originalWebSocket = global.WebSocket;
    const { MockWebSocket, instances } = createMockWebSocketFactory();
    global.WebSocket = MockWebSocket;

    try {
      const credentialsCalled = jest.fn().mockResolvedValue({
        Username: 'testuser',
        Password: 'wrongpassword'
      });

      const notificationListener = {
        credentialsRequested: credentialsCalled
      };

      const client = new studio.api.Client('ws://127.0.0.1:7689', notificationListener, false);

      const rootPromise = client.root();
      await jest.advanceTimersByTimeAsync(10);

      const ws = instances[0];

      // Complete handshake without initial auth
      ws.simulateMessage(createHelloMessage({ compatVersion: 4 }));
      await jest.advanceTimersByTimeAsync(10);

      ws.simulateMessage(createSystemStructureResponse('TestSystem', [
        { name: 'App1', nodeId: 100, isLocal: true, nodeType: CDPNodeType.CDP_APPLICATION }
      ]));
      await jest.advanceTimersByTimeAsync(10);

      await rootPromise;

      // Trigger reauth via AUTH_RESPONSE_EXPIRED
      const newChallenge = new Uint8Array([16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
      ws.simulateMessage(createRemoteError(0, eAUTH_RESPONSE_EXPIRED, 'Session expired', newChallenge));
      await jest.advanceTimersByTimeAsync(200);

      // First reauth credential request
      expect(credentialsCalled).toHaveBeenCalledTimes(1);
      credentialsCalled.mockClear();

      // Server rejects the reauth
      ws.simulateMessage(createReauthResponse(AuthResultCode.eInvalidChallengeResponse, 'Invalid password'));
      await jest.advanceTimersByTimeAsync(200);

      // Should request credentials again after failed reauth
      expect(credentialsCalled).toHaveBeenCalledTimes(1);

    } finally {
      global.WebSocket = originalWebSocket;
    }
  });

  test('should NOT request credentials when reauth succeeds', async () => {
    const originalWebSocket = global.WebSocket;
    const { MockWebSocket, instances } = createMockWebSocketFactory();
    global.WebSocket = MockWebSocket;

    try {
      const credentialsCalled = jest.fn().mockResolvedValue({
        Username: 'testuser',
        Password: 'correctpassword'
      });

      const notificationListener = {
        credentialsRequested: credentialsCalled
      };

      const client = new studio.api.Client('ws://127.0.0.1:7689', notificationListener, false);

      const rootPromise = client.root();
      await jest.advanceTimersByTimeAsync(10);

      const ws = instances[0];

      // Complete handshake without initial auth (no challenge)
      ws.simulateMessage(createHelloMessage({ compatVersion: 4 }));
      await jest.advanceTimersByTimeAsync(10);

      ws.simulateMessage(createSystemStructureResponse('TestSystem', [
        { name: 'App1', nodeId: 100, isLocal: true, nodeType: CDPNodeType.CDP_APPLICATION }
      ]));
      await jest.advanceTimersByTimeAsync(10);

      await rootPromise;

      // No credentials should have been requested yet (no auth required)
      expect(credentialsCalled).toHaveBeenCalledTimes(0);

      // Trigger reauth via AUTH_RESPONSE_EXPIRED
      const newChallenge = new Uint8Array([16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
      ws.simulateMessage(createRemoteError(0, eAUTH_RESPONSE_EXPIRED, 'Session expired', newChallenge));
      await jest.advanceTimersByTimeAsync(200);

      // Reauth credential request
      expect(credentialsCalled).toHaveBeenCalledTimes(1);
      credentialsCalled.mockClear();

      // Server accepts reauth
      ws.simulateMessage(createReauthResponse(AuthResultCode.eGranted, 'Reauthentication successful'));
      await jest.advanceTimersByTimeAsync(200);

      // Should NOT request credentials again after successful reauth
      expect(credentialsCalled).toHaveBeenCalledTimes(0);

    } finally {
      global.WebSocket = originalWebSocket;
    }
  });
});
