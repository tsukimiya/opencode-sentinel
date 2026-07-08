# HANDOFF - 2026-07-08 18:01

## 使用ツール
Claude Code (Fable 5) — plan mode での設計セッション + Explore/Plan subagent 併用

## 現在のタスクと進捗
- [x] **実装プラン2本作成**(承認保留・未着手、`.plan/` にコピー済み・remote push 済み):
  - `.plan/agmsg-opencode-spawn-tmux.md` — agmsg で opencode worker を tmux spawn(**優先・先に実施**)
  - `.plan/monitor-sidebar-claude-code-status-swift-moth.md` — monitor 状況の TUI sidebar 常時表示(後)
- [x] **ロードマップ整備**: GitHub Issues [#1](https://github.com/tsukimiya/opencode-sentinel/issues/1)〜[#5](https://github.com/tsukimiya/opencode-sentinel/issues/5) + Milestone「Post-MVP Roadmap」作成済み(優先順: #1 条件マッチ通知 → #2 agmsg monitor=yes → #3 steer/parts ハイブリッド → #4 sentinel_tail → #5 OS通知)
- [x] **tsukimiya 名義の gh 運用確立**: PAT(`~/.config/gh/tsukimiya.token`、opencode-sentinel と agmsg の両方に admin/push 権限確認済み)
- [x] **agmsg fork 作成済み**: `tsukimiya/agmsg`(ユーザーが Web UI で作成、存在確認済み)
- [ ] **docs/plans ブランチの main への merge**: 未決(main 直 push は常設ルールで禁止のためブランチ push で終了。merge はユーザー GO 待ち)

## 試したこと・結果
- **opencode TUI プラグイン調査(sidebar プランの根拠)**: sidebar 描画は TUI プラグイン(`api.slots.register` の `sidebar_content` スロット、Solid JSX)のみ可能。server と TUI は排他モジュールで exports 分割(`./server` / `./tui`)が必要。参考実績 hkay-dev/opencode-limits-sidebar。server→TUI のカスタムイベント push は不可(`/tui/publish` は閉じた union)→ 状態ファイル + 1秒ポーリング方式を採用。
- **agmsg spawn 機構調査(spawn プランの根拠)**: type.conf マニフェスト完全駆動(`spawnable=yes` + `cli=`)。核心ギャップは「opencode TUI の初期プロンプトは positional 不可・`--prompt` フラグ必須」→ spawn.sh に汎用 `prompt_arg=` キー追加で解決する設計。tmux 配置・despawn --force は型非依存で流用可。
- **gh の tsukimiya 操作(失敗→解決)**: gh は `GH_TOKEN` 環境変数で sxd-nakai-hiroki 固定であることを確認 → Fine-grained PAT 差し替え方式(`GH_TOKEN=$(cat ~/.config/gh/tsukimiya.token) gh ... -R tsukimiya/<repo>`)で解決。remote が SSH エイリアスのため `-R` 明示必須。
- **main への直 push(ブロック)**: 常設ルールで拒否されたため `docs/plans` ブランチ(commit `945d0db`)に push。

## 次のセッションで最初にやること
1. `.agents/memory/MEMORY.md` と本ファイルを読む
2. **agmsg spawn プランの実行**: `~/Work/agmsg` に clone(`git@github-tsukimiya:tsukimiya/agmsg.git`、upstream=fujibee/agmsg、local git config を tsukimiya 名義に)→ `feat/opencode-spawn` ブランチで type.conf + spawn.sh 実装 → ローカルインストール(`~/.agents/skills/agmsg` v1.1.3)に差分適用して tmux E2E 検証
3. その後: monitor sidebar プラン → Issue #1〜#5 の順
4. `docs/plans` ブランチの main への取り込み可否をユーザーに確認(PR URL: https://github.com/tsukimiya/opencode-sentinel/pull/new/docs/plans)

## 注意点・ブロッカー
- **main への直 push・直 commit は禁止**(常設ルール)。ブランチ + PR 運用。
- **tsukimiya 名義の gh 操作**は必ず `GH_TOKEN=$(cat ~/.config/gh/tsukimiya.token)` 差し替え + `-R` 明示。fork の**作成**だけは PAT 不可(Web UI)。
- **agmsg spawn プランの最大の不確実点**: boot プロンプト `/agmsg actas <name>` を opencode がスキル(`~/.config/opencode/skills/agmsg/SKILL.md`)経由で解釈できるか。E2E 最優先確認項目。
- **sidebar プランの不確実点**: `.opencode/plugin/` 自動ロードが TUI プラグインに効くか(不可なら `opencode plugin <dir> -g`)、`dist/*.jsx` の loader 挙動。
- `.agents/memory/` はまだ untracked(remote に無い)。別マシン再開で MEMORY.md が必要なら commit 対象に含めるか要判断。
- 前セッションからの残課題(任意): opencode 本体への issue 報告2件(serverUrl ダミー / steer がアイドルで消える)は未着手のまま。
