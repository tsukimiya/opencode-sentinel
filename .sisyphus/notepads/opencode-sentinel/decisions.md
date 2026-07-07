# Decisions — opencode-sentinel

## Tool naming
- **Decision**: Use `sentinel_*` prefix (e.g., `sentinel_monitor`, `sentinel_stop`, `sentinel_list`)
- **Reason**: Avoid name collision with native Monitor (PR #33806). Safer for Phase 7 deprecate migration.

## Process management
- **Decision**: Use `node:child_process` with `detached: true` for process group kill capability
- **Reason**: `Bun.spawn` doesn't expose detached/process group, making pipeline cleanup unreliable.

## v2 SDK client
- **Decision**: Generate v2 client from `input.serverUrl` for steer delivery
- **Reason**: v1 client lacks `delivery` parameter and blocks until response complete.
