# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Support for running multiple Tedee bridges as separate platform instances. Each instance must have a unique `name` and `webhookPort` in `config.json`.

### Changed
- Removed the `singular: true` flag from the config schema so the Homebridge UI allows more than one TedeeBridge platform entry.
- `saveAddr()` now identifies its own platform block by `name` when more than one TedeeBridge entry is present, instead of always overwriting the first match.
- The webhook server now logs a clear error if its port is already in use rather than crashing without context.
- Widened `engines.node` to `^18.20.4 || ^20.15.1 || ^22 || ^24` and `engines.homebridge` to `^1.6.0 || ^2.0.0-beta.0` for Homebridge v2 compatibility. The plugin already uses the v2-compatible `Service.Battery` API; no code changes were needed for v2.
- Cleared all pre-existing eslint errors and warnings under the existing `--max-warnings=0` config (`@ts-ignore` → `@ts-expect-error` or proper type assertions, `==`/`!=` → `===`/`!==`, long log strings wrapped, unused parameter dropped).

### Fixed
- `registerLocks()` no longer crashes on startup when the optional `devices` array is omitted from the config.
