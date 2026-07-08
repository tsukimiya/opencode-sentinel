# Monitor 状況の TUI sidebar 常時表示

## Context

opencode-sentinel の monitor は現状、状態確認の手段が `sentinel_list` ツール(エージェント経由)とセッションメッセージ通知しかなく、「今なにが監視されているか」をユーザーが一目で把握できない。Claude Code の statusline「1 monitor」+ 詳細ビューに相当する常時表示を、opencode の TUI sidebar に追加する。

表示粒度はユーザー確認済み: **コンパクト+直近出力**(1 monitor = 説明・経過時間・行数の1行 + 直近出力1行を dim 表示。0件時は完全非表示)。

```
Sentinel · 2 monitors
● pytest watch      3m 12s · 47 lines
  └ tests/test_foo.py::test_bar PASSED
● tail app.log      12m 05s · 310 lines
  └ [ERROR] connection refused
```

## アーキテクチャ判断

- **TUI プラグイン方式が唯一の正攻法**。opencode の TUI プラグイン(`TuiPluginModule.tui`)から `api.slots.register({ slots: { sidebar_content } })` で Solid JSX を sidebar に描画する(`node_modules/@opencode-ai/plugin/dist/tui.d.ts:355-505`)。server プラグインの Hooks には sidebar 描画手段がない(toast のみ)。
- **server/TUI は排他モジュール**(`tui?: never` / `server?: never`)。1パッケージで exports パスを分けて両方持つ(参考実績: [hkay-dev/opencode-limits-sidebar](https://github.com/hkay-dev/opencode-limits-sidebar) — `"."`/`"./server"`/`"./tui"` 分割、tsc で `dist/*.jsx` を jsx:preserve 出力、`opencode plugin <dir> -g` で導入)。
- **server→TUI の状態受け渡しは状態ファイル + TUI 側1秒ポーリング**。
  - 共有 singleton は `opencode serve` + 別プロセス TUI で壊れるため却下。カスタムイベント push は `/tui/publish` が閉じた union のみで不可。
  - パス合意: server 側 `input.worktree`、TUI 側 `api.state.path.worktree` から同一キーを導出。`os.tmpdir()/opencode-sentinel-<sha256(worktree).slice(0,12)>.json`。
  - ステール対策: JSON に `updatedAt`、monitor >0 の間だけ server が5秒 heartbeat 再書き込み。TUI は `now - updatedAt > 15s` で非表示。書き込みは `.tmp` → `renameSync` のアトミック置換、500ms debounce。
  - スキーマ: `{ updatedAt: number, monitors: [{ id, description, command, startedAt, linesEmitted, recentLines: string[] }] }`

## 変更ファイル

### 新規
- `src/lib/state-file.ts` — `SentinelState` 型、`stateFilePath(worktree)`、`writeState()`(アトミック)、`readState(): SentinelState | null`。server/TUI 共有の純 TS。
- `src/tui/index.tsx` — TUI エントリ。`/** @jsxImportSource @opentui/solid */` + `api.slots.register` で `sidebar_content` に `<SentinelSidebar/>`。`onMount` で1秒 `setInterval`(ファイル読み+runtime再計算)、`onCleanup`/`api.lifecycle.onDispose` で解除。`<Show when={monitors().length > 0}>` で0件時 null。default export `{ id: "opencode-sentinel", tui }`。
- `src/tui/format.ts` — `formatRuntime(startedAt, now)`(`3m 12s`)、`truncate()` の純関数。
- `tsconfig.tui.json` — `jsx: "preserve"`, `jsxImportSource: "@opentui/solid"`, `outDir: "dist"`, include: `src/tui` + `src/lib/state-file.ts`。
- `.opencode/plugin/opencode-sentinel-tui.tsx` — 開発時自動ロード用再エクスポート(効かなければ削除し `opencode plugin <dir> -g` 運用)。
- `test/state-file.test.ts`, `test/format.test.ts`

### 変更
- `src/lib/manager.ts` — `MonitorEntry` に `recentLines: string[]`(上限5、shift で捨てる)。`incrementLines(id)` → `recordLine(id, line)` に置換(`MonitorEntryPublic` にも `recentLines` 追加)。`bindStateFile(path)` 追加: 以後 start/stop/recordLine/dispose 末尾で debounce 永続化、monitor >0 の間だけ 5秒 heartbeat、0件で空状態書き込み。path 未 bind なら全て no-op(既存テスト非影響)。
- `src/lib/watcher.ts` — `incrementLines` 呼び出しを `recordLine(id, line)` に(1行)。
- `src/index.ts` — 初期化時に `manager.bindStateFile(stateFilePath(input.worktree))`。
- `package.json` — deps 追加(`solid-js`, `@opentui/solid`, `@opentui/core`)、exports 分割(`.`/`./server` = `src/index.ts` 据え置き、`./tui` = `./dist/tui/index.jsx` + `config: { enabled: true, sidebar: true }`)、`files` に `dist`、scripts に `build: tsc -p tsconfig.tui.json` + `prepublishOnly`。
- `tsconfig.json` — include に `src/**/*.tsx`、`jsx`/`jsxImportSource` を base に追加(typecheck 用)。
- `README.md` / `README_ja.md` — sidebar 機能と必要 opencode バージョンを追記。

## 実装順序

1. `src/lib/state-file.ts` + テスト
2. `manager.ts` の recordLine / bindStateFile + `watcher.ts` 呼び替え + テスト追記 → `bun test`
3. `src/index.ts` に bindStateFile 配線
4. deps / tsconfig 整備
5. `src/tui/format.ts` + テスト、`src/tui/index.tsx`
6. `package.json` exports/build → `bun run build` / `bun run typecheck`
7. `.opencode/plugin/opencode-sentinel-tui.tsx` → TUI 実機検証(下記)
8. README 追記

## 検証

- **自動**: `bun test`(state-file roundtrip・壊れJSON→null・パス決定論性 / recordLine のカウント+ring上限 / bindStateFile 後の start→stop でファイル遷移 / formatRuntime 境界 59s/60s/1h)、`bun run typecheck`、`bun run build`。
- **TUI 実機**:
  1. `.opencode/plugin/` 経由で TUI プラグインがロードされるか確認(一時 `api.ui.toast` or `api.plugins.list()`)。不可なら `opencode plugin /home/hirokinakai/Work/opencode-sentinel -g` に切替。
  2. `sentinel_monitor` で `ping -i 1 localhost` → sidebar に表示・runtime が進む・lines 増加・直近行表示。
  3. `sentinel_stop` → ≦1.5秒で非表示。
  4. `opencode serve` + 別プロセス TUI でも 2-3 を再確認(プロセス跨ぎ本命ケース)。
  5. kill -9 → 再起動で ghost 表示が15秒以内に消える。

## リスク・未確認点

1. `.opencode/plugin/` の自動ロードが TUI プラグインにも効くか未確認(`TuiPluginEntry.source: "file"` があるので有望)。不可でも `opencode plugin <dir> -g` で回避可、計画の他部分に影響なし。
2. exports の `config: { enabled, sidebar }` の意味論は非公開(参考実装の踏襲)。
3. `dist/*.jsx`(jsx preserve)のロードは opencode loader の solid 変換前提。参考実装で実績あり。TUI API は新しめの opencode が必要 → README に明記。
4. 同一 worktree で opencode 2個起動時は状態ファイル後勝ち上書き(許容)。

## ADR 候補

- server→TUI の状態受け渡しに「tmp 状態ファイル + ポーリング」を採用(共有 singleton・イベント push を却下)— 元に戻しにくい配布形態(exports 分割・build 導入)を伴うため。
