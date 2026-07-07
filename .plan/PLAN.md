# opencode-sentinel — Monitor plugin for opencode

opencode に Claude Code 互換の **Monitor ツール** を提供するスタンドアロン plugin。
バックグラウンドプロセスを spawn し、stdout 行を `session.prompt({ delivery: "steer" })` でエージェントに push する。

## 命名規則

- **リポジトリ / npm**: `opencode-sentinel` (kebab-case, `opencode-` prefix で plugin 性を即示)
- **表示名**: OpenCode Sentinel
- **ツールprefix**: `sentinel_*`（ネイティブ Monitor ツール群との整合優先）
- **参考**: `vscode-*`, `eslint-plugin-*` 等の業界標準、[opencode.cafe](https://www.opencode.cafe/) カテゴリ分け

> **変えたくなったら**: `mv opencode-sentinel <new>` + `grep -rl sentinel <new> | xargs sed -i 's/sentinel/<new>/g'`

---

## Goal / 達成条件

ユーザーが自然言語で「`tail -f app.log | grep ERROR を監視して`」と頼むと:

1. plugin がバックグラウンドでプロセス起動
2. マッチした stdout 行が来るたび、**実行中の会話ターンを wake** して行内容を通知
3. ユーザーが明示的に止めるかセッション終了まで監視継続

**MVP 完了の定義**:
- [x] アイドル時: 1行マッチ → 500ms以内にエージェントが反応
- [x] 実行中: 1行マッチ → 現在の provider turn 終了後、次 turn の冒頭で取り込まれる（steer の仕様上、ストリーミング中の即時割り込みは不可。500ms保証はアイドル時のみ）
- [x] 複数 monitor を並行起動できる
- [x] monitor を stop するとプロセス・リソース解放される
- [x] セッション終了で全 monitor プロセスが cleanup される

## Non-goals (MVP)

- ❌ `spawn` / `despawn` 相当（マルチセッション起動）→ Phase 2 以降
- ❌ agmsg 統合（別PR / 別リポジトリで後対応）
- ❌ コマンドポリシー・サンドボックス（危険コマンド実行防止）→ post-MVP
- ❌ Bedrock/Vertex/Foundry での動作検証（手元で動いてから）

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  opencode session (agent loop)                              │
│    ↑                                                        │
│    │ session.prompt({delivery:"steer", prompt:{text:...}})  │
│    │                                                        │
│  ┌─┴──────────────────────────────────────────┐             │
│  │ sentinel plugin                            │             │
│  │                                             │             │
│  │  Tools:           State (closure):         │             │
│  │  - monitor        - Map<id, ChildProcess>  │             │
│  │  - monitor_stop   - Map<id, LineBuffer>    │             │
│  │  - monitor_list                                │             │
│  │                                             │             │
│  │  Per-monitor watcher fiber:                │             │
│  │  - read stdout                             │             │
│  │  - batch 200ms                             │             │
│  │  - call session.prompt(steer)              │             │
│  └─────────────────────────────────────────────┘             │
└─────────────────────────────────────────────────────────────┘
```

**キモ**: `session.prompt({ delivery: "steer" })` がエージェントを wake する。1 stdout 行 = 1 prompt。ネイティブ Monitor の「1行1通知」と機能的に同等。

**⚠️ 重要（コード検証済み・2026-07-07）**: plugin に渡される `input.client` は **v1 SDK クライアント**（`@opencode-ai/sdk`）であり、その `session.prompt` は (a) `delivery` パラメータを持たず、(b) `POST /session/{id}/message` でアシスタント応答完了までブロックする。**steer 送信には v2 クライアントを自前生成する**:

```ts
import { createOpencodeClient } from "@opencode-ai/sdk/v2"

// plugin entry 内:
const v2 = createOpencodeClient({ baseUrl: input.serverUrl.toString() })
// watcher から:
await v2.session.prompt({ sessionID, prompt: { text: line }, delivery: "steer" })
// → POST /api/session/{sessionID}/prompt（v2 エンドポイント）
```

**steer の実挙動（core のコードで裏取り済み）**:
- `packages/core/src/session.ts:364-382` — `delivery` のデフォルトは `"steer"`。admit 後に `execution.wake(sessionID)` が呼ばれるため、**アイドル時も新規 run が開始される**
- `packages/core/src/session/runner/llm.ts:187-196, 384-403` — 実行中の run では **provider turn の合間**に `promoteSteers` で取り込まれる（turn 途中の即時割り込みではない）。`queue` は run 完了まで待つ
- → 「steer がアイドル時しか効かない」リスクはコード上ほぼ否定できる。Phase 1 spike は実機での最終確認に位置づけを変更

## Tech stack

- **TypeScript** (strict)
- **@opencode-ai/plugin** (v1 Hooks API。**検証済み**: v2 plugin API（promise/effect）には `tool` ドメインがまだ無いため、ツール提供は v1 一択。Effect は導入しない)
- **@opencode-ai/sdk/v2** — steer 送信用 v2 クライアント（`input.serverUrl` から自前生成。上記「重要」参照）
- **Bun** runtime
- **プロセス管理**: `Bun.spawn` は **detached / process group を公開しない**ため、`sh -c "tail -f x | grep y"` のようなパイプラインを SIGTERM しても子孫（tail）が orphan 化しうる。Node の `child_process.spawn(cmd, { detached: true })` + `process.kill(-pid, "SIGTERM")` によるプロセスグループ kill を第一候補とし、Phase 2 で stream の扱いやすさと天秤にかけて決定（Bun 上でも `node:child_process` は動く）

## File structure

```
opencode-sentinel/
├── PLAN.md                 ← このファイル
├── README.md
├── LICENSE                 ← MIT 推奨
├── package.json
├── tsconfig.json
├── opencode.json           ← plugin manifest (後述)
├── src/
│   ├── index.ts            ← plugin entry (Hooks 返す)
│   ├── monitor.tool.ts     ← monitor ツール本体
│   ├── stop.tool.ts        ← monitor_stop ツール
│   ├── list.tool.ts        ← monitor_list ツール
│   ├── monitor.txt         ← ツール説明文（LLM向け）
│   └── lib/
│       ├── manager.ts      ← プロセス状態管理（Map操作）
│       ├── watcher.ts      ← stdoutストリーム + バッチ + steer
│       └── util.ts         ← ID生成、タイムスタンプ等
└── test/
    └── monitor.test.ts     ← bats or bun test
```

## Phases

### Phase 0 — プロジェクトセットアップ (30min)

- [x] リポジトリ用ディレクトリを作成して移動（任意の場所で可。例: `mkdir -p ~/projects/opencode-sentinel && cd ~/projects/opencode-sentinel`）。以降のコマンドはすべてこのディレクトリ内で実行
- [x] `git init`
- [x] `package.json` 作成
  ```json
  {
    "name": "opencode-sentinel",
    "version": "0.1.0",
    "type": "module",
    "main": "src/index.ts",
    "scripts": {
      "typecheck": "tsc --noEmit",
      "test": "bun test"
    },
    "peerDependencies": {
      "@opencode-ai/plugin": "*",
      "@opencode-ai/sdk": "*"
    }
  }
  ```
  （`@opencode-ai/sdk` は steer 用 v2 クライアント `@opencode-ai/sdk/v2` の生成に必要）
- [x] `tsconfig.json` (strict, module ESNext, target ESNext)
- [x] plugin のロード設定 — **注**: `opencode.json` は「plugin manifest」ではなく opencode の config ファイル。plugin パッケージ側に manifest は不要（`package.json` の `main` で十分。参考: `Opencode-Context-Analysis-Plugin` も package.json + entry のみ）。開発中のロードは以下のいずれか:
  - テスト用プロジェクトの `opencode.json` に `"plugin": ["file:///path/to/opencode-sentinel/src/index.ts"]` を追加
  - または `~/.config/opencode/plugin/` にシンボリックリンク
- [x] `src/index.ts` に **hello world ツール** を定義し、opencode から呼べることを確認
  ```ts
  import { tool } from "@opencode-ai/plugin"
  
  export default async (input) => ({
    tool: {
      sentinel_ping: tool({
        description: "Health check",
        args: {},
        async execute() { return "pong" },
      }),
    },
  })
  ```
- [x] ローカル opencode で `sentinel_ping` が呼べることを確認（**Decision gate**）

### Phase 1 — Spike: `delivery: "steer"` 挙動検証 (1-2h)

コード読解では前提は裏取り済み（Architecture 章参照）。ここでは **v2 クライアント生成 + steer の実機動作**を確認する。

- [x] テスト用ツール `sentinel_spike` を作成:
  - plugin entry で `createOpencodeClient({ baseUrl: input.serverUrl.toString() })`（`@opencode-ai/sdk/v2`）を生成
  - 実行すると `setTimeout` で3秒後に `v2.session.prompt({ sessionID: ctx.sessionID, prompt: { text: "[spike] hello" }, delivery: "steer" })` を呼ぶ（sessionID は `ToolContext` から取得）
  - ツール本体は即座に `"scheduled"` を返す
- [x] 追加検証: plugin プロセスから `serverUrl` への接続に認証が要るか → **不要確認済み**（localhost:4096 で認証なしで接続可能）
- [x] 検証項目:
  - [x] エージェントが別の作業中に `[spike] hello` が届くか？
  - [x] アイドル時（ユーザー入力待ち）に届くか？
  - [x] 連続して prompt した時の順序・間隔は？
- [x] **判定**: steer で wake が機能することを確認 → アイドル時は即時wake、実行中はturn間で取り込み（コード検証 + 実機確認）

### Phase 2 — Monitor ツール MVP (2-3h)

- [x] `src/lib/manager.ts`: `Map<MonitorID, { proc, description, startedAt }>`
- [x] `src/lib/watcher.ts`:
  - プロセス起動（Tech stack 章のプロセスグループ問題を踏まえて `node:child_process` detached か `Bun.spawn` かをここで決定）
  - stdout を line-by-line で読む（stream + 自前 splitLines）
  - 行が来たら即 v2 クライアントで `session.prompt({ delivery: "steer" })`
- [x] `src/monitor.tool.ts`:
  ```ts
  // 注: readFileSync("src/monitor.txt") は cwd 依存で壊れる（plugin は
  // プロジェクト外からロードされる）。import.meta.url 基準で解決するか
  // Bun の text import を使う:
  import description from "./monitor.txt" with { type: "text" }

  tool({
    description,
    args: {
      command: z.string().describe("Shell command to watch"),
      description: z.string().describe("Label shown in notifications"),
    },
    async execute(args, ctx) {
      const id = await manager.start({
        sessionID: ctx.sessionID,
        client: v2Client, // ← plugin entry で生成した @opencode-ai/sdk/v2 クライアント（input.client は v1 なので不可）
        command: args.command,
        description: args.description,
      })
      return `monitor started: ${id}`
    },
  })
  ```
- [x] `src/monitor.txt` を書く（LLM向け: 「いつ使う・いつ使わないか・grep --line-buffered 必須」を含む）
- [x] **手動テスト**: `tail -f /tmp/test.log` を monitor し、別 shell から `echo hello >> /tmp/test.log` でエージェントが反応するか

### Phase 3 — Stop + List ツール (1-2h)

- [x] `monitor_stop` ツール:
  - `args: { id: z.string() }`
  - 該当プロセスを SIGTERM → 終了確認 → manager から削除
  - 存在しない ID は分かりやすいエラー
- [x] `monitor_list` ツール:
  - `args: {}`
  - 実行中 monitor 一覧を `{ id, description, command, startedAt, linesEmitted }` で返す
- [x] **手動テスト**: 複数 monitor 起動 → list → stop → list

### Phase 4 — セーフティ (2-3h)

ネイティブ Monitor + PR #33806 が備える最低限のセーフティを揃える。

- [x] **200ms バッチ coalescing**: 200ms 以内の複数行は1つの prompt に結合
  - 実装: 行バッファ + `setTimeout(200)` debounce
- [x] **フラッド上限**: 1秒間に N 行（初期値 100）超えたら自動 kill + エージェントへ通知
- [x] **stderr 分離**: stderr は `/tmp/sentinel-<id>-stderr.log` へ。stdout と混ざらない
- [x] **プロセス死検知**: プロセスが予期せず exit したら `session.prompt` でエージェントへ通知
- [x] **`dispose` hook**: plugin unload 時に全プロセス SIGTERM（`Hooks.dispose` の実在は確認済み）
- [x] **セッション終了連動**: `event` hook で `session.deleted` を購読し、該当セッションの monitor を全 kill（v1 イベントに `session.deleted` は実在。ただし「TUI/プロセス終了」では deleted は飛ばない — その経路は dispose が受け持つ。`session.idle` も存在するので通知抑制等に使える）
- [x] **orphan 対策**: opencode 本体が SIGKILL 等で dispose を通らず死んだ場合に備え、監視プロセス側から親の生存確認（親 PID ポーリング or pipe 切断検知）で自殺させる仕組みを検討（最低限、既知の制限として README に明記）

### Phase 5 — 仕上げ・公開準備 (1-2h)

- [x] `README.md`: 機能、インストール、使い方、ネイティブ Monitor との差分、既知の制限
- [x] `LICENSE` (MIT)
- [x] `package.json` に `files` / `repository` / `keywords` 設定（plugin に `bin` は不要）
- [x] npm publish 準備（`npm publish --dry-run` で内容確認）
- [x] デモ用 gif（`asciinema` で `tail -f` 監視 → ERROR 検出を録画）→ `demo.cast` 作成済み。`asciinema play demo.cast` で再生可能
- [x] GitHub リポジトリ作成、初回 push
- [ ] **Decision gate**: 公開するか、しばらく自宅運用してからにするか

---

## Roadmap (Post-MVP)

MVP完了後に検討する拡張機能。Phase番号は続き。

### Phase 6 — Spawn / マルチセッション対応 (想定 4-6h)

**目標**: Monitorで確立した「watch → steer deliver」アーキテクチャを **opencodeセッションのイベント監視** に転用し、サブセッション起動・通信を可能にする。agmsg的マルチエージェント協調をネイティブで実現。

**前提**: Phase 4 で実装する EventV2 購読（`event` hook）+ steer deliver がそのまま使える。

#### ツール構成

| ツール | 役割 |
|---|---|
| `session_spawn` | 新規セッション作成 + 初期prompt + イベント購読開始 |
| `session_despawn` | サブセッション停止 |
| `session_list` | 起動中サブセッション一覧 |

#### アーキテクチャ

```
親セッション                子セッション（spawn で起動）
  ↑                          ↑
  │ session.prompt(steer)    │ session.prompt(steer)  ← 親→子への指示
  │ [child event forwarded]  │
  │                          │
  └── plugin event hook ─────┘
      (session.message.completed,
       session.tool.executed等を
        親へ転送)
```

**キモ**: プラグインの `event` hook で子セッションの EventV2 を購読。`Session.Message.Completed` 等の有意イベントを親へ `session.prompt({ delivery: "steer" })` で転送。これで子の進捗・応答が親にリアルタイム伝達される。

#### 実装ステップ

1. **`session_spawn` ツール設計**:
   - args: `{ initial_prompt: string, agent?: string, model?: { providerID, modelID } }`
   - `input.client.session.create({...})` でセッション作成
   - `input.client.session.prompt({...})` で初期prompt投入
   - manager に `{ sessionID, childClient }` 登録
   - 戻り値: `{ sessionID, status: "spawned" }`

2. **イベント転送ロジック**:
   - `event` hook で EventV2 を全購読
   - manager に登録された子セッションIDでフィルタ
   - `session.message.completed` → 親へ `session.prompt({ delivery:"steer", prompt: { text: `[child:${sessionID}] ${summary}` } })`
   - 転送するイベント種別の選別（全部転送すると洪水になる）

3. **`session_despawn`**:
   - args: `{ sessionID: string }`
   - `input.client.session.remove({ sessionID })` または該当 stop API
   - manager から削除

4. **`session_list`**: Monitor の `monitor_list` と同パターン

#### 設計上の懸念点（要spike）

- **イベント洪水**: 子が高頻度でツール呼ぶと親が飽和する。転送するイベント種別とレートリミット要検討
- **無限ループ**: 親→子→親→子… が止まらない可能性。protocol-level の max-turns / done-signal 指示が必要（agmsg と同じ課題）
- **agent 一意性**: `--agent` で起動する subagent を親と共有するか、別 agent を指定するか
- **session.create の引数**: SDK v2 の `session.create` シグネチャ要確認（`agent`, `model`, `permission` 等）

#### Phase 6 完了の定義

- [ ] `session_spawn` で子セッションが立ち上がり、初期promptに応答する
- [ ] 子の `message.completed` が親に steer 通知される
- [ ] 親が `session.prompt` で子へ追加指示を送れる
- [ ] `session_despawn` で子が cleanup される
- [ ] 2セッション並列で親が協調制御できる

### Phase 7以降（構想のみ）

- **agmsg統合**: agmsg の `type.conf` で opencode の `monitor=yes`, `spawnable=yes` を有効化。`_delivery.sh` を本プラグイン呼び出しに変更。agmsg の `spawn opencode` が動くように
- **TUIステータス**: アクティブ monitor / spawn 一覧を opencode TUI に表示（plugin の `TuiPlugin` 機能を使用）
- **セッション間RPC**: 単方向メッセージだけでなく、request-response 型プロトコル（`spawn_id` を correlation key に）
- **ネイティブ Monitor マージ時の移行**: opencode PR #33806 がマージされたら、本プラグインの Monitor 部は deprecate し、spawn 専用に縮小

---

## Testing strategy

- **手動テスト**: 各 Phase の Decision gate で必ず実行。自動化より早い
- **bun test** (Phase 4 以降):
  - manager の CRUD
  - watcher のバッチ coalescing
  - dispose の cleanup
- **統合テスト** (任意・post-MVP): `opencode` を test mode で起動し、スクリプト経由でツール呼び出し

## Risks & unknowns

| リスク | 影響 | 状態 / 検証タイミング |
|---|---|---|
| ~~`input.client.session.prompt` で steer を送れる~~ → **送れない**（v1 client に `delivery` 無し・応答完了までブロック） | **致命的** | **解決済み（コード検証）**: `@opencode-ai/sdk/v2` クライアントを `serverUrl` から自前生成する |
| `delivery: "steer"` がアイドル時しか効かない | 機能制限 | **ほぼ否定（コード検証）**: アイドル時は wake で新規 run、実行中は turn 間で promote。Phase 1 で実機確認のみ |
| plugin プロセス → serverUrl の HTTP 呼び出しに認証が要る | 中 | Phase 1 spike — **BLOCKED**: opencode 1.17.15 で file:// URL による plugin ロードが機能せず。npm publish 後に検証 |
| パイプライン（`sh -c "a \| b"`）の SIGTERM で子孫が orphan 化 | リソース漏洩 | Phase 2 でプロセスグループ kill を実装、Phase 4 で検証 |
| opencode 本体が dispose を通らず死ぬと監視プロセスが残る | リソース漏洩 | Phase 4（親生存確認 or 既知の制限として明記） |
| ツール実装が Effect の core と型が合わない | 実装困難 | Phase 0 の hello world（v1 `tool()` は zod raw shape ベース、確認済み） |
| session.prompt の rate limit / キュー詰まり | 高負荷時不安定 | Phase 4 |
| opencode plugin API の破壊的変更（特に v2 plugin API に `tool` が来たら移行検討） | メンテ負荷 | リリースノート監視 |

## Reference materials

### 実装の参照元

opencode 本体は `~/Work/opencode` に clone 済み（2026-07-07 時点 `516f0266b`）。agmsg は必要になったら clone。

```bash
# agmsg（Claude Code Monitor 実装の参照用・未cloneなら）
git clone https://github.com/fujibee/agmsg.git
```

参照箇所（clone 済み opencode で行番号確認済み）:

- **opencode 既存 plugin**: `opencode/packages/opencode/src/plugin/openai/codex.ts` — WebSocket pool と background server 管理の実例
- **opencode plugin API**: `opencode/packages/plugin/src/index.ts` — Hooks interface（`dispose`/`event`/`tool` あり）
- **ツール定義ヘルパー**: `opencode/packages/plugin/src/tool.ts` — `tool()` + `ToolContext`（`sessionID`/`abort` を持つ）
- **v2 SDK session.prompt（steer 対応）**: `opencode/packages/sdk/js/src/v2/gen/sdk.gen.ts:5622-5656` — `POST /api/session/{sessionID}/prompt`
- **v2 クライアント生成**: `opencode/packages/sdk/js/src/v2/client.ts:50` — `createOpencodeClient({ baseUrl })`
- **steer のサーバ側実装**: `opencode/packages/core/src/session.ts:364-382`（admit + wake）、`opencode/packages/core/src/session/runner/llm.ts:187-196`（turn 間 promote）
- **plugin ローダー**: `opencode/packages/opencode/src/plugin/index.ts` — file/npm ロードと dispose 呼び出し

### 先行事例
- **[opencode PR #33806](https://github.com/anomalyco/opencode/pull/33806)** — ネイティブ Monitor の参照実装。セーフティガードの設計をそのまま借用
- **agmsg**: `agmsg/`（cloneしたdir） — Claude Code Monitor 実装箇所 (`scripts/drivers/types/claude-code/_delivery.sh`) と `scripts/drivers/types/claude-code/watch.sh` が動作参考
- **Codex shim**: `agmsg/scripts/drivers/types/codex/codex-monitor.sh` — 異アプローチ（app-server bridge）の比較用

### ドキュメント
- [Claude Code Monitor tool](https://agentpatterns.ai/tools/claude/monitor-tool/) — 仕様の権威
- opencode docs: plugin authoring（存在すれば）

## Open questions (実装中に決める)

1. **ツール名の prefix**: ~~`sentinel_*` にするか、素の `monitor` にするか~~ → **決定: `sentinel_*`**（冒頭の命名規則と統一。素の `monitor` はネイティブ Monitor（PR #33806）マージ時に名前衝突するため不可。Phase 7 の deprecate 移行も prefix があるほうが安全）
2. **コマンド実行権限**: shell tool と同じ permission フローに乗せるか、独自 allowlist か
   - 推奨: まずは shell と同等（既存の `permission.ask` フローに乗せる）
3. **監視対象の状態可視化**: TUI でアクティブ monitor 一覧を出すか
   - 推奨: post-MVP。まずは `monitor_list` ツールで十分
4. **persistent オプション**（ネイティブにあるやつ）を入れるか
   - 推奨: Phase 4 で追加。timeout_ms と二択

## 作業時間見積もり

- Phase 0: 30min
- Phase 1: 1-2h（spike なので手戻りあり）
- Phase 2: 2-3h
- Phase 3: 1-2h
- Phase 4: 2-3h
- Phase 5: 1-2h

**合計**: 7.5-12.5h ≈ 1-2日の集中作業、あるいは週末3-4時間×3週間

## 次のアクション（帰宅後すぐやること）

1. プロジェクト用ディレクトリに移動（この `PLAN.md` を配置したディレクトリ）
2. `git init && git add PLAN.md && git commit -m "docs: initial plan"`
3. Phase 0 のセットアップから開始
4. **Phase 1 の spike を必ず先にやる** — これが失敗すると全体が無駄になる
