# HANDOFF - 2026-07-08T03:39 JST

## 使用ツール
- OpenCode（Atlas orchestrator + Sisyphus-Junior subagents）
- Bun（runtime, test runner）
- npm（package publish）
- Git / GitHub
- asciinema（demo recording）
- opencode CLI（live verification）

## 現在のタスクと進捗
- [x] **opencode-sentinel MVP 全実装完了** — 41/41 チェックボックス
- [x] **npm 公開**: `opencode-sentinel@0.1.2`（tsukimiya）
- [x] **全5ツール ライブ検証完了**: ping, spike, monitor, stop, list
- [x] **単体テスト**: 26 pass（manager CRUD, util, watcher batch/flood/exit）
- [x] **ドキュメント**: README.md（英語）+ README_ja.md（日本語）
- [ ] **Phase 6 Post-MVP**: spawn/multi-session（将来計画、MVP スコープ外）

## 試したこと・結果

### 成功
- **opencode プラグインの正しいロード方法を発見**（公式ドキュメント https://opencode.ai/docs/ja/plugins/ より）:
  - ディレクトリ: `~/.config/opencode/plugins/`（複数形 `plugins`）
  - エクスポート: `export const Name: Plugin = async (ctx) =>`（デフォルトエクスポート不可）
  - ツール引数: `tool.schema.string()`（`z.string()` 不可）
- **プラグインのデプロイ場所**: `~/.config/opencode/plugins/sentinel.ts`
- **v2 steer 送信**: `createOpencodeClient({ baseUrl: "http://localhost:4096" })` → `v2.session.prompt({ sessionID, prompt: {text}, delivery: "steer" })`（認証不要）
- **npm publish 成功**: 3バージョン公開（0.1.0 → 0.1.1 → 0.1.2）

### 失敗
- `export default` + `plugin/`（単数形）ディレクトリ → ツールが一切登録されず（6時間のデバッグ）
- `file://` URL による opencode.json 経由のロード → 設定エラーなしだが無視される
- `opencode plugin` コマンドのローカルファイル指定 → "server target" として誤検出
- `z.string()` によるツール引数定義 → 型エラー（公式は `tool.schema.string()`）

## アーキテクチャ概要

```
~/.config/opencode/plugins/sentinel.ts  ← 実運用プラグイン（全機能内蔵）
src/                                    ← npm パッケージソース（開発用）
├── index.ts          # Plugin entry: 5 tools + dispose/event hooks
├── monitor.tool.ts   # sentinel_monitor
├── stop.tool.ts      # sentinel_stop
├── list.tool.ts      # sentinel_list
├── monitor.txt       # LLM向け日本語説明
└── lib/
    ├── manager.ts    # MonitorManager: Map CRUD, process group kill
    ├── watcher.ts    # spawn → stdout → batch(200ms) → steer, flood(100/s)
    └── util.ts       # generateId(), timestamp()
test/
├── manager.test.ts   # 14 tests
├── util.test.ts      # 5 tests
└── watcher.test.ts   # 7 tests
```

## 次のセッションで最初にやること
1. Phase 6（spawn/multi-session）の設計レビューと実装判断
2. 必要なら `opencode plugin opencode-sentinel@latest` で最新版に更新
3. 実運用での監視テスト（実際のログファイル監視）

## 注意点・ブロッカー
- **opencode 1.17.15 固有の制約**: プラグインは必ず `~/.config/opencode/plugins/` に **名前付きエクスポート** で配置すること
- **ツール定義は `tool.schema.string()`**: zod の `z.string()` は使えない
- **2FA**: npm publish には OTP が必要（セッション中に複数回要求される）
- **steer の v2 クライアント**: `localhost:4096` にハードコード（本番ではコンテキストから動的取得が望ましい）
- **監視プロセスの孤児化**: opencode が SIGKILL されるとプロセスが残る（README に記載済み）
