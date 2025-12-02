/**
 * Authentication Flow Tests
 *
 * Tests the authentication flow including:
 * 1. Challenge-based authentication with credentials
 * 2. No-authentication path when Hello has no challenge
 * 3. Auth response handling (granted, denied, blocked)
 * 4. Re-authentication after session expiration
 */

global.WebSocket = require('ws');
const studio = require('../index');
const fakeData = require('./fakeData');

const { protocol } = studio;
const {
  FakeSocket,
  FakeTransport,
  ContainerType,
  AuthResultCode,
  createHelloMessage,
  createAuthResponse
} = fakeData;

describe('Authentication - Hello with Challenge', () => {
  test('should request credentials when Hello contains challenge', async () => {
    const socket = new FakeSocket();
    const credentialsCalled = jest.fn().mockResolvedValue({
      Username: 'testuser',
      Password: 'testpass'
    });

    const notificationListener = {
      applicationAcceptanceRequested: jest.fn().mockResolvedValue(),
      credentialsRequested: credentialsCalled
    };

    const handler = new protocol.Handler(socket, notificationListener);

    // Send Hello with challenge bytes
    const challenge = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    handler.handle(createHelloMessage({
      compatVersion: 4,
      challenge: challenge
    }));

    await new Promise(resolve => setTimeout(resolve, 100));

    // Should have called credentialsRequested
    expect(credentialsCalled).toHaveBeenCalled();
  });

  test('should NOT request credentials when Hello has no challenge', async () => {
    const socket = new FakeSocket();
    const credentialsCalled = jest.fn().mockResolvedValue({
      Username: 'testuser',
      Password: 'testpass'
    });

    const notificationListener = {
      applicationAcceptanceRequested: jest.fn().mockResolvedValue(),
      credentialsRequested: credentialsCalled
    };

    const handler = new protocol.Handler(socket, notificationListener);

    // Send Hello without challenge
    handler.handle(createHelloMessage({ compatVersion: 4 }));

    await new Promise(resolve => setTimeout(resolve, 100));

    // Should NOT have called credentialsRequested
    expect(credentialsCalled).not.toHaveBeenCalled();

    // Should have sent structure request
    expect(socket.sent.length).toBeGreaterThan(0);
  });

  test('should call applicationAcceptanceRequested when systemUseNotification present', async () => {
    const socket = new FakeSocket();
    const acceptanceCalled = jest.fn().mockResolvedValue();

    const notificationListener = {
      applicationAcceptanceRequested: acceptanceCalled,
      credentialsRequested: jest.fn().mockResolvedValue({ Username: 'user', Password: 'pass' })
    };

    const handler = new protocol.Handler(socket, notificationListener);

    // Create Hello with systemUseNotification
    const helloBytes = protocol.Hello.encode(protocol.Hello.create({
      systemName: 'TestSystem',
      applicationName: 'TestApp',
      compatVersion: 4,
      systemUseNotification: 'This is a test system. Usage is logged.'
    })).finish();

    handler.handle(helloBytes);

    await new Promise(resolve => setTimeout(resolve, 100));

    // Should have called applicationAcceptanceRequested
    expect(acceptanceCalled).toHaveBeenCalled();
  });
});

describe('Authentication - Auth Request Creation', () => {
  test('should create auth request with correct structure', async () => {
    const credentials = { Username: 'admin', Password: 'secret123' };
    const challenge = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);

    const authReq = await protocol.CreateAuthRequest(credentials, challenge);

    expect(authReq).toBeDefined();
    expect(authReq.userId).toBe('admin');
    expect(authReq.challengeResponse).toHaveLength(1);
    expect(authReq.challengeResponse[0].type).toBe('PasswordHash');
    expect(authReq.challengeResponse[0].response.byteLength).toBe(32); // SHA-256
  });

  test('should handle unicode username', async () => {
    const credentials = { Username: 'Björk', Password: 'pass' };
    const challenge = new Uint8Array([1, 2, 3, 4]);

    const authReq = await protocol.CreateAuthRequest(credentials, challenge);

    expect(authReq.userId).toBe('björk'); // lowercased
  });

  test('should handle unicode password', async () => {
    const credentials = { Username: 'user', Password: '密码' };
    const challenge = new Uint8Array([1, 2, 3, 4]);

    const authReq = await protocol.CreateAuthRequest(credentials, challenge);

    // Should complete without error
    expect(authReq.challengeResponse[0].response.byteLength).toBe(32);
  });

  test('should handle special characters in password', async () => {
    const credentials = { Username: 'user', Password: '!@#$%^&*(){}[]|\\:";\'<>,.?/' };
    const challenge = new Uint8Array([1, 2, 3, 4]);

    const authReq = await protocol.CreateAuthRequest(credentials, challenge);

    expect(authReq.challengeResponse[0].response.byteLength).toBe(32);
  });
});

describe('Authentication - AuthResultCode handling', () => {
  test('should have eCredentialsRequired code', () => {
    expect(AuthResultCode.eCredentialsRequired).toBe(0);
  });

  test('should have eGranted code', () => {
    expect(AuthResultCode.eGranted).toBe(1);
  });

  test('should have eGrantedPasswordWillExpireSoon code', () => {
    expect(AuthResultCode.eGrantedPasswordWillExpireSoon).toBe(2);
  });

  test('should have eInvalidChallengeResponse code', () => {
    expect(AuthResultCode.eInvalidChallengeResponse).toBe(11);
  });

  test('should have eTemporarilyBlocked code', () => {
    expect(AuthResultCode.eTemporarilyBlocked).toBe(13);
  });

  test('should have eReauthenticationRequired code', () => {
    expect(AuthResultCode.eReauthenticationRequired).toBe(14);
  });
});

describe('Authentication - Missing Credentials Handler', () => {
  test('should log error when no credentialsRequested callback provided', async () => {
    const socket = new FakeSocket();
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    // No credentialsRequested callback
    const notificationListener = {
      applicationAcceptanceRequested: jest.fn().mockResolvedValue()
    };

    const handler = new protocol.Handler(socket, notificationListener);

    // Send Hello with challenge
    const challenge = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    handler.handle(createHelloMessage({ compatVersion: 4, challenge }));

    await new Promise(resolve => setTimeout(resolve, 100));

    // Should have logged error about missing callback
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('No notificationListener.credentialsRequested callback')
    );

    consoleSpy.mockRestore();
  });

  test('should handle null notificationListener', async () => {
    const socket = new FakeSocket();
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const handler = new protocol.Handler(socket, null);

    // Send Hello with challenge - should not crash
    const challenge = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    handler.handle(createHelloMessage({ compatVersion: 4, challenge }));

    await new Promise(resolve => setTimeout(resolve, 100));

    consoleSpy.mockRestore();
    // Should not crash
    expect(socket.closed).toBe(false);
  });
});

describe('Authentication - Request Metadata', () => {
  test('Request object should expose system metadata', async () => {
    const socket = new FakeSocket();
    let receivedRequest = null;

    const notificationListener = {
      applicationAcceptanceRequested: jest.fn().mockResolvedValue(),
      credentialsRequested: (request) => {
        receivedRequest = request;
        return Promise.resolve({ Username: 'user', Password: 'pass' });
      }
    };

    const handler = new protocol.Handler(socket, notificationListener);

    const challenge = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    handler.handle(createHelloMessage({
      systemName: 'MySystem',
      applicationName: 'MyApp',
      compatVersion: 4,
      cdpVersionMajor: 5,
      cdpVersionMinor: 1,
      cdpVersionPatch: 0,
      challenge
    }));

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(receivedRequest).toBeDefined();
    expect(receivedRequest.systemName()).toBe('MySystem');
    expect(receivedRequest.applicationName()).toBe('MyApp');
    expect(receivedRequest.cdpVersion()).toBe('5.1.0');
  });
});

describe('studio.api.UserAuthResult', () => {
  test('should expose code, text, and additionalCredentials', () => {
    const result = new studio.api.UserAuthResult(
      AuthResultCode.eInvalidChallengeResponse,
      'Invalid password',
      { totp: 'required' }
    );

    expect(result.code()).toBe(AuthResultCode.eInvalidChallengeResponse);
    expect(result.text()).toBe('Invalid password');
    expect(result.additionalCredentials()).toEqual({ totp: 'required' });
  });

  test('should handle null additionalCredentials', () => {
    const result = new studio.api.UserAuthResult(
      AuthResultCode.eCredentialsRequired,
      'Please log in',
      null
    );

    expect(result.additionalCredentials()).toBeNull();
  });
});

describe('studio.api.Request', () => {
  test('should expose all request properties', () => {
    const userAuthResult = new studio.api.UserAuthResult(AuthResultCode.eCredentialsRequired, 'Login required', null);
    const request = new studio.api.Request(
      'TestSystem',
      'TestApp',
      '5.1.0',
      'Usage is logged',
      userAuthResult
    );

    expect(request.systemName()).toBe('TestSystem');
    expect(request.applicationName()).toBe('TestApp');
    expect(request.cdpVersion()).toBe('5.1.0');
    expect(request.systemUseNotification()).toBe('Usage is logged');
    expect(request.userAuthResult()).toBe(userAuthResult);
  });

  test('should handle null userAuthResult', () => {
    const request = new studio.api.Request('Sys', 'App', '1.0.0', null, null);

    expect(request.userAuthResult()).toBeNull();
    expect(request.systemUseNotification()).toBeNull();
  });
});

describe('Authentication - End-to-End Auth Response Handling', () => {
  test('should send structure request after receiving eGranted', async () => {
    const socket = new FakeSocket();
    const credentialsCalled = jest.fn().mockResolvedValue({
      Username: 'testuser',
      Password: 'testpass'
    });

    const notificationListener = {
      applicationAcceptanceRequested: jest.fn().mockResolvedValue(),
      credentialsRequested: credentialsCalled
    };

    const handler = new protocol.Handler(socket, notificationListener);

    // Send Hello with challenge
    const challenge = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    handler.handle(createHelloMessage({ compatVersion: 4, challenge }));
    await new Promise(resolve => setTimeout(resolve, 100));

    // Credentials should have been requested
    expect(credentialsCalled).toHaveBeenCalled();

    // Client should have sent AuthRequest (as Hello message)
    expect(socket.sent.length).toBeGreaterThan(0);

    // Now simulate server sending AuthResponse with eGranted
    handler.handle(createAuthResponse(AuthResultCode.eGranted, 'Welcome'));
    await new Promise(resolve => setTimeout(resolve, 100));

    // After eGranted, should have sent more messages (structure request)
    // Note: Auth request is sent as Hello, then after eGranted we get Container messages
    // We can't use getAllSentContainers() because some messages are Hello format
    expect(socket.sent.length).toBeGreaterThanOrEqual(2);
  });

  test('should re-prompt credentials after receiving eInvalidChallengeResponse', async () => {
    const socket = new FakeSocket();
    let callCount = 0;
    const credentialsCalled = jest.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        Username: 'testuser',
        Password: callCount === 1 ? 'wrongpass' : 'correctpass'
      });
    });

    const notificationListener = {
      applicationAcceptanceRequested: jest.fn().mockResolvedValue(),
      credentialsRequested: credentialsCalled
    };

    const handler = new protocol.Handler(socket, notificationListener);

    // Send Hello with challenge
    const challenge = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    handler.handle(createHelloMessage({ compatVersion: 4, challenge }));
    await new Promise(resolve => setTimeout(resolve, 150));

    expect(credentialsCalled).toHaveBeenCalledTimes(1);

    // Simulate server rejecting credentials - need new challenge for re-auth
    const newChallenge = new Uint8Array([9, 10, 11, 12, 13, 14, 15, 16]);
    handler.handle(createAuthResponse(AuthResultCode.eInvalidChallengeResponse, 'Invalid password', newChallenge));
    await new Promise(resolve => setTimeout(resolve, 150));

    // Should have re-prompted for credentials
    expect(credentialsCalled).toHaveBeenCalledTimes(2);
  });

  test('should handle eGrantedPasswordWillExpireSoon as success', async () => {
    const socket = new FakeSocket();
    const credentialsCalled = jest.fn().mockResolvedValue({
      Username: 'testuser',
      Password: 'testpass'
    });

    const notificationListener = {
      applicationAcceptanceRequested: jest.fn().mockResolvedValue(),
      credentialsRequested: credentialsCalled
    };

    const handler = new protocol.Handler(socket, notificationListener);

    // Send Hello with challenge
    const challenge = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    handler.handle(createHelloMessage({ compatVersion: 4, challenge }));
    await new Promise(resolve => setTimeout(resolve, 100));

    // Simulate server sending eGrantedPasswordWillExpireSoon
    handler.handle(createAuthResponse(AuthResultCode.eGrantedPasswordWillExpireSoon, 'Password expires in 7 days'));
    await new Promise(resolve => setTimeout(resolve, 100));

    // Should proceed - more messages sent after auth success
    expect(socket.sent.length).toBeGreaterThanOrEqual(2);
  });
});
