# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 2.0.6

### Fixed

- The first request after a pause (for example the webhook registration `PUT /callback` at start) failed with ECONNRESET. Node 19 and later keep HTTP connections alive by default, and the Tedee bridge closes idle connections, so a reused socket was already dead. The bridge client now uses its own HTTP agent with keep-alive off, so every request opens a fresh connection, physical actions included.
- 2.0.5 did not retry any non-GET request after ECONNRESET, so webhook registration failed. Requests are now classified: GET and the webhook setup calls on `/callback` (PUT, POST, DELETE) are retried after any failure, including ECONNRESET and timeouts. Lock, unlock and pull keep the strict rule: retried only if the connection failed before the request was sent (for example ECONNREFUSED), never after a reset, a response or a timeout.

## 2.0.5

### Fixed

- HTTP errors from the bridge (for example 401 or 500) on GET requests are now retried as intended. The retry handler called `JSON.stringify` on the circular axios response, which threw a TypeError, so no retry happened and callers got a TypeError instead of the bridge error. Status and response data are now logged safely (shortened, never throwing).
- The pause between retries no longer busy-waits for 500 ms and blocks Homebridge; it uses an async sleep.
- The debug message when the own config entry cannot be identified no longer mentions `_bridge`.

- Safety: only GET requests are retried after an HTTP error or timeout. Lock, unlock and pull (POST/PUT) are physical actions that must not run twice: they are retried only when the connection failed before the request was sent (for example ECONNREFUSED), never after a response or a timeout.
- The response data in the retry debug log is redacted (API key, api_token) before it is shortened, so truncation cannot leave part of a secret in the log.

### Changed

- Supported Node.js versions now include ^22 and ^24.
- axios stays at 1.21.1 (1.21.0 would loosen follow-redirects from ^1.16.2 to ^1.16.0).

## 2.0.4

### Fixed

- 2.0.3 never saved a changed bridge IP under Homebridge: Homebridge removes `_bridge` from the platform config before the plugin is constructed, so the matching on `_bridge.username` rejected every entry that has one. The own entry is now found by name plus API key (compared by hash) and must match exactly one entry; `_bridge` is ignored. If it is not unique, nothing is written.
- A symlinked `config.json` stays a symlink: the real file is resolved and the temp file is written next to it. The original mode and owner are kept. The write is still atomic and skipped when the IP is unchanged.

### Security

- axios updated from 1.6.0 to 1.21.1 to close the advisories reported by `npm audit` (SSRF, proxy bypass, prototype pollution gadgets and others). `npm audit --audit-level=high` is clean.

## 2.0.3

### Fixed

- With two or more Tedee bridge entries in `config.json`, a bridge that connected wrote its IP into the first `TedeeBridge` entry instead of its own, so the other bridge's `bridgeIp` was overwritten and its requests failed with 401. The IP is now saved only into the entry of the instance that discovered it, identified by its child bridge username (`_bridge.username`), or else by name plus API key. If the entry cannot be identified with certainty, nothing is written.
- The IP is written only when it differs from the stored one. The config is re-read right before the write, only this entry's `bridgeIp` changes, and the file is replaced atomically (temp file plus rename) with its permissions kept.

## 2.0.2

### Security

- The API key is no longer written to the log. Version 2.0.1 and earlier logged it in full at debug level when the API client was initialized ("Initialized API client with IP ... and API key ..."). Anyone who ran Homebridge in debug mode should treat the key as exposed, rotate it in the Tedee app and clear old Homebridge logs.
- The api_token request header (a SHA-256 hash of the key and a timestamp) is no longer written to the log. Failed requests used to dump the whole Axios error, including the request headers, at debug level.
- Every platform log line, at every level, is now formatted first and then has the key and anything shaped like an api_token replaced with `[redacted]`. This also covers error objects, stack traces and bridge responses that reflect request headers. The API client applies the same redaction to its own error and debug output.

### Added

- Tests that fail if the key or an api_token appears in any log output (`src/logRedaction.spec.ts`).

## 2.0.1

### Fixed

- Lock Target State is now always 0 (unsecured) or 1 (secured). It was previously derived from the Lock Current State mapping and could be 2 (jammed) or 3 (unknown), which HomeKit rejects ("exceeded maximum of 1"). For uncalibrated, calibrating, unknown or jammed locks the last legal target is kept.
- Battery Level no longer receives 255, which Tedee uses for "unknown". The last known level is kept (and Status Low Battery is computed from it), so HomeKit no longer logs "exceeded maximum of 100".

### Added

- Unit tests for the state and battery mappings (`npm test`).
