# Learnings — opencode-sentinel

## 2026-07-07 Session — Key Discoveries

### Critical: opencode plugin loading
- **Directory**: MUST be `~/.config/opencode/plugins/` (PLURAL `plugins`, NOT `plugin`)
- **Export**: MUST use named export `export const Name: Plugin = async (ctx) =>` (NOT `export default`)
- **Tool args**: MUST use `tool.schema.string()` (NOT `z.string()` from zod)
- **Context**: Plugin receives `{ project, client, $, directory, worktree }` (NOT `input: any`)
- **Source**: https://opencode.ai/docs/ja/plugins/

### Plugin entry pattern
```typescript
import { type Plugin, tool } from "@opencode-ai/plugin"
export const MyPlugin: Plugin = async ({ client, directory }) => {
  return {
    tool: { /* tool definitions */ },
    dispose: async () => { /* cleanup */ },
    event: async ({ event }) => { /* event handling */ },
  }
}
```

### Steer delivery
- v2 client: `createOpencodeClient({ baseUrl })` from `@opencode-ai/sdk/v2`
- `v2.session.prompt({ sessionID, prompt: {text}, delivery: "steer" })`
- Works without authentication on localhost:4096 (default opencode port)

### Test results
- All unit tests passing via `bun test` (manager CRUD, util functions, watcher batch/flood/exit)
- All 5 tools verified live: ping, spike, monitor, stop, list
