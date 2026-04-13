# JavaScript CDP Client: Multi-App Usability — API Spec

## Problem

1. `client.find('App2.CPULoad')` fails immediately if App2 hasn't started yet. The workaround is to subscribe to structure changes and wait for the app to appear, but this shouldn't be necessary for the common case.

2. `root.subscribeToStructure()` only has ADD and REMOVE. When an app restarts, the user gets another ADD — making it impossible to distinguish a new app from a restarted one without manual tracking.

## Proposed API Changes

### 1. `find()` waits for apps by default

`find()` waits for the target app to appear before resolving. This makes multi-app code identical to the existing single-app pattern — no special handling needed for sibling apps that start later. A default timeout prevents indefinite hangs. Pass `{ timeout: 0 }` to get the old immediate-fail behavior.

```javascript
client.find('App2.CPULoad')                    // waits (default timeout) for App2 to appear
client.find('App2.CPULoad', { timeout: 5000 }) // waits up to 5s
client.find('App2.CPULoad', { timeout: 0 })    // fails immediately if App2 not available (old behavior)
```

- **Default timeout:** `find()` without options waits with a 30s default timeout. If the app doesn't appear in time, the promise rejects with: `"AppName not found within 30000ms"`
- **Immediate resolve:** If the app is already available, `find()` resolves immediately regardless of timeout.
- **Immediate fail:** `{ timeout: 0 }` preserves the old behavior — rejects immediately if the app is not available.
- **No prior `root()` required:** `find()` must trigger the connection internally if not already connected. Callers should not need to call `root()` first.
- **Direct mode guard (immediate fail only):** When using `{ timeout: 0 }` in direct mode (no proxy protocol), `find()` rejects with `"AppName is not available"` if the app was previously connected but is now disconnected. This prevents returning stale cached nodes whose underlying WebSocket is down. When waiting (default), this guard does not apply — the wait resolves when the app reconnects. In proxy mode, the primary connection maintains the node tree so the guard is not needed.
- **Direct mode discovery:** In direct mode, `find()` triggers on-demand structure refreshes (every 2s while waiting) to discover new siblings. In proxy mode, discovery is real-time via `ServicesNotification`.

### 2. `subscribeToStructure` RECONNECT event

New constant `studio.api.structure.RECONNECT = 2` alongside existing ADD (1) and REMOVE (0).

```javascript
studio.api.structure.ADD       // 1 — app appeared for the first time
studio.api.structure.REMOVE    // 0 — app went offline
studio.api.structure.RECONNECT // 2 — app reappeared after being removed (restart)
```

**Lifecycle:**
1. App starts → callback fires with `(appName, ADD)`
2. App stops → callback fires with `(appName, REMOVE)`
3. App restarts → callback fires with `(appName, RECONNECT)` (not ADD)

The client already auto-restores value and event subscriptions when a connection is re-established. RECONNECT tells user code that this happened — so you know you don't have to resubscribe manually. The client tracks `everSeenApps` separately from currently-announced apps. If an app was seen before but was removed, its reappearance fires RECONNECT instead of ADD.

RECONNECT fires in both connection modes:
- **Proxy mode:** Sibling app disappears from proxy services, then reappears — fires REMOVE then RECONNECT.
- **Direct mode:** Direct WebSocket connection drops, then reconnects — fires REMOVE then RECONNECT.

**Direct mode discovery:** Without this change, `subscribeToStructure` in direct mode does not discover apps that start after the subscription — it only sees apps that were already connected. This change adds periodic structure polling (every 2s) while subscribers exist, so that ADD/RECONNECT events fire for late-starting apps in direct mode. In proxy mode, discovery is real-time via `ServicesNotification` so no polling is needed. Polling stops automatically when all subscribers unsubscribe or `client.close()` is called.

- **Backwards compatible for `=== ADD` checks:** Existing code checking `change === studio.api.structure.ADD` still works — new apps still get ADD. Only restarted apps get RECONNECT.
- **Not compatible with `!== ADD` patterns:** Code that treats any non-ADD change as REMOVE (e.g. `if (change !== ADD) handleRemove()`) will incorrectly trigger on RECONNECT. Such code should be updated to check `change === REMOVE` explicitly.

---

## Use Case Examples

### Example 1: Display a value from a late-starting app

The simplest use case — show a value from an app that may not be running yet when the client connects.

```javascript
const studio = require('cdp-client');
const client = new studio.api.Client('127.0.0.1:7689');

// find() waits for App2 to appear (default timeout)
client.find('App2.CPULoad').then(node => {
  node.subscribeToValues((value, timestamp) => {
    console.log('CPULoad:', value);
  });
}).catch(err => console.error(err));
```

### Example 2: Custom timeout

```javascript
// Wait up to 5 seconds for a specific app
client.find('App2.CPULoad', { timeout: 5000 }).then(node => {
  node.subscribeToValues(value => console.log(value));
}).catch(err => console.error(err));
```

### Example 3: Timeout rejection for app that never starts

```javascript
client.find('NonExistentApp.Signal', { timeout: 1000 })
  .catch(err => console.log(err.message)); // "NonExistentApp not found within 1000ms"
```

### Example 4: Immediate fail (old behavior)

```javascript
// timeout: 0 gives the old immediate-reject behavior
client.find('App.NonExistent', { timeout: 0 })
  .catch(err => console.log(err)); // rejects without waiting for the app to appear
```

### Example 5: Monitor app lifecycle (online, offline, restart)

```javascript
const studio = require('cdp-client');
const client = new studio.api.Client('127.0.0.1:7689');

client.root().then(root => {
  // List apps already online
  root.forEachChild(app => console.log(`Already online: ${app.name()}`));

  // Monitor future changes
  root.subscribeToStructure((appName, change) => {
    if (change === studio.api.structure.ADD)
      console.log(`New app online: ${appName}`);
    if (change === studio.api.structure.REMOVE)
      console.log(`App offline: ${appName}`);
    if (change === studio.api.structure.RECONNECT)
      console.log(`App restarted: ${appName}`);
  });
}).catch(err => console.error("Connection failed:", err));
```

### Example 6: Handle app restart without double-subscribing

The main motivation — users shouldn't need to track which apps they've already subscribed to.

```javascript
const studio = require('cdp-client');
const client = new studio.api.Client('127.0.0.1:7689');

function subscribeToApp(appName) {
  client.find(appName + '.CPULoad').then(node => {
    node.subscribeToValues(value => console.log(`${appName} CPU: ${value}`));
  }).catch(err => console.error(`${appName}: ${err}`));
}

client.root().then(root => {
  // Handle apps already online
  root.forEachChild(app => subscribeToApp(app.name()));

  // Handle future changes (not called for apps already online when subscribing)
  root.subscribeToStructure((appName, change) => {
    if (change === studio.api.structure.ADD) {
      subscribeToApp(appName);
    }
    if (change === studio.api.structure.RECONNECT) {
      // App restarted — subscriptions are auto-restored by the client
      console.log(`${appName} restarted, subscriptions intact`);
    }
    if (change === studio.api.structure.REMOVE) {
      console.log(`${appName} went offline`);
    }
  });
}).catch(err => console.error("Connection failed:", err));
```

### Example 7: Backwards-compatible single-app pattern (unchanged)

For users connecting to a single app, nothing changes:

```javascript
const studio = require('cdp-client');
const client = new studio.api.Client('127.0.0.1:7689');
client.find('App.CPULoad').then(node => {
  node.subscribeToValues(value => console.log(value));
}).catch(err => console.error("Connection failed:", err));
```

---

## Summary of Changes

| Change | Default Behavior | Escape Hatch |
|--------|-----------------|--------------|
| `find()` waits for apps | Waits with default timeout | `{ timeout: 0 }` for immediate fail |
| `studio.api.structure.RECONNECT` | Fires on app reappearance after REMOVE | N/A — additive constant |

## Relationship to Other StudioAPI Clients

### Java client — direct precedent for RECONNECT

The Java StudioAPI client's `SubtreeChangeType` enum (`SubtreeChangeType.java`) has four values:

```java
eChildRemoved,              // ≈ JS REMOVE
eChildAdded,                // ≈ JS ADD
eSubscribedNodeLost,        // connection to app lost (fires recursively on subtree)
eSubscribedNodeReconnected  // ≈ JS RECONNECT
```

`eSubscribedNodeReconnected` was added to solve the same problem — before it existed, a reconnected app fired `eChildAdded` and there was no way to tell whether it already had listeners or was a new node. The JS client's `RECONNECT` event is a direct analog.

The Java client's `find()` does not wait for apps to start — it resolves from the cached tree or fetches structure once, but does not retry or poll for late-starting apps. The recommended multi-app pattern is `addSubtreeListener` on root to react to `eChildAdded`.

### C++ client — node-level sub-types

The C++ StudioAPI client distinguishes sub-types within ADD and REMOVE at the node level:

- **OpenExisting** — node already existed when the connection was established
- **CreateNew** — node appeared during runtime (after initial structure was fetched)
- **Close** — node removed because the connection was lost
- **Delete** — node was permanently deleted during runtime

This was needed for node-level changes within an app — distinguishing whether a node disappeared because the connection was lost (Close) or because it was permanently deleted during runtime (Delete).

These sub-types operate on nodes within an app's tree. The JS client's `subscribeToStructure` operates at the app level — apps start and stop as processes, so the OpenExisting/CreateNew and Close/Delete distinctions don't apply. If sub-node structure events are needed in the future, that would be a separate API.

### Design rationale

No other StudioAPI client's `find()` waits for apps to start — in the C++, Java, and Python clients, `find()` resolves from the cached tree or fetches structure on demand, but does not retry or poll for late-starting apps. The JS client's waiting `find()` is a new convenience that avoids requiring the event-driven discovery pattern for the common case.

The integer-constant design (`ADD=1, REMOVE=0, RECONNECT=2`) leaves room for future values without breaking existing code.

## Migration Notes

**`find()` no longer fails fast by default.** Code that uses `find()` to probe for optional apps (e.g. `find('OptionalApp.Signal').catch(() => { /* skip */ })`) will now wait up to 30s before the catch fires. Use `{ timeout: 0 }` to preserve the old immediate-fail behavior:

```javascript
// Old: relied on fast failure
client.find('MaybeApp.Signal').catch(() => { /* not available */ });

// New: use timeout: 0 for the same behavior
client.find('MaybeApp.Signal', { timeout: 0 }).catch(() => { /* not available */ });
```