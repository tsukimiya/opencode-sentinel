# MEMORY — opencode-sentinel

プロジェクト横断で蓄積した技術的知見と運用ルール。AGENTS.md と重複しない内容のみ。

## プロジェクト構造

- **本体**: `tsukimiya/opencode-sentinel` — OpenCode 用 Monitor プラグイン(v0.1.3)
- **fork**: `tsukimiya/agmsg` (parent: `fujibee/agmsg`) — agmsg 統合の改修を保持
- **関連スキル**: `~/.config/opencode/skills/agmsg/SKILL.md`(agmsg actas を opencode が解釈する口)
- **デフォルトブランチ**: `main`(main 直 commit 禁止 → ブランチ + PR 運用)

## OpenCode プラグイン開発の必須知識(再発防止)

- **配置ディレクトリ**: `~/.config/opencode/plugins/`(PLURAL `plugins`、`plugin` 不可)
- **エクスポート形式**: named export `export const Name: Plugin = async (ctx) =>`(`export default` は不可)
- **tool args の schema**: `tool.schema.string()` を使う(zod の `z.string()` は不可)
- **Plugin context**: `{ project, client, $, directory, worktree }`(`input: any` ではない)
- **steer 配信(v2 client)**:
  - `createOpencodeClient({ baseUrl })` from `@opencode-ai/sdk/v2`
  - `v2.session.prompt({ sessionID, prompt: {text}, delivery: "steer" })`
  - localhost:4096 で認証なし動作
- **`/tui/publish` は閉じた union** → server→TUI のイベント push は不可。状態ファイル + ポーリング方式を採用(sidebar プラン)。

## tsukimiya 名義の運用(毎回ハマるので厳守)

- **gh**: `GH_TOKEN=$(cat ~/.config/gh/tsukimiya.token) gh ... -R tsukimiya/<repo>`(default 認証は sxd-nakai-hiroki 固定のため PAT 差し替え必須、`-R` 明示も必須(remote が SSH エイリアスのため))
- **git push**: SSH ホスト別名 `github-tsukimiya`(鍵 `~/.ssh/id_ed25519_tsukimiya`)
- **local git config**: `Kiryu Tsukimiya <71832+tsukimiya@users.noreply.github.com>`
- **fork の作成だけは PAT 不可**(Web UI 必須)

## agmsg 統合の完了状態(重要: 再実装防止)

**spawn も monitor=yes も実装済み**。次セッションで「まだか」と誤判断しないこと。

- **Issue #2(monitor=yes 化)は COMPLETED**(2026-07-10 close)
- **sentinel 側(PR #9)**: watcher 子プロセスに `SENTINEL_SESSION_ID` を注入(`src/lib/watcher.ts` の `spawn` の `env`)。agmsg 側 watch.sh はこの ID を watermark の永続化キーに使う。
- **agmsg fork 側 `feat/opencode-spawn`(SHA `33663984`)**:
  - `scripts/drivers/types/opencode/type.conf` に `cli=opencode` / `spawnable=yes` / `prompt_arg=--prompt` を追加
  - **方針変更の理由**: `opencode run --interactive` は boot プロンプトの turn 完了で即座に exit してしまい worker が滞在しない。`opencode --prompt "<text>"`(TUI モード)なら自動送信 + TUI 滞在。**live testing 済み**。
  - `.plan/agmsg-opencode-spawn-tmux.md` にあった `prompt_arg=` 汎用キー導入(spawn.sh 本体変更)は不要になった(copilot/antigravity と同様の既存機構に乗ったため)。
- **agmsg fork 側 `feat/opencode-monitor`(SHA `80d2200c`)**: `_delivery.sh`, `template.md`, `type.conf`, tests を修正(2コミット)。PR #9 と対。
- **E2E 実績**(前セッション・別マシン hirokinakai): アイドル opencode worker へのリアルタイム配信(実測13秒)・spawn readiness handshake・graceful despawn を tmux 実機で確認済み。

### 残課題(agmsg 関連)

- 本家 `fujibee/agmsg` への PR 提出(任意・ユーザー判断)
- **このマシン(tsuki)でのローカル検証は未実施** → `tsukimiya/agmsg` を clone して fork ブランチ2つを取り込む必要あり

## よくハマるポイント

- **main 直 push は常設フックで拒否** → 必ずブランチを切る
- **`.opencode/plugin/`(単数形) vs `~/.config/opencode/plugins/`(複数形)**: ローカル開発時の自動ロードは `.opencode/plugin/`、グローバルインストールは `~/.config/opencode/plugins/`
- **grep をパイプするときは `--line-buffered` 必須**(block buffering で遅延するため)
- **`opencode plugin <dir> -g`** でグローバル TUI プラグイン導入(参考実績: hkay-dev/opencode-limits-sidebar)

## テスト・品質ゲート

- `bun test`: 27 unit tests(-manager CRUD・util・watcher batch/flood/exit・env受け渡し)
- `bunx tsc --noEmit`: strict モード・クリーン
- 実機検証: `sentinel_ping` / `sentinel_spike` / `sentinel_monitor` / `sentinel_stop` / `sentinel_list` の5ツールで live 確認
