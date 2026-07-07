# OpenCode Sentinel

A Monitor plugin for [OpenCode](https://opencode.ai) — background process monitoring with real-time agent notifications via steer delivery.

## Features

- **Process Monitoring**: Run any shell command in the background; each stdout line is delivered to the agent as a real-time steer notification
- **Parallel Monitors**: Run multiple monitors simultaneously
- **200ms Batching**: High-frequency output is batched at 200ms intervals to prevent flooding
- **Flood Protection**: Auto-kills monitors exceeding 100 lines/second
- **stderr Separation**: stderr is logged to `/tmp/sentinel-{id}-stderr.log`
- **Auto Cleanup**: All processes are terminated on session end or plugin unload

## Installation

Add to your `opencode.json`:

```json
{
  "plugin": ["opencode-sentinel"]
}
```

Or install via file path:

```json
{
  "plugin": ["file:///path/to/opencode-sentinel/src/index.ts"]
}
```

Or via CLI:

```bash
opencode plugin opencode-sentinel
```

## Usage

### Log Monitoring

Just ask the agent in natural language:

```
Monitor /var/log/app.log for ERROR lines using sentinel_monitor
```

The agent will call the appropriate tools:

| Tool | Description |
|------|-------------|
| `sentinel_monitor` | Start monitoring (command + description label) |
| `sentinel_stop` | Stop a monitor by ID |
| `sentinel_list` | List all running monitors |
| `sentinel_ping` | Health check — returns "pong" |
| `sentinel_spike` | Spike test — 3-second delayed steer delivery |

### Important: grep requires `--line-buffered`

When piping to grep, you **must** use `--line-buffered`:

```
✅ tail -f /var/log/app.log | grep --line-buffered ERROR
❌ tail -f /var/log/app.log | grep ERROR
```

Without `--line-buffered`, grep buffers output and lines won't arrive in real-time.

## steer vs queue

Sentinel uses `delivery: "steer"` for agent notifications. Here's how it differs from `"queue"`:

| Mode | Behavior |
|------|----------|
| **steer** (used by sentinel) | Immediately wakes idle sessions. During active runs, messages are promoted between provider turns. No streaming interruption. |
| **queue** | Messages are queued until the run completes, then delivered on the next user input. Unsuitable for real-time monitoring. |

Why steer:
- **Real-time responsiveness**: Instant wake on idle sessions ensures prompt log monitoring
- **No streaming disruption**: LLM responses are not interrupted; notifications are picked up at turn boundaries
- **No queue buildup**: Avoids notification backlog during long-running tasks

## Limitations

- **Orphaned Processes**: If OpenCode is killed via SIGKILL (bypassing the dispose hook), monitored processes may remain. Normal shutdown via dispose cleans up all processes.
- **No Mid-Stream Interruption**: During LLM response streaming, steer notifications are not processed until the current turn completes. Idle sessions respond within 500ms.

## Tech Stack

- TypeScript (strict)
- @opencode-ai/plugin (v1 Hooks API)
- @opencode-ai/sdk/v2 (steer delivery)
- Bun / Node.js compatible

## License

MIT

---

[日本語版はこちら](README_ja.md)
