/**
 * Timesync tests
 *
 * Verify the periodic timesync feature:
 * 1. Default OFF — no eCurrentTimeRequest is emitted unless opt-in.
 * 2. Opt-in via `options.enableTimeSync: true` — request emitted on connect.
 * 3. Algorithm: 3 samples, min-RTT selection, delta = packetReceived -
 *    (remoteTime + RTT/2). Sign convention: delta negative when server is
 *    systematically ahead of client.
 * 4. Apply: incoming value timestamps are adjusted by the stored delta
 *    before reaching user callbacks; no-op when delta is 0. Event
 *    timestamps are NOT adjusted — they are the resume token sent back
 *    via subscribeToEvents(startingFrom) in the server's clock domain.
 * 5. Lifecycle: timer cleared on disconnect; samples cleared.
 * 6. Same-host sharing: a second AppConnection to the same host inherits
 *    the last-known delta without re-sampling; other hosts do not.
 */

global.WebSocket = require('ws');
const studio = require('../index');
const fakeData = require('./fakeData');

const { protocol, internal } = studio;
const {
  createHelloMessage,
  createSystemStructureResponse,
  createMockWebSocketFactory,
} = fakeData;

const ContainerType = protocol.ContainerType;

function encodeTimesyncResponse(remoteTimeNs) {
  return protocol.Container.encode(protocol.Container.create({
    messageType: ContainerType.eCurrentTimeResponse,
    currentTimeResponse: remoteTimeNs,
  })).finish();
}

async function tick(ms) {
  await jest.advanceTimersByTimeAsync(ms);
}

// Wire spy: every time an eCurrentTimeRequest is sent out, capture
// Date.now() — that's the sample's packetSent. Lets tests deterministically
// place a server response at any RTT relative to each per-sample send time
// without having to track timing externally.
function spyTimesyncSends(MockWebSocket) {
  const sendTimes = [];
  const origSend = MockWebSocket.prototype.send;
  MockWebSocket.prototype.send = function(buf) {
    try {
      const c = protocol.Container.decode(new Uint8Array(buf));
      if (c.messageType === ContainerType.eCurrentTimeRequest) {
        sendTimes.push(Date.now());
      }
    } catch (_) { /* non-container frames during handshake */ }
    return origSend.call(this, buf);
  };
  return sendTimes;
}

// Set up an AppConnection with the handler chain advanced past
// HelloHandler — required for any test that wants to deliver Container-
// typed messages. The first eCurrentTimeRequest is in flight by the time
// this returns: handleIncomingContainer fires _initTimesync on its first
// metadata-bearing container (the SystemStructureResponse simulated here —
// Hello itself is consumed by HelloHandler).
async function openAppConnection(options, hostDeltaCache) {
  const { MockWebSocket, instances } = createMockWebSocketFactory();
  global.WebSocket = MockWebSocket;
  const sendTimes = spyTimesyncSends(MockWebSocket);
  const app = new internal.AppConnection('ws://test-host:1234', null, false, options || {}, hostDeltaCache);
  const ws = instances[0];
  await tick(10);
  ws.simulateMessage(createHelloMessage({ compatVersion: 4 }));
  await tick(10);
  ws.simulateMessage(createSystemStructureResponse('TestSystem'));
  await tick(10);
  return { app, ws, instances, sendTimes };
}

// Drive `sampleSpecs.length` timesync responses, one per spec. Each spec
// describes the round trip for the NEXT in-flight sample: how long the
// network takes (`rttMs`) and how far ahead the server clock is at the
// midpoint of that round trip (`serverSkewMs`).
async function driveCycle(ws, sendTimes, sampleSpecs) {
  for (let i = 0; i < sampleSpecs.length; i++) {
    const { rttMs, serverSkewMs } = sampleSpecs[i];
    const tSendMs = sendTimes[i];
    // Advance the fake clock (Date.now and the client's monotonic source move
    // in lockstep) to the receive moment rttMs after this sample's send.
    await tick(Math.max(0, tSendMs + rttMs - Date.now()));
    const midpointMs = tSendMs + rttMs / 2;
    const remoteTimeNs = (midpointMs + serverSkewMs) * 1e6;
    ws.simulateMessage(encodeTimesyncResponse(remoteTimeNs));
    await tick(0);
  }
}

describe('Timesync — opt-in gating', () => {
  let originalWebSocket;
  beforeEach(() => {
    jest.useFakeTimers();
    originalWebSocket = global.WebSocket;
  });
  afterEach(() => {
    global.WebSocket = originalWebSocket;
    jest.useRealTimers();
  });

  test('default off: no eCurrentTimeRequest emitted when option is omitted', async () => {
    const { app, ws } = await openAppConnection();
    const timesyncReqs = ws.getAllSentContainers()
      .filter(c => c.messageType === ContainerType.eCurrentTimeRequest);
    expect(timesyncReqs.length).toBe(0);
    app.close();
  });

  test('default off: no eCurrentTimeRequest when option is enableTimeSync: false', async () => {
    const { app, ws } = await openAppConnection({ enableTimeSync: false });
    const timesyncReqs = ws.getAllSentContainers()
      .filter(c => c.messageType === ContainerType.eCurrentTimeRequest);
    expect(timesyncReqs.length).toBe(0);
    app.close();
  });

  test('opt-in: eCurrentTimeRequest emitted on connect when enableTimeSync: true', async () => {
    const { app, ws } = await openAppConnection({ enableTimeSync: true });
    const timesyncReqs = ws.getAllSentContainers()
      .filter(c => c.messageType === ContainerType.eCurrentTimeRequest);
    expect(timesyncReqs.length).toBe(1);
    app.close();
  });
});

describe('Timesync — public Client entry point', () => {
  let originalWebSocket;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    originalWebSocket = global.WebSocket;
  });
  afterEach(() => {
    global.WebSocket = originalWebSocket;
    jest.useRealTimers();
  });

  // Drive the documented entry point end-to-end: Client -> SystemNode ->
  // AppConnection. KILL TEST: dropping the options pass-through anywhere on
  // that chain silently disables the feature for every real caller while all
  // direct-construction tests stay green.
  async function openClient(options) {
    const { MockWebSocket, instances } = createMockWebSocketFactory();
    global.WebSocket = MockWebSocket;
    const client = options === undefined
      ? new studio.api.Client('127.0.0.1:7689', null, false)
      : new studio.api.Client('127.0.0.1:7689', null, false, options);
    client.root().catch(() => { /* resolves on connect; close() may reject it */ });
    await tick(10); // root() creates the primary AppConnection
    const ws = instances[0];
    ws.simulateMessage(createHelloMessage({ compatVersion: 4 }));
    await tick(10);
    ws.simulateMessage(createSystemStructureResponse('TestSystem'));
    await tick(10);
    return { client, ws };
  }

  test('enableTimeSync passed to studio.api.Client reaches the wire', async () => {
    const { client, ws } = await openClient({ enableTimeSync: true });
    const timesyncReqs = ws.getAllSentContainers()
      .filter(c => c.messageType === ContainerType.eCurrentTimeRequest);
    expect(timesyncReqs.length).toBe(1);
    client.close();
  });

  test('a Client constructed without options stays timesync-off', async () => {
    const { client, ws } = await openClient(undefined);
    const timesyncReqs = ws.getAllSentContainers()
      .filter(c => c.messageType === ContainerType.eCurrentTimeRequest);
    expect(timesyncReqs.length).toBe(0);
    client.close();
  });
});

describe('Timesync — algorithm and sign convention', () => {
  let originalWebSocket;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    originalWebSocket = global.WebSocket;
  });
  afterEach(() => {
    global.WebSocket = originalWebSocket;
    jest.useRealTimers();
  });

  test('delta is exactly -15s when server is systematically 15s ahead', async () => {
    const { app, ws, sendTimes } = await openAppConnection({ enableTimeSync: true });
    await driveCycle(ws, sendTimes, [
      { rttMs: 50, serverSkewMs: 15000 },
      { rttMs: 70, serverSkewMs: 15000 },
      { rttMs: 60, serverSkewMs: 15000 },
    ]);
    // For server systematically 15s ahead, delta is exactly -15s.
    // The RTT/2 adjustment cancels the in-flight latency so the answer
    // is independent of the per-sample RTT.
    expect(app._timestampDeltaNs()).toBe(-15 * 1e9);
    app.close();
  });

  test('delta is zero when server clock equals midpoint of every RTT', async () => {
    const { app, ws, sendTimes } = await openAppConnection({ enableTimeSync: true });
    await driveCycle(ws, sendTimes, [
      { rttMs: 50, serverSkewMs: 0 },
      { rttMs: 70, serverSkewMs: 0 },
      { rttMs: 60, serverSkewMs: 0 },
    ]);
    expect(app._timestampDeltaNs()).toBe(0);
    app.close();
  });

  test('selection picks the sample with the smallest RTT (not the smallest offset value)', async () => {
    const { app, ws, sendTimes } = await openAppConnection({ enableTimeSync: true });
    // Vary BOTH rttMs and serverSkewMs per sample so each candidate sample
    // would produce a distinguishable computed delta. Then min-RTT vs any
    // other selection rule lands on a different number, so the assertion
    // mutation-tests the rule rather than the constant skew.
    // Skews stay within the cycle-consistency bound (offsets agree within the
    // samples' RTTs) so only the selection rule differentiates the outcome:
    //
    //   sample 0: rtt=50ms, skew=10ms → delta = -10 * 1e6 ns
    //   sample 1: rtt=20ms, skew=40ms → delta = -40 * 1e6 ns  (min-RTT winner)
    //   sample 2: rtt=70ms, skew=25ms → delta = -25 * 1e6 ns
    //
    // min-RTT (correct)        → -40 * 1e6
    // min-offset (wrong rule)  → -10 * 1e6 (sample 0)
    // max-RTT (wrong rule)     → -25 * 1e6 (sample 2)
    // first/last (wrong rules) → -10 * 1e6 / -25 * 1e6
    await driveCycle(ws, sendTimes, [
      { rttMs: 50, serverSkewMs: 10 },
      { rttMs: 20, serverSkewMs: 40 },
      { rttMs: 70, serverSkewMs: 25 },
    ]);
    expect(app._timestampDeltaNs()).toBe(-40 * 1e6);
    app.close();
  });
});

describe('Timesync — apply to incoming timestamps', () => {
  let originalWebSocket;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    originalWebSocket = global.WebSocket;
  });
  afterEach(() => {
    global.WebSocket = originalWebSocket;
    jest.useRealTimers();
  });

  test('applyTimestampDelta is a no-op when timesync is disabled (default off)', async () => {
    const { app } = await openAppConnection();
    expect(app.applyTimestampDelta(1234567890)).toBe(1234567890);
    expect(app.applyTimestampDelta(null)).toBe(null);
    expect(app.applyTimestampDelta(undefined)).toBe(undefined);
    app.close();
  });

  test('applyTimestampDelta passes an absent timestamp through when timesync is ENABLED', async () => {
    // A value frame may omit its timestamp; receiveValue passes it through
    // unconditionally. KILL TEST: without the null guard, Long.fromValue
    // throws on undefined/null on the enabled path (the disabled-path test
    // above never reaches it).
    const { app, ws, sendTimes } = await openAppConnection({ enableTimeSync: true });
    await driveCycle(ws, sendTimes, [
      { rttMs: 40, serverSkewMs: 5000 },
      { rttMs: 40, serverSkewMs: 5000 },
      { rttMs: 40, serverSkewMs: 5000 },
    ]);
    expect(app._timestampDeltaNs()).toBe(-5 * 1e9); // delta armed, apply path live
    expect(app.applyTimestampDelta(undefined)).toBe(undefined);
    expect(app.applyTimestampDelta(null)).toBe(null);
    app.close();
  });

  test('applyTimestampDelta subtracts a server-ahead skew (sign verified at apply site)', async () => {
    const { app, ws, sendTimes } = await openAppConnection({ enableTimeSync: true });
    await driveCycle(ws, sendTimes, [
      { rttMs: 40, serverSkewMs: 5000 },
      { rttMs: 40, serverSkewMs: 5000 },
      { rttMs: 40, serverSkewMs: 5000 },
    ]);
    expect(app._timestampDeltaNs()).toBe(-5 * 1e9);
    // server_event_ts + (-5e9) = client_clock equivalent. Result is a Long
    // (the "long int" value-callback contract); compare by value.
    const serverEventNs = 100_000_000_000;
    expect(app.applyTimestampDelta(serverEventNs).toString()).toBe(String(serverEventNs - 5e9));
    app.close();
  });

  test('full-resolution epoch timestamp keeps int64 precision (no Number() rounding)', async () => {
    const Long = require('protobufjs').util.Long;
    const { app, ws, sendTimes } = await openAppConnection({ enableTimeSync: true });
    await driveCycle(ws, sendTimes, [
      { rttMs: 40, serverSkewMs: 5000 },
      { rttMs: 40, serverSkewMs: 5000 },
      { rttMs: 40, serverSkewMs: 5000 },
    ]);
    expect(app._timestampDeltaNs()).toBe(-5 * 1e9);
    // A real server value timestamp is an unsigned uint64 Long at full nanosecond
    // resolution. KILL TEST: a `Number(ts) + delta` implementation rounds 1748000000123456789
    // past 2^53 to ...800; int64/Long arithmetic must preserve every digit.
    const serverTs = Long.fromString('1748000000123456789', true); // unsigned uint64
    const adjusted = app.applyTimestampDelta(serverTs);
    expect(adjusted.toString()).toBe('1747999995123456789');         // exact (int64)
    expect(adjusted.toString()).not.toBe('1747999995123456800');     // the lossy double result
    app.close();
  });

  test('a zero/absent timestamp is left unshifted, not underflowed', async () => {
    const Long = require('protobufjs').util.Long;
    const { app, ws, sendTimes } = await openAppConnection({ enableTimeSync: true });
    await driveCycle(ws, sendTimes, [
      { rttMs: 40, serverSkewMs: 5000 },
      { rttMs: 40, serverSkewMs: 5000 },
      { rttMs: 40, serverSkewMs: 5000 },
    ]);
    expect(app._timestampDeltaNs()).toBe(-5 * 1e9);
    // A value with no source timestamp decodes to an unsigned uint64 Long(0).
    // KILL TEST: without the zero guard, Long(0).add(-5e9) underflows the
    // unsigned Long to ~2^64; the guard must return it unshifted (0).
    const absentTs = Long.fromString('0', true); // unsigned uint64 zero
    const out = app.applyTimestampDelta(absentTs);
    expect(out.toString()).toBe('0');
    app.close();
  });

  test('a value timestamp smaller than |delta| stays signed (client clock behind server), not underflowed', async () => {
    const Long = require('protobufjs').util.Long;
    const { app, ws, sendTimes } = await openAppConnection({ enableTimeSync: true });
    await driveCycle(ws, sendTimes, [
      { rttMs: 40, serverSkewMs: 5000 },
      { rttMs: 40, serverSkewMs: 5000 },
      { rttMs: 40, serverSkewMs: 5000 },
    ]);
    expect(app._timestampDeltaNs()).toBe(-5 * 1e9);
    // When the client clock is behind the server, |delta| can exceed a value's
    // timestamp (degenerate here: ts=1e9 < |delta|=5e9). KILL TEST: unsigned-Long
    // arithmetic underflows 1e9 + (-5e9) to 18446744069709551616 (~2^64); signed
    // int64 must yield the correct -4e9.
    const ts = Long.fromString('1000000000', true); // unsigned uint64, < |delta|
    const out = app.applyTimestampDelta(ts);
    expect(out.toString()).toBe('-4000000000');
    expect(out.toString()).not.toBe('18446744069709551616');
    app.close();
  });
});

describe('Timesync — lifecycle', () => {
  let originalWebSocket;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    originalWebSocket = global.WebSocket;
  });
  afterEach(() => {
    global.WebSocket = originalWebSocket;
    jest.useRealTimers();
  });

  test('periodic refresh fires after the configured period', async () => {
    const { app, ws, sendTimes } = await openAppConnection({ enableTimeSync: true });
    await driveCycle(ws, sendTimes, [
      { rttMs: 20, serverSkewMs: 5000 },
      { rttMs: 20, serverSkewMs: 5000 },
      { rttMs: 20, serverSkewMs: 5000 },
    ]);
    const firstCycleCount = sendTimes.length;
    expect(firstCycleCount).toBe(3);
    // Advance well past the 10s period to let the next cycle fire.
    await tick(10001);
    expect(sendTimes.length).toBeGreaterThan(firstCycleCount);
    app.close();
  });

  test('timeSyncPeriodSec sets the refresh period (a 5s period refreshes before the 10s default would)', async () => {
    const { app, ws, sendTimes } = await openAppConnection({ enableTimeSync: true, timeSyncPeriodSec: 5 });
    await driveCycle(ws, sendTimes, [
      { rttMs: 20, serverSkewMs: 0 },
      { rttMs: 20, serverSkewMs: 0 },
      { rttMs: 20, serverSkewMs: 0 },
    ]);
    const firstCycleCount = sendTimes.length;
    expect(firstCycleCount).toBe(3);
    // Advance ~6s: past the 5s option period, short of the 10s default.
    // KILL TEST: if timeSyncPeriodSec were ignored, no new request fires at 6s.
    await tick(6000);
    expect(sendTimes.length).toBeGreaterThan(firstCycleCount);
    app.close();
  });

  test('close() stops the timer; no further timesync requests are emitted', async () => {
    const { app, sendTimes } = await openAppConnection({ enableTimeSync: true });
    const reqsBeforeClose = sendTimes.length;
    expect(app._timesyncTimerActive()).toBe(true);
    app.close();
    // Mutation-killing assertion: the interval handle has actually been
    // cleared. sendTimes.length alone cannot distinguish 'timer stopped'
    // from 'timer still scheduled but a post-close tick failed to register a
    // send' — so assert the interval handle is cleared directly.
    expect(app._timesyncTimerActive()).toBe(false);
    await tick(120000); // well past several 10s periods
    expect(sendTimes.length).toBe(reqsBeforeClose);
  });
});

describe('Timesync — same-host cross-connection sharing', () => {
  let originalWebSocket;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    originalWebSocket = global.WebSocket;
  });
  afterEach(() => {
    global.WebSocket = originalWebSocket;
    jest.useRealTimers();
  });

  test('AppConnections sharing the same host-cache (SystemNode contract) inherit the delta; different cache or different host does not', async () => {
    // In production SystemNode owns this Map and threads the same reference
    // to every AppConnection it constructs. Mirror that here by sharing one
    // Map across app1+app2 and giving app3 a fresh one.
    const sharedCache = new Map();
    const { app: app1, ws: ws1, sendTimes: sendTimes1 } =
      await openAppConnection({ enableTimeSync: true }, sharedCache);
    await driveCycle(ws1, sendTimes1, [
      { rttMs: 30, serverSkewMs: 7000 },
      { rttMs: 30, serverSkewMs: 7000 },
      { rttMs: 30, serverSkewMs: 7000 },
    ]);
    expect(app1._timestampDeltaNs()).toBe(-7 * 1e9);

    // Same host, same shared cache → inherit on _initTimesync (the
    // post-handshake hook that production wires from handleIncomingContainer
    // for both primary and proxy connections). Keys are host-only (the clock
    // offset is per-machine), so the port is dropped.
    const app2 = new internal.AppConnection('ws://test-host:1234', null, false, { enableTimeSync: true }, sharedCache);
    app2._initTimesync('test-host');
    expect(app2._timestampDeltaNs()).toBe(-7 * 1e9);

    // Different host, same shared cache → no entry → no inheritance.
    const app3 = new internal.AppConnection('ws://other-host:5678', null, false, { enableTimeSync: true }, sharedCache);
    app3._initTimesync('other-host');
    expect(app3._timestampDeltaNs()).toBe(0);

    // Same host, DIFFERENT (independent) cache → the second SystemNode's
    // AppConnection should NOT see app1's delta. Independent caches = no
    // cross-Client sharing.
    const independentCache = new Map();
    const app4 = new internal.AppConnection('ws://test-host:1234', null, false, { enableTimeSync: true }, independentCache);
    app4._initTimesync('test-host');
    expect(app4._timestampDeltaNs()).toBe(0);

    app1.close();
    app2.close();
    app3.close();
    app4.close();
  });
});

describe('Timesync — post-handshake gating', () => {
  let originalWebSocket;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    originalWebSocket = global.WebSocket;
  });
  afterEach(() => {
    global.WebSocket = originalWebSocket;
    jest.useRealTimers();
  });

  test('no eCurrentTimeRequest is emitted before the post-handshake transition (would race the auth state machine)', async () => {
    const { MockWebSocket, instances } = createMockWebSocketFactory();
    global.WebSocket = MockWebSocket;
    const sendTimes = spyTimesyncSends(MockWebSocket);
    const app = new internal.AppConnection('ws://test-host:1234', null, false, { enableTimeSync: true });
    const ws = instances[0];
    // Phase A: nothing on the wire yet. If timesync were started
    // from raw onOpen, sendTimes would already be non-empty.
    await tick(50);
    expect(sendTimes.length).toBe(0);
    // Phase B: Hello arrives but is processed by HelloHandler (not by
    // handleIncomingContainer). The chain switches to ContainerHandler
    // after Hello completes, but the post-handshake site only fires when
    // ContainerHandler dispatches its first container with metadata.
    ws.simulateMessage(createHelloMessage({ compatVersion: 4 }));
    await tick(10);
    expect(sendTimes.length).toBe(0);
    // Phase C: first container after Hello triggers handleIncomingContainer's
    // post-handshake branch → _initTimesync → first eCurrentTimeRequest.
    ws.simulateMessage(createSystemStructureResponse('TestSystem'));
    await tick(10);
    expect(sendTimes.length).toBe(1);
    app.close();
  });
});

describe('Timesync — event-timestamp resume-token contract', () => {
  let originalWebSocket;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    originalWebSocket = global.WebSocket;
  });
  afterEach(() => {
    global.WebSocket = originalWebSocket;
    jest.useRealTimers();
  });

  // Encode a Container carrying a single EventInfo targeted at the system
  // node (nodeId 0, registered in nodeMap during the handshake).
  function encodeEventResponse(nodeIds, id, timestampNs) {
    return protocol.Container.encode(protocol.Container.create({
      messageType: ContainerType.eEventResponse,
      eventResponse: [{
        nodeId: nodeIds,
        id: id,
        timestamp: timestampNs,
      }],
    })).finish();
  }

  test('event subscriber observes unshifted server-clock timestamp; value subscriber observes shifted', async () => {
    const { app, ws, sendTimes } = await openAppConnection({ enableTimeSync: true });
    await driveCycle(ws, sendTimes, [
      { rttMs: 40, serverSkewMs: 5000 },
      { rttMs: 40, serverSkewMs: 5000 },
      { rttMs: 40, serverSkewMs: 5000 },
    ]);
    expect(app._timestampDeltaNs()).toBe(-5 * 1e9);

    // ---- Event path: subscribe, deliver an eEventResponse Container over
    // the fake socket, observe what the subscriber callback actually sees.
    // Wire path: handleIncomingContainer -> parseEventResponse ->
    // systemNode.receiveEvent -> sub.callback. If a future commit adds
    // applyTimestampDelta into receiveEvent's dispatch, the callback
    // observes T_event - 5e9 and this assertion fails.
    const eventReceived = [];
    app.root().async.subscribeToEvents(function(event) {
      eventReceived.push(event);
    }, 0);
    const T_event = 100_000_000_000;
    ws.simulateMessage(encodeEventResponse([0], 1234, T_event));
    await tick(0);
    expect(eventReceived.length).toBe(1);
    expect(Number(eventReceived[0].timestamp)).toBe(T_event);

    // ---- Value path companion: same dispatch surface, opposite contract.
    // The apply primitive is wired into the value dispatch site, so a
    // hypothetical mutation that stripped apply from BOTH paths is caught.
    const valueReceived = [];
    app.root().async.subscribeToValues(function(value, timestamp) {
      valueReceived.push({ value: value, timestamp: timestamp });
    }, 5, 0);
    const T_value = 200_000_000_000;
    app.root().receiveValue(42.5, T_value);
    expect(valueReceived.length).toBe(1);
    expect(valueReceived[0].value).toBe(42.5);
    expect(valueReceived[0].timestamp.toString()).toBe(String(T_value - 5e9));

    app.close();
  });
});

describe('Timesync — malformed CurrentTimeResponse handling', () => {
  let originalWebSocket;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    originalWebSocket = global.WebSocket;
  });
  afterEach(() => {
    global.WebSocket = originalWebSocket;
    jest.useRealTimers();
  });

  function encodeMalformedTimesyncResponse() {
    // messageType=eCurrentTimeResponse but currentTimeResponse field absent.
    // protobufjs proto2 optional uint64 falls through to Long(0) on the
    // prototype when accessed; the guard at the dispatch site must drop
    // the in-flight sample instead of recording remoteTime=0.
    return protocol.Container.encode(protocol.Container.create({
      messageType: ContainerType.eCurrentTimeResponse,
    })).finish();
  }

  test('malformed response as the COMPLETING sample does not poison the delta (guard kill-test)', async () => {
    const sharedCache = new Map();
    const { app, ws, sendTimes } = await openAppConnection({ enableTimeSync: true }, sharedCache);
    // Drive the first two samples as good responses (server 5s ahead, RTT
    // 80ms). After the second response the client emits the third request,
    // which is now in flight.
    await driveCycle(ws, sendTimes, [
      { rttMs: 80, serverSkewMs: 5000 },
      { rttMs: 80, serverSkewMs: 5000 },
    ]);
    // The third (cycle-completing) sample arrives MALFORMED, and we give it
    // the SMALLEST round-trip-time of the three. This is the mutation kill:
    // with the presence guard the malformed completing sample is dropped, the
    // cycle never completes, and the delta stays 0. Without the guard,
    // remoteTime defaults to 0, the cycle completes with three samples,
    // min-RTT selection picks this 10ms sample (the smallest), and the delta
    // is computed from a zero remote time — a large, non-zero, poisoned value.
    const thirdSendMs = sendTimes[2];
    await tick(Math.max(0, thirdSendMs + 10 - Date.now()));
    ws.simulateMessage(encodeMalformedTimesyncResponse());
    await tick(0);
    expect(app._timestampDeltaNs()).toBe(0);
    expect(sharedCache.has('test-host')).toBe(false);
    app.close();
  });

  test('a response with no request in flight is ignored (idle between cycles)', async () => {
    const errorSpy = jest.spyOn(console, 'error');
    const { app, ws, sendTimes } = await openAppConnection({ enableTimeSync: true });
    await driveCycle(ws, sendTimes, [
      { rttMs: 40, serverSkewMs: 5000 },
      { rttMs: 40, serverSkewMs: 5000 },
      { rttMs: 40, serverSkewMs: 5000 },
    ]);
    expect(app._timestampDeltaNs()).toBe(-5 * 1e9);
    const requestsAfterCycle = sendTimes.length;
    // Samples are empty until the next interval tick. KILL TEST: without the
    // no-request guard, a duplicate/late response here dereferences samples[-1]
    // and the throw is only contained by the message queue's catch-all, which
    // reports it via console.error ("Handler error:").
    ws.simulateMessage(encodeTimesyncResponse((Date.now() + 5000) * 1e6));
    await tick(0);
    expect(app._timestampDeltaNs()).toBe(-5 * 1e9); // unchanged
    expect(sendTimes.length).toBe(requestsAfterCycle); // no re-emit triggered
    expect(errorSpy).not.toHaveBeenCalled(); // dropped cleanly, not via the catch-all
    errorSpy.mockRestore();
    app.close();
  });
});

describe('Timesync — post-handshake re-arm on reconnect', () => {
  let originalWebSocket;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    originalWebSocket = global.WebSocket;
  });
  afterEach(() => {
    global.WebSocket = originalWebSocket;
    jest.useRealTimers();
  });

  // Kill-test for the reconnect-gating concern: handleIncomingContainer
  // gates the first eCurrentTimeRequest on `!currentMetadata && metadata`.
  // If currentMetadata were not reset on disconnect, the branch would be
  // permanently gated after the first handshake and the keep-alive timer
  // would never re-arm — the connection would silently lose its timesync /
  // keep-alive across every reconnect. Reset site is cleanupPrimaryConnectionState
  // (sets currentMetadata = null), called from onClosed before scheduleReconnect.
  test('second handshake after disconnect re-fires _initTimesync (new eCurrentTimeRequest + timer re-armed)', async () => {
    const { MockWebSocket, instances } = createMockWebSocketFactory();
    global.WebSocket = MockWebSocket;
    const sendTimes = spyTimesyncSends(MockWebSocket);

    // autoConnect=true is required so scheduleReconnect actually reconnects
    // after onClosed fires.
    const app = new internal.AppConnection('ws://test-host:1234', null, true, { enableTimeSync: true });
    const ws1 = instances[0];
    await tick(10);

    // First handshake — Hello completes HelloHandler, the next container
    // (SystemStructure) is the first one routed through ContainerHandler
    // and trips handleIncomingContainer's post-handshake branch.
    ws1.simulateMessage(createHelloMessage({ compatVersion: 4 }));
    await tick(10);
    ws1.simulateMessage(createSystemStructureResponse('TestSystem'));
    await tick(10);

    expect(sendTimes.length).toBe(1);
    expect(app._timesyncTimerActive()).toBe(true);
    const reqsAfterFirstHandshake = sendTimes.length;

    // Force a non-intentional socket close. cleanupPrimaryConnectionState
    // runs from onClosed and resets currentMetadata to null — this is the
    // precondition the post-handshake branch needs to re-fire.
    ws1.closed = true;
    ws1.readyState = 3;
    ws1.onclose({ code: 1006, reason: 'Connection lost' });

    // stopTimesync() was called inside cleanupPrimaryConnectionState; the
    // periodic timer must be cleared during the disconnect window.
    expect(app._timesyncTimerActive()).toBe(false);

    // Advance past INITIAL_RECONNECT_DELAY_MS (1000ms) + max jitter (±20%);
    // 3000ms matches the existing reconnect tests' margin.
    await tick(3000);

    // scheduleReconnect's setTimeout body called socketTransport.reconnect()
    // which constructed a new WebSocket — the factory pushes it onto `instances`.
    expect(instances.length).toBe(2);
    const ws2 = instances[1];

    // Fire the new socket's onopen the same way the existing reconnect
    // tests do (the factory's auto-open setTimeout may also have fired
    // during the 3000ms advance; a duplicate onOpen is safe to repeat here —
    // it re-runs the transportAlive/backoff resets, stall detection and
    // resubscribe, and onReconnected is unset in this test).
    ws2.readyState = 1;
    ws2.onopen({});
    await tick(10);

    // Second handshake on the new socket. The post-handshake branch
    // (!currentMetadata && metadata) must fire again because
    // cleanupPrimaryConnectionState reset currentMetadata to null on close.
    ws2.simulateMessage(createHelloMessage({ compatVersion: 4 }));
    await tick(10);
    ws2.simulateMessage(createSystemStructureResponse('TestSystem'));
    await tick(10);

    // Wire-level kill assertion: a NEW eCurrentTimeRequest was emitted on
    // the second handshake. If currentMetadata were not reset on disconnect,
    // the branch would stay gated and sendTimes.length would still equal
    // reqsAfterFirstHandshake.
    expect(sendTimes.length).toBeGreaterThan(reqsAfterFirstHandshake);

    // State-level kill assertion: the periodic keep-alive timer is armed
    // again — distinguishes "emitted one request but timer not restarted"
    // from "_initTimesync ran end-to-end".
    expect(app._timesyncTimerActive()).toBe(true);

    app.close();
  });
});

// Answer the CURRENT in-flight request (the last one emitted) rttMs after it
// was sent. Unlike driveCycle (which answers samples by loop index), this lets
// a cycle progress one slow round trip at a time so the in-flight sample's age
// can be controlled independently of the cycle-start age.
async function answerInFlight(ws, sendTimes, rttMs, serverSkewMs) {
  const i = sendTimes.length - 1;
  const tSendMs = sendTimes[i];
  await tick(Math.max(0, tSendMs + rttMs - Date.now()));
  const midpointMs = tSendMs + rttMs / 2;
  const remoteTimeNs = (midpointMs + serverSkewMs) * 1e6;
  ws.simulateMessage(encodeTimesyncResponse(remoteTimeNs));
  await tick(0);
}

describe('Timesync — stuck-cycle recovery uses in-flight age, not cycle-start', () => {
  let originalWebSocket;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    originalWebSocket = global.WebSocket;
  });
  afterEach(() => {
    global.WebSocket = originalWebSocket;
    jest.useRealTimers();
  });

  test('a slow-but-progressing cycle is NOT discarded (the deadline is per request, not per cycle)', async () => {
    const { app, ws, sendTimes } = await openAppConnection({ enableTimeSync: true, timeSyncPeriodSec: 60 });
    // Pinned to 60s: this scenario needs 40s round trips that are slow-but-
    // progressing (each answered within its own deadline); the 10s default
    // would age them out. After two such answers the cycle START is ~80s old —
    // older than the 60s period — while the 3rd request is freshly in flight.
    await answerInFlight(ws, sendTimes, 40000, 5000);
    await answerInFlight(ws, sendTimes, 40000, 5000);
    const countBeforeTimer = sendTimes.length; // 3 requests emitted (cycle in progress)
    expect(countBeforeTimer).toBe(3);

    // KILL TEST: a cycle-scoped deadline (armed at the first emit and never
    // re-armed) would have fired ~60s into the cycle and discarded the live
    // cycle (count → 4). The per-request deadline leaves the fresh 3rd request
    // alone: 30s later (under its 60s deadline) nothing new is emitted.
    await tick(30000);
    expect(sendTimes.length).toBe(countBeforeTimer);
    app.close();
  });

  test('a genuinely unanswered in-flight request triggers recovery after ONE period', async () => {
    const { app, ws, sendTimes } = await openAppConnection({ enableTimeSync: true, timeSyncPeriodSec: 60 });
    // One fast round trip leaves a 2nd request in flight; then the server goes
    // silent. One period after that request's send, its deadline must discard
    // and re-request so keep-alive resumes — not the ~2 periods a tick-
    // granularity check would take.
    await answerInFlight(ws, sendTimes, 20, 5000);
    const stuckCount = sendTimes.length;
    await tick(60001);
    expect(sendTimes.length).toBeGreaterThan(stuckCount);
    app.close();
  });

  test('a post-recovery cycle self-heals: the recovered cycle is applied and cached (no permanent freeze)', async () => {
    const sharedCache = new Map();
    const { app, ws, sendTimes } = await openAppConnection({ enableTimeSync: true, timeSyncPeriodSec: 60 }, sharedCache);
    // First request in flight, never answered; its per-request deadline fires one
    // period after the send, discarding the cycle and re-emitting.
    const beforeRecovery = sendTimes.length;
    await tick(60001);
    expect(sendTimes.length).toBeGreaterThan(beforeRecovery); // recovery discarded + re-emitted
    // Complete the replacement cycle with three samples computing a -5s delta.
    await answerInFlight(ws, sendTimes, 20, 5000);
    await answerInFlight(ws, sendTimes, 20, 5000);
    await answerInFlight(ws, sendTimes, 20, 5000);
    // SELF-HEAL: the recovered cycle is trusted, applied, and cached for same-host
    // seeding — there is NO permanent freeze. A contaminated cycle is discarded
    // and re-measured by the offset-spread check rather than freezing timesync.
    // KILL TEST: an `if (timesyncFrozen) return` guard leaves this at 0.
    expect(app._timestampDeltaNs()).toBe(-5 * 1e9);
    expect(sharedCache.get('test-host')).toBe(-5 * 1e9);
    // A SECOND cycle overwrites with a fresh offset (each clean cycle self-corrects
    // any prior transient). KILL TEST: a sticky freeze would pin cycle 2 at -5s.
    await tick(60001); // interval fires, samples empty -> starts cycle 2
    await answerInFlight(ws, sendTimes, 20, 7000);
    await answerInFlight(ws, sendTimes, 20, 7000);
    await answerInFlight(ws, sendTimes, 20, 7000);
    expect(app._timestampDeltaNs()).toBe(-7 * 1e9);
    expect(sharedCache.get('test-host')).toBe(-7 * 1e9);
    app.close();
  });

  test('repeated stuck cycles do not accumulate timers (no orphaned watchdog)', async () => {
    const { app } = await openAppConnection({ enableTimeSync: true, timeSyncPeriodSec: 60 });
    // First stuck cycle: the in-flight bootstrap request goes unanswered one
    // period, the watchdog fires, discards, and re-emits (arming a new watchdog).
    await tick(60001);
    const after1 = jest.getTimerCount();
    // Three more stuck cycles. KILL TEST: if any emit failed to clear/replace its
    // one-shot watchdog (or the interval double-emitted), each cycle would leave an
    // orphaned setTimeout and the live-timer count would climb.
    await tick(60001);
    await tick(60001);
    await tick(60001);
    expect(jest.getTimerCount()).toBe(after1);
    app.close();
    // close() -> cleanupPrimaryConnectionState -> stopTimesync clears interval +
    // watchdog; no timesync timer survives teardown.
    expect(app._timesyncTimerActive()).toBe(false);
  });

  test('a response that outlives its watchdog cannot poison the delta (contaminated cycle re-measured)', async () => {
    const { app, ws, sendTimes } = await openAppConnection({ enableTimeSync: true });
    const t0 = sendTimes[0];
    expect(sendTimes.length).toBe(1);
    // The bootstrap request goes unanswered one full period: the watchdog
    // discards the cycle and re-emits.
    await tick(10000);
    expect(sendTimes.length).toBe(2);
    // The FIRST request's response arrives only now. It fills the re-emitted
    // request's sample: near-zero apparent RTT (which wins min-RTT selection)
    // and a remoteTime one period stale.
    ws.simulateMessage(encodeTimesyncResponse((t0 + 10) * 1e6));
    await tick(0);
    // The rest of the cycle is honest (server 5s ahead).
    await answerInFlight(ws, sendTimes, 20, 5000);
    await answerInFlight(ws, sendTimes, 20, 5000);
    // KILL TEST: without the cycle-consistency check the stale sample wins the
    // selection and ~+10s is reported and cached here.
    expect(app._timestampDeltaNs()).toBe(0);
    // The contaminated cycle is dropped without an inline re-emit (a fast server
    // returning inconsistent times must not drive back-to-back cycles); the
    // periodic interval starts the re-measure.
    expect(sendTimes.length).toBe(4);
    await tick(10000); // next interval tick: samples empty -> re-measure begins
    expect(sendTimes.length).toBe(5);
    await answerInFlight(ws, sendTimes, 20, 5000);
    await answerInFlight(ws, sendTimes, 20, 5000);
    await answerInFlight(ws, sendTimes, 20, 5000);
    expect(app._timestampDeltaNs()).toBe(-5 * 1e9);
    app.close();
  });
});

describe('Timesync — host-only cache key', () => {
  let originalWebSocket;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    originalWebSocket = global.WebSocket;
  });
  afterEach(() => {
    global.WebSocket = originalWebSocket;
    jest.useRealTimers();
  });

  test('the cache is keyed host-only, so a same-host different-port connection inherits the delta', async () => {
    const sharedCache = new Map();
    const { app: app1, ws: ws1, sendTimes: sendTimes1 } =
      await openAppConnection({ enableTimeSync: true }, sharedCache);
    await driveCycle(ws1, sendTimes1, [
      { rttMs: 30, serverSkewMs: 9000 },
      { rttMs: 30, serverSkewMs: 9000 },
      { rttMs: 30, serverSkewMs: 9000 },
    ]);
    expect(app1._timestampDeltaNs()).toBe(-9 * 1e9);

    // KILL TEST: the cache must be keyed by host WITHOUT port. openAppConnection
    // connects to ws://test-host:1234, so the production key is the hostname
    // 'test-host' (not 'test-host:1234'). A port-qualified key would key it
    // 'test-host:1234' and the same-host different-port inherit below fails.
    expect(sharedCache.has('test-host')).toBe(true);
    expect(sharedCache.has('test-host:1234')).toBe(false);

    // A different app on the SAME host but a different port shares the per-machine
    // offset: seeding under the host-only key inherits the delta.
    const app2 = new internal.AppConnection('ws://test-host:9999', null, false, { enableTimeSync: true }, sharedCache);
    app2._initTimesync('test-host');
    expect(app2._timestampDeltaNs()).toBe(-9 * 1e9);

    app1.close();
    app2.close();
  });
});

describe('Timesync — wall-clock step immunity (monotonic timebase)', () => {
  let originalWebSocket;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    originalWebSocket = global.WebSocket;
  });
  afterEach(() => {
    global.WebSocket = originalWebSocket;
    jest.useRealTimers();
  });

  test('a backward wall-clock step between send and response does not corrupt the delta', async () => {
    const { app, ws, sendTimes } = await openAppConnection({ enableTimeSync: true });
    await driveCycle(ws, sendTimes, [
      { rttMs: 80, serverSkewMs: 5000 },
      { rttMs: 80, serverSkewMs: 5000 },
    ]);
    // Third request is in flight; capture its send time BEFORE the step so the
    // crafted server time stays in the unstepped frame the monotonic clock tracks.
    const tSendMs = sendTimes[2];
    jest.setSystemTime(Date.now() - 50000); // 50s backward step mid round trip
    await tick(40);
    // KILL TEST: with wall-clock sampling this sample's RTT is ~-50s — it wins
    // min-RTT selection and the delta is garbage. The monotonic RTT is 40ms.
    ws.simulateMessage(encodeTimesyncResponse((tSendMs + 20 + 5000) * 1e6));
    await tick(0);
    expect(app._timestampDeltaNs()).toBe(-5 * 1e9);
    app.close();
  });

  test('a forward wall-clock step mid-cycle does not corrupt the completed cycle', async () => {
    const { app, ws, sendTimes } = await openAppConnection({ enableTimeSync: true });
    await driveCycle(ws, sendTimes, [{ rttMs: 80, serverSkewMs: 5000 }]);
    // Second request in flight. KILL TEST: with wall-clock sampling the two
    // samples completed after the step carry receive times 1h ahead of their
    // send times — RTT and delta are garbage and the final assert fails. The
    // monotonic samples are unaffected.
    jest.setSystemTime(Date.now() + 3600000); // 1h forward step
    const tSendMs = sendTimes[1];
    await tick(Math.max(0, tSendMs + 80 - (Date.now() - 3600000)));
    const countAfterStep = sendTimes.length;
    expect(countAfterStep).toBe(2); // no discard/re-emit happened
    ws.simulateMessage(encodeTimesyncResponse((tSendMs + 40 + 5000) * 1e6));
    await tick(0);
    // The 3rd request was sent AFTER the step: the spy records the stepped wall
    // time, so convert back to the unstepped frame the monotonic clock tracks.
    const tSend3 = sendTimes[2] - 3600000;
    await tick(Math.max(0, tSend3 + 80 - (Date.now() - 3600000)));
    ws.simulateMessage(encodeTimesyncResponse((tSend3 + 40 + 5000) * 1e6));
    await tick(0);
    expect(app._timestampDeltaNs()).toBe(-5 * 1e9); // cycle completed, not frozen
    app.close();
  });
});

describe('Timesync — period input boundaries (timer overflow)', () => {
  let originalWebSocket;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    originalWebSocket = global.WebSocket;
  });
  afterEach(() => {
    global.WebSocket = originalWebSocket;
    jest.useRealTimers();
  });

  test('timeSyncPeriodSec: Infinity falls back to the default instead of a 1 ms flood', async () => {
    const { app, ws, sendTimes } = await openAppConnection({ enableTimeSync: true, timeSyncPeriodSec: Infinity });
    // KILL TEST: Infinity * 1000 overflows the 32-bit timer and the runtime
    // clamps the delay to 1 ms — the unanswered-request deadline then discards
    // and re-emits every millisecond (~1000 requests/s). 50 ms idle must leave
    // only the single bootstrap request.
    await tick(50);
    expect(sendTimes.length).toBe(1);
    app.close();
  });

  test('a finite period above the timer maximum is capped, not collapsed to 1 ms', async () => {
    const { app, ws, sendTimes } = await openAppConnection({ enableTimeSync: true, timeSyncPeriodSec: 99999999 });
    await tick(50);
    expect(sendTimes.length).toBe(1);
    expect(app._timesyncTimerActive()).toBe(true);
    app.close();
  });
});

describe('Timesync — same-host delta propagation (SystemNode fan-out)', () => {
  let originalWebSocket;
  let originalAppConnection;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    originalWebSocket = global.WebSocket;
    originalAppConnection = internal.AppConnection;
  });
  afterEach(() => {
    internal.AppConnection = originalAppConnection;
    global.WebSocket = originalWebSocket;
    jest.useRealTimers();
  });

  test('a delta refresh is pushed live to same-host connections; churn at or below 20 ms is ignored', async () => {
    const { MockWebSocket, instances } = createMockWebSocketFactory();
    global.WebSocket = MockWebSocket;
    const sendTimes = spyTimesyncSends(MockWebSocket);
    // Capture the AppConnection refs SystemNode creates (resolved at call time
    // via the exported object, so the wrap is visible inside SystemNode).
    const conns = [];
    const RealAC = originalAppConnection;
    internal.AppConnection = function(...args) {
      const c = new RealAC(...args);
      conns.push(c);
      return c;
    };

    const sys = new internal.SystemNode('test-host:1234', null, function() {}, { enableTimeSync: true });
    // Drive the full connect (not onAppConnect directly) so the SystemNode reaches
    // the 'connected' state — the precondition for the host-delta cache to be seeded.
    sys.onConnect(function() {}, function() {}, false);
    await tick(10);
    instances[0].simulateMessage(createHelloMessage({ compatVersion: 4 }));
    await tick(10);
    instances[0].simulateMessage(createSystemStructureResponse('TestSystem'));
    await tick(10);
    const conn1 = conns[0];
    const ws1 = instances[0];

    // Bootstrap cycle on the SystemNode-created connection: -9s offset.
    await driveCycle(ws1, sendTimes, [
      { rttMs: 20, serverSkewMs: 9000 },
      { rttMs: 20, serverSkewMs: 9000 },
      { rttMs: 20, serverSkewMs: 9000 },
    ]);
    expect(conn1._timestampDeltaNs()).toBe(-9 * 1e9);

    // Register a second same-host connection through the real service-connection
    // wiring point (timesync disabled: it computes nothing itself, so every
    // delta it shows below arrived via the fan-out push).
    const conn2 = new RealAC('ws://test-host:9999', null, false, { enableTimeSync: false }, new Map());
    const ws2 = instances[1];
    await tick(10);
    ws2.simulateMessage(createHelloMessage({ compatVersion: 4 }));
    await tick(10);
    ws2.simulateMessage(createSystemStructureResponse('TestSystem'));
    await tick(10);
    conn1.onServiceConnectionEstablished(conn2, 'same-host-sibling');
    expect(conn2._timesyncHost()).toBe('test-host');
    expect(conn2._timestampDeltaNs()).toBe(0);

    // Next refresh moves the offset by 100 ms (> 20 ms threshold).
    // KILL TEST (live push): a seed-only cache leaves conn2 at 0 forever.
    await tick(10001);
    await answerInFlight(ws1, sendTimes, 20, 9100);
    await answerInFlight(ws1, sendTimes, 20, 9100);
    await answerInFlight(ws1, sendTimes, 20, 9100);
    expect(conn1._timestampDeltaNs()).toBe(-9.1 * 1e9);
    expect(conn2._timestampDeltaNs()).toBe(-9.1 * 1e9);

    // A 10 ms wiggle (<= 20 ms threshold) is jitter: nothing moves.
    // KILL TEST (threshold): an unthresholded fan-out drags both to -9.11s.
    await tick(10001);
    await answerInFlight(ws1, sendTimes, 20, 9110);
    await answerInFlight(ws1, sendTimes, 20, 9110);
    await answerInFlight(ws1, sendTimes, 20, 9110);
    expect(conn1._timestampDeltaNs()).toBe(-9.1 * 1e9);
    expect(conn2._timestampDeltaNs()).toBe(-9.1 * 1e9);

    conn2.close();
    conn1.close();
  });

  test('a delta computed before the system is connected is NOT seeded into the host cache (connect-phase guard)', async () => {
    const { MockWebSocket, instances } = createMockWebSocketFactory();
    global.WebSocket = MockWebSocket;
    const sendTimes = spyTimesyncSends(MockWebSocket);
    const conns = [];
    const RealAC = originalAppConnection;
    internal.AppConnection = function (...args) { const c = new RealAC(...args); conns.push(c); return c; };

    const sys = new internal.SystemNode('test-host:1234', null, function () {}, { enableTimeSync: true });
    // onAppConnect directly (NOT onConnect): the SystemNode never reaches 'connected',
    // so any delta computed here is a connect-phase sample.
    sys.onAppConnect('ws://test-host:1234', null, false).catch(() => {});
    await tick(10);
    instances[0].simulateMessage(createHelloMessage({ compatVersion: 4 }));
    await tick(10);
    instances[0].simulateMessage(createSystemStructureResponse('TestSystem'));
    await tick(10);
    const conn1 = conns[0];
    await driveCycle(instances[0], sendTimes, [
      { rttMs: 20, serverSkewMs: 9000 },
      { rttMs: 20, serverSkewMs: 9000 },
      { rttMs: 20, serverSkewMs: 9000 },
    ]);
    expect(conn1._timestampDeltaNs()).toBe(-9 * 1e9); // own cycle still applies locally via fan-out

    // A second same-host timesync-ON connection seeds its initial offset from the host
    // cache via _initTimesync. KILL TEST: with the `if (connected)` guard the connect-
    // phase delta above was NOT cached, so conn2 seeds 0. Remove the guard and the
    // unconditional cache write seeds conn2 with the (possibly-off) connect-phase -9s.
    sys.onAppConnect('ws://test-host:5678', null, false).catch(() => {});
    await tick(10);
    instances[1].simulateMessage(createHelloMessage({ compatVersion: 4 }));
    await tick(10);
    instances[1].simulateMessage(createSystemStructureResponse('TestSystem'));
    await tick(10);
    const conn2 = conns[1];
    expect(conn2._timesyncHost()).toBe('test-host');
    expect(conn2._timestampDeltaNs()).toBe(0); // connect-phase delta was not seeded
    conn2.close();
    conn1.close();
  });
});

describe('Timesync — error-only disconnect (no close event)', () => {
  let originalWebSocket;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    originalWebSocket = global.WebSocket;
  });
  afterEach(() => {
    global.WebSocket = originalWebSocket;
    jest.useRealTimers();
  });

  test('an error without a close stops the timers; nothing is sent on the dead transport', async () => {
    const { app, ws, sendTimes } = await openAppConnection({ enableTimeSync: true });
    const countAtError = sendTimes.length; // bootstrap request in flight
    // Node ws can emit error with no following close. KILL TEST: without the
    // onError cleanup, the interval and the in-flight watchdog keep firing and
    // the keep-alive sends on the failed transport every period, forever.
    ws.onerror({ data: 'connection reset' });
    await tick(10001 * 2);
    expect(sendTimes.length).toBe(countAtError);
    expect(app._timesyncTimerActive()).toBe(false);
    app.close();
  });

  test('the periodic send is skipped while the socket is not OPEN (no throw, no frozen cycle)', async () => {
    const { app, ws, sendTimes } = await openAppConnection({ enableTimeSync: true, timeSyncPeriodSec: 2 });
    await driveCycle(ws, sendTimes, [
      { rttMs: 10, serverSkewMs: 0 },
      { rttMs: 10, serverSkewMs: 0 },
      { rttMs: 10, serverSkewMs: 0 },
    ]);
    const countAfterBootstrap = sendTimes.length;
    // Teardown race: the socket is CLOSED (a raw send would throw) but stopTimesync
    // has not run yet. KILL TEST: without the readyState guard the interval's raw send
    // throws (uncaught) and, since the watchdog is installed after the send, the pushed
    // sample stays stuck so the cycle never refreshes again.
    ws.closed = true; ws.readyState = 3;
    await tick(2000 * 3);
    expect(sendTimes.length).toBe(countAfterBootstrap); // guard skipped every send, no throw
    expect(app._timesyncTimerActive()).toBe(true);      // timer still armed, not frozen
    // When the socket is OPEN again the cycle resumes (no stuck sample left behind).
    ws.closed = false; ws.readyState = 1;
    await tick(2000);
    expect(sendTimes.length).toBeGreaterThan(countAfterBootstrap);
    app.close();
  }, 15000);

  test('error-only disconnect fires the onDisconnected lifecycle callback once', async () => {
    const { app, ws } = await openAppConnection({ enableTimeSync: true });
    const onDisc = jest.fn();
    app.onDisconnected = onDisc;
    // KILL TEST: an error with no following close must still notify onDisconnected,
    // like onClosed does — otherwise a consumer misses the DISCONNECT lifecycle event
    // on the error-only teardown path.
    ws.onerror({ data: 'connection reset' });
    await tick(0);
    expect(onDisc).toHaveBeenCalledTimes(1);
    // A close that then follows must NOT double-notify (hasNotifiedDisconnect guard).
    ws.onclose({ code: 1006, reason: 'lost' });
    await tick(0);
    expect(onDisc).toHaveBeenCalledTimes(1);
    app.close();
  });

  test('error-only disconnect is a complete teardown: the services-resend timeout is cleared too', async () => {
    const { app, ws } = await openAppConnection({ enableTimeSync: true });
    // Post-handshake (compatVersion 4) the services-resend timeout is armed alongside
    // the timesync interval/watchdog and the stall interval. autoConnect=false, so an
    // error schedules no reconnect — after cleanup nothing should remain pending.
    ws.onerror({ data: 'connection reset' });
    await tick(0);
    // KILL TEST: cleanupPrimaryConnectionState must clear the services timeout too.
    // Without clearServicesTimeout() it survives teardown (a stray timer that later
    // fires resendServicesRequest on the dead transport), leaving a live timer here.
    expect(jest.getTimerCount()).toBe(0);
    app.close();
  });

  test('a late container on the dead socket after an error does NOT re-arm timesync (autoConnect=false)', async () => {
    const { app, ws, sendTimes } = await openAppConnection({ enableTimeSync: true });
    ws.onerror({ data: 'connection reset' }); // error without a following close
    expect(app._timesyncTimerActive()).toBe(false); // cleanup stopped it
    const countAfterError = sendTimes.length;
    // A late container arrives on the SAME errored (not closed) socket, through the
    // still-attached ContainerHandler (it passes metadata on every container). KILL
    // TEST: without the transportAlive guard, currentMetadata is null after cleanup,
    // so handleIncomingContainer re-enters the post-handshake branch and re-arms
    // timesync, sending a fresh request on the dead transport.
    ws.simulateMessage(createSystemStructureResponse('TestSystem'));
    await tick(1);
    expect(app._timesyncTimerActive()).toBe(false);
    expect(sendTimes.length).toBe(countAfterError);
    app.close();
  });

  test('a late old-socket container before reconnect does NOT re-arm timesync (autoConnect=true)', async () => {
    const { MockWebSocket, instances } = createMockWebSocketFactory();
    global.WebSocket = MockWebSocket;
    const sendTimes = spyTimesyncSends(MockWebSocket);
    const app = new internal.AppConnection('ws://test-host:1234', null, true, { enableTimeSync: true });
    const ws1 = instances[0];
    await tick(10);
    ws1.simulateMessage(createHelloMessage({ compatVersion: 4 }));
    await tick(10);
    ws1.simulateMessage(createSystemStructureResponse('TestSystem'));
    await tick(10);
    expect(app._timesyncTimerActive()).toBe(true);

    ws1.onerror({ data: 'connection reset' }); // schedules reconnect (~1s backoff), not yet fired
    expect(app._timesyncTimerActive()).toBe(false);
    const countAfterError = sendTimes.length;
    // Late container on the OLD socket within the backoff window, through the still-
    // attached ContainerHandler — must not re-arm.
    ws1.simulateMessage(createSystemStructureResponse('TestSystem'));
    await tick(1); // stay under the reconnect backoff
    expect(app._timesyncTimerActive()).toBe(false);
    expect(sendTimes.length).toBe(countAfterError);
    app.close();
  });

  test('an old-socket container after the replacement socket opens does NOT corrupt the new handshake (autoConnect=true)', async () => {
    const { MockWebSocket, instances } = createMockWebSocketFactory();
    global.WebSocket = MockWebSocket;
    const sendTimes = spyTimesyncSends(MockWebSocket);
    const app = new internal.AppConnection('ws://test-host:1234', null, true, { enableTimeSync: true });
    const ws1 = instances[0];
    await tick(10);
    ws1.simulateMessage(createHelloMessage({ compatVersion: 4 }));
    await tick(10);
    ws1.simulateMessage(createSystemStructureResponse('TestSystem'));
    await tick(10);
    expect(app._timesyncTimerActive()).toBe(true);

    ws1.onerror({ data: 'connection reset' }); // error-only disconnect schedules a reconnect
    await tick(3000); // let the reconnect backoff fire -> replacement socket created
    expect(instances.length).toBe(2);
    const ws2 = instances[1];
    ws2.readyState = 1;
    ws2.onopen({}); // replacement opens -> transportAlive back to true
    await tick(10);

    // KILL TEST: reconnect() must detach the OLD socket's handlers, so a late
    // container on it is a no-op. Without that, ws1's onmessage still forwards
    // into the fresh HelloHandler — the stale container mis-advances it, the real
    // Hello below hits ContainerHandler as a protocol error, and timesync never
    // re-arms (transportAlive is true again post-onopen, so it can't catch this).
    expect(ws1.onmessage).toBe(null);
    ws1.simulateMessage(createSystemStructureResponse('StaleSystem'));

    ws2.simulateMessage(createHelloMessage({ compatVersion: 4 }));
    await tick(10);
    ws2.simulateMessage(createSystemStructureResponse('TestSystem'));
    await tick(10);
    expect(app._timesyncTimerActive()).toBe(true); // new handshake succeeded, timesync armed
    app.close();
  });
});

describe('Timesync — performance global not required when disabled', () => {
  let originalWebSocket;
  let savedPerformance;
  beforeEach(() => {
    jest.useFakeTimers();
    originalWebSocket = global.WebSocket;
    savedPerformance = global.performance;
  });
  afterEach(() => {
    global.performance = savedPerformance;
    global.WebSocket = originalWebSocket;
    jest.useRealTimers();
  });

  test('a timesync-disabled client constructs and runs without a global performance', async () => {
    const { MockWebSocket } = createMockWebSocketFactory();
    global.WebSocket = MockWebSocket;
    global.performance = undefined; // runtime where performance is not a global (e.g. Node < 16)
    // KILL TEST: computing `performance.now()` unconditionally at construction
    // would throw for EVERY client (timesync off included). The lazy monotonic
    // source means a disabled client never references performance.
    let app;
    expect(() => { app = new internal.AppConnection('ws://test-host:1234', null, false); }).not.toThrow();
    await tick(50);
    app.close();
  });
});
