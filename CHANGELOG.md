# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
