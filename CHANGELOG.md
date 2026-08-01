# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.5] - 2026-08-XX

### Added
- **`sentinel_monitor` now accepts optional `filter` and `until` regex arguments for condition-based notification** ([Issue #1](https://github.com/tsukimiya/opencode-sentinel/issues/1)).
  - `filter`: only lines matching the regex are notified; non-matching lines are silently dropped.
  - `until`: when a line matches (after `filter` if set), the line is notified and the monitor auto-stops — enables one-shot wait patterns (e.g. "wake me when CI finishes").
  - Invalid regex at start is reported and the monitor is not launched.

### Changed
- `sentinel_list` now includes `filter` / `until` in each entry when set.

### Test Coverage
- New tests covering filter-only notification, until auto-stop, filter+until composition, and list visibility of the new fields.

## [0.1.4] - 2026-07-28

### Added
- **`SENTINEL_SESSION_ID` environment variable is now injected into monitor child processes.** The monitor tool's `sessionID` is propagated to the spawned shell's env, so command strings can reference `$SENTINEL_SESSION_ID` and feed it back into downstream tools. This unblocks agmsg integration: `agmsg watch.sh "$SENTINEL_SESSION_ID" ...` uses it as the watermark persistence key, preventing lost watermarks on watcher restarts. ([PR #9](https://github.com/tsukimiya/opencode-sentinel/pull/9))

### Test Coverage
- New test asserting the spawned child process receives `SENTINEL_SESSION_ID` in its env.

## [0.1.3] - 2026-07-08

### Changed
- Aligned watcher tests with the parts route API (`client.session.prompt({ parts })`) and synced `.gitignore`. ([PR #7](https://github.com/tsukimiya/opencode-sentinel/pull/7))

### Fixed
- Deliver notifications via the session message route with host client config (uses the host's in-process fetch + baseUrl so the v2 client works in TUI mode where `serverUrl` is a dummy). ([8024603](https://github.com/tsukimiya/opencode-sentinel/commit/8024603))

## [0.1.2] - 2026-07-08

### Changed
- Portable dev setup without machine-specific paths. ([914356c](https://github.com/tsukimiya/opencode-sentinel/commit/914356c))
- Use v2 session API (`client.v2.session.prompt`) for steer delivery. ([7990295](https://github.com/tsukimiya/opencode-sentinel/commit/7990295))

## [0.1.1] - 2026-07-08

### Changed
- Corrected repository URL (tsukimiya), added homepage/bugs metadata. ([8320866](https://github.com/tsukimiya/opencode-sentinel/commit/8320866))
- Split README into English (`README.md`) and Japanese (`README_ja.md`). ([f0152ca](https://github.com/tsukimiya/opencode-sentinel/commit/f0152ca))

## [0.1.0] - 2026-07-07

### Added
- Initial release: OpenCode plugin for background process monitoring with steer-based real-time agent notifications.
- Tools: `sentinel_monitor`, `sentinel_stop`, `sentinel_list`, `sentinel_ping`, `sentinel_spike`.
- Features: 200ms batching, flood protection (100 lines/sec auto-kill), stderr separation, auto cleanup on session end.

[0.1.5]: https://github.com/tsukimiya/opencode-sentinel/releases/tag/v0.1.5
[0.1.4]: https://github.com/tsukimiya/opencode-sentinel/releases/tag/v0.1.4
[0.1.3]: https://github.com/tsukimiya/opencode-sentinel/releases/tag/v0.1.3
[0.1.2]: https://github.com/tsukimiya/opencode-sentinel/releases/tag/v0.1.2
[0.1.1]: https://github.com/tsukimiya/opencode-sentinel/releases/tag/v0.1.1
[0.1.0]: https://github.com/tsukimiya/opencode-sentinel/releases/tag/v0.1.0
