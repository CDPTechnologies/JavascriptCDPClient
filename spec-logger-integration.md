# JavaScript CDP Client: Logger Integration — API Spec

## Problem

Connecting to a CDP Logger requires manual discovery boilerplate:

```javascript
const client = new studio.api.Client('host:7689', listener);
client.find("App.CDPLogger").then(logger => {
  logger.subscribeToChildValues("ServerPort", port => {
    const loggerClient = new cdplogger.Client("host:" + port);
    // Now use loggerClient separately...
  });
});
```

This requires knowing the logger node path, the `ServerPort` child convention, extracting the hostname, and managing two independent client lifecycles. The direct WebSocket connection bypasses StudioAPI authentication and is blocked by browsers when the page is served over HTTPS. The logger client is also a separate npm package (`cdplogger-client`) with its own protobuf schema.

## Proposed API Changes

### 1. Bundle logger client into `cdp-client`

The logger client code moves into the `cdp-client` package. Direct construction via `new studio.logger.Client(endpoint)` remains available for cases where the endpoint is already known.

### 2. `client.logger()` auto-discovers via services

New method on `studio.api.Client` (CDP 5.1+):

```javascript
const client = new studio.api.Client('host:7689', listener);
const loggerClient = await client.logger();
// loggerClient is ready to use — requestLoggedNodes(), requestDataPoints(), etc.
```

Both CDPLogger and LogServer register as `websocketproxy` services with `proxy_type: "logserver"` via their shared `ServerRunner` class. The JS client already receives these via `ServicesNotification` and stores them in `availableServices`.

**Behavior:**

- `client.logger()` finds the first service with `proxy_type === 'logserver'` in `availableServices`, creates a service transport via `makeServiceTransport(serviceId)`, and passes it to the logger client. The logger protocol (`DBMessaging.Protobuf.Container`) is tunneled through the StudioAPI WebSocket via `ServiceMessage` — no direct connection to the logger port.
- `client.logger(name)` filters by service name when multiple loggers exist. The service name is the logger's node path (e.g., `'App.CDPLogger'`).
- An optional `timeout` (milliseconds) can be passed to reject if no matching service appears in time.
- `client.loggers()` returns `Promise<Array<{name, metadata}>>` with all currently discovered logger services. Resolves after the first `ServicesNotification` response.
- Returns `Promise<LoggerClient>`. If no matching logger service has been announced yet, the promise waits until one appears via `ServicesNotification`.

**Caching:**

- Repeated calls return the same cached instance.
- A cached logger client whose transport has closed is evicted — the next call triggers fresh discovery.

**Lifecycle:**

- `client.close()` disconnects all cached logger clients, rejects any pending `client.logger()` promises, and clears the cache.
- After `client.close()`, calls on a disconnected logger client reject immediately with `"Client is disconnected"`.
- When the main StudioAPI connection drops, service transports are torn down.

---

## Use Case Examples

### Example 1: Query historical data

```javascript
const studio = require("cdp-client");
const client = new studio.api.Client("127.0.0.1:7689");

const logger = await client.logger();
const limits = await logger.requestLogLimits();
const points = await logger.requestDataPoints(
  ['Temperature', 'Pressure'],
  limits.startS, limits.endS, 200 /* max points */, 0 /* no batch limit */
);
points.forEach(p => {
  const temp = p.value['Temperature'];
  console.log(new Date(p.timestamp * 1000), 'min:', temp.min, 'max:', temp.max);
});
```

### Example 2: Query events

```javascript
const logger = await client.logger();
const events = await logger.requestEvents({
  limit: 100,
  flags: studio.logger.Client.EventQueryFlags.NewestFirst
});
events.forEach(e => console.log(e.sender, e.data.Text));
```

### Example 3: Multiple loggers — select by name

```javascript
const logger = await client.logger('App.CDPLogger');
const logServer = await client.logger('App.MyLogServer');
```

---

## Code Organization

```
JavascriptCDPClient/
  index.js
  studioapi.proto.js
  logger/
    logger-client.js
    container-pb.js
  package.json
```

The logger client constructor is extended to also accept a service transport object. The service transport from `makeServiceTransport` provides the same interface as a WebSocket (`send`, `close`, `onopen`, `onmessage`, `onclose`, `onerror`).

## Migration Notes

No breaking changes. The recommended migration from standalone `cdplogger-client`:

```javascript
// Before (direct connection, no authentication):
const cdplogger = require("cdplogger-client");
const loggerClient = new cdplogger.Client('127.0.0.1:17000');

// After (auto-discovery via proxy, with authentication):
const studio = require("cdp-client");
const client = new studio.api.Client("127.0.0.1:7689", listener);
const loggerClient = await client.logger();
```
