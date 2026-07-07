# Issues — opencode-sentinel

## 2026-07-07 BLOCKER: Local plugin loading via file:// URL
- **Severity**: High (blocks live verification)
- **opencode version**: 1.17.15
- **Symptom**: `"plugin": ["file:///path/to/src/index.ts"]` in opencode.json loads without config error, but tools are not registered
- **Tested**: Both sentinel plugin and minimal test plugin fail to register tools via file:// URL
- **npm link + config name**: Also fails — opencode doesn't resolve locally linked packages
- **Root cause**: opencode 1.17.15 may not support file:// plugin loading, or requires a different mechanism
- **Workaround**: Publish to npm, then `opencode plugin opencode-sentinel`
- **Resolution**: Needs npm publish OR investigate alternative local loading mechanism (global plugin dir, symlink approach)
