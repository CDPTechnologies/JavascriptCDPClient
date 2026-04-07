# CDP Logger Client — Background

This document provides background on the CDP Logger data query protocol. For API reference and usage examples, see the [README](../README.rst).

## What the CDP Logger Does

In CDP Studio, the **CDPLogger** component logs selected signal values and system events for long-term storage. It stores data in a local database (SQLite via CDPCompactDatastore) and serves it over a protobuf-based WebSocket API. Each logged signal produces time-series data with min, max, and last values per sample interval.

The logger client provides:

- **Logged signal discovery** — list what signals are being logged, with their names, paths, and custom tags (unit, description, etc.).
- **Historical data queries** — retrieve time-series data points for one or more signals over a time range, with optional downsampling or full resolution.
- **Event queries** — retrieve and filter system events (alarms, state changes) by sender, data fields, event codes, and time range.
- **Time synchronization** — automatic clock offset calculation between client and server to align timestamps.
- **Node.js and browser support** — works in both environments using the same API.

For more information, see [CDP Logger Documentation](https://cdpstudio.com/manual/cdp/cdplogger/cdplogger-index.html) and [Configuration Example](https://cdpstudio.com/manual/cdp/cdplogger/cdplogger-configuration-example.html).

## Connection Methods

### Proxy Discovery (CDP 5.1+, Recommended)

The `client.logger()` method discovers CDPLogger services via the StudioAPI proxy protocol. The logger registers as a `websocketproxy` service with `proxy_type: "logserver"`, and the client finds it in `ServicesNotification`. The logger protocol is tunneled through the existing StudioAPI WebSocket — no separate port or connection is needed.

This works across sibling applications: if CDPLogger runs on a different app than the one the client connects to, discovery still works because the client searches all proxy connections.

### Direct WebSocket (CDP 4.3+)

The standalone `studio.logger.Client("host:port")` connects directly to the CDPLogger's WebSocket port (configured as `ServerPort` in CDP Studio, typically 17000). This bypasses StudioAPI authentication and requires the port to be reachable from the client. Browser security settings often reject connections to non-standard ports, especially over HTTPS.

## Data Query Details

### Data Point Downsampling

When `noOfDataPoints > 0`, the server divides the requested time range into that many intervals and returns one aggregated sample per interval with `{ min, max, last }` values. Setting `noOfDataPoints = 0` returns full resolution data (every logged sample).

For large time ranges, full resolution queries can return very large result sets. The server limits responses to 50,000 rows (API 3.2+). For larger data sets, query in patches by advancing `startS` through the time range.

### Event Query Filtering

Events can be filtered by multiple criteria simultaneously:

- **Sender conditions** — match the event source path. Each condition has a `value` (string) and `matchType` (`Exact` or `Wildcard`). Wildcard uses `*` for any characters.
- **Data conditions** — match fields within the event's data payload. Keys are field names (e.g. `"Text"`), values are arrays of match strings (wildcard by default).
- **Code mask** — bitwise filter on event codes. Common codes: `AlarmSet (0x1)`, `AlarmClr (0x2)`, `AlarmAck (0x4)`, `AlarmReprise (0x40)`, `SourceObjectUnavailable (0x100)`, `NodeBoot (0x40000000)`.
- **Time range** — `timeRangeBegin` and `timeRangeEnd` in seconds (epoch). Combine with `UseLogStampForTimeRange` flag to use the logger's log timestamp instead of the event timestamp.

### Time Synchronization

The client calculates the clock offset between itself and the server by exchanging timestamp messages. This `timeDiff` is applied to `requestLogLimits()` and `requestDataPoints()` results so that time ranges align with the client's clock. Disable with `setEnableTimeSync(false)` to get raw server timestamps.

### Node Tags

Logged nodes can have custom tags (key-value metadata such as unit or description), available since API 4.0 (CDP 4.12). Tags are returned by `requestLoggedNodes()` as `{ name, routing, tags }` where `tags` is an object mapping tag names to `{ value, source }`. Event senders also have tags, accessible via `getSenderTags(sender)`.

## Logger API Version History

| Version | CDP Version | Changes |
|---------|-------------|---------|
| 3.0 | 4.3 (2017) | Minimum supported version |
| 3.1 | 4.9 (2020) | Full resolution data (`noOfDataPoints = 0`), `limit` parameter, `TooManyRequests` error |
| 3.2 | 4.11 (2022) | Server-side 50,000 row limit |
| 4.0 | 4.12 (2024) | Node tags, sparse data responses, string values, events |

The integrated proxy discovery via `client.logger()` requires CDP 5.1+. The API versions above apply to the data query protocol itself.

## Resources

- [CDP Logger Documentation](https://cdpstudio.com/manual/cdp/cdplogger/cdplogger-index.html)
- [CDP Logger Configuration Example](https://cdpstudio.com/manual/cdp/cdplogger/cdplogger-configuration-example.html)
- [Vue.js Web GUI Example](https://cdpstudio.com/manual/cdp/examples/webui-demo.html)
- [CDP Studio Website](https://cdpstudio.com)
- [cdp-client GitHub Repository](https://github.com/CDPTechnologies/JavascriptCDPClient)
- Support: support@cdptech.com
