# Issues — opencode-sentinel

## 2026-07-07 BLOCKER: Local plugin loading (CRITICAL)
- **opencode version**: 1.17.15（最新）
- **全試行アプローチ**:
  1. `"plugin": ["file:///path"]` in opencode.json → ツール未登録
  2. `"plugin": ["opencode-sentinel"]` + ローカル `npm install` → 同上
  3. `~/.cache/opencode/node_modules/` に直接配置 → 解決成功、ツール未登録
  4. グローバル `opencode.json` に追加 → 同上
  5. `opencode plugin` コマンド → "server target" として検出、ツール未登録
  6. JS にコンパイル + キャッシュ配置 → 同上
  7. opencode upgrade → 1.17.15 が最新
- **比較**: `oh-my-openagent` は `opencode plugin oh-my-openagent@latest` で正常動作
- **根本原因**: opencode のプラグインローダーが `opencode plugin` コマンド経由以外の方法で追加されたプラグインのツールを登録しない
- **解除条件**: `npm publish` → `opencode plugin opencode-sentinel`
