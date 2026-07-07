# Issues — opencode-sentinel

## 2026-07-07 BLOCKER: Local plugin loading via file:// URL (HIGH)
- **opencode version**: 1.17.15
- **Symptom**: `"plugin": ["opencode-sentinel"]` in opencode.json silently fails — no config error, but tools never register
- **Investigation results**:
  1. `file://` URLs in plugin config are silently ignored
  2. npm package name in plugin config only works for packages from npm registry
  3. Local npm install (`npm pack` + `npm install`) puts package in node_modules but opencode doesn't load it
  4. oh-my-openagent (working plugin) is stored in `~/.cache/opencode/node_modules/` — opencode has its own plugin cache
  5. `opencode plugin <name>` tries to fetch from npm registry (404 if unpublished)
  6. Plugin can't be compiled independently — `@opencode-ai/plugin` and `@opencode-ai/sdk` are peerDeps provided by opencode host
- **Resolution**: `npm publish` → `opencode plugin opencode-sentinel` → live test
- **Alternative**: Check if opencode has a dev/plugin loading mode for local development
