# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 2.0.1

### Fixed

- Lock Target State is now always 0 (unsecured) or 1 (secured). It was previously derived from the Lock Current State mapping and could be 2 (jammed) or 3 (unknown), which HomeKit rejects ("exceeded maximum of 1"). For uncalibrated, calibrating, unknown or jammed locks the last legal target is kept.
- Battery Level no longer receives 255, which Tedee uses for "unknown". The last known level is kept (and Status Low Battery is computed from it), so HomeKit no longer logs "exceeded maximum of 100".

### Added

- Unit tests for the state and battery mappings (`npm test`).
