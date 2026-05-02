# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] - 2026-05-02

### Added
- Support for running multiple Tedee bridges as separate platform instances. Each instance must have a unique `name` and `webhookPort` in `config.json`.

### Changed
- Removed the `singular: true` flag from the config schema so the Homebridge UI allows more than one TedeeBridge platform entry.
- `saveAddr()` now identifies its own platform block by `name` when more than one TedeeBridge entry is present, instead of always overwriting the first match.
- The webhook server logs a clear error if its port is already in use rather than crashing.
