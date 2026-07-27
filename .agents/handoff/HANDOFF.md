# HANDOFF - 2026-07-28 02:24 JST

## 現在のタスクと進捗

### 直近セッション(2026-07-28 tsuki マシン)
- [x] **状況把握**: HANDOFF.md(旧: 2026-07-08) と GitHub 上の PR/Issue 状態のズレを解消
- [x] **fork 側ブランチ状況を確認**: `tsukimiya/agmsg` に `feat/opencode-spawn`(SHA `33663984`) と `feat/opencode-monitor`(SHA `80d2200c`) が既に存在・実装済み
- [x] **MEMORY.md 新規作成**(存在しなかった)・HANDOFF.md アーカイブ(旧ファイルは `.agents/handoff/2026-07-28-0224.md` へ)
- [ ] **docs ブランチを PR 化**(`docs/refresh-memory-handoff`): 本ファイルと MEMORY.md, learnings.md の更新を land する
- [ ] **agmsg E2E 検証(このマシン)**: `tsukimiya/agmsg` を clone → fork ブランチ2つを取り込んで tmux 実機検証(ユーザー指示「このマシンで検証」)

### コード状況
- **ブランチ**: `docs/refresh-memory-handoff`(main から分岐)
- **main の HEAD**: `14f3f83 chore(release): bump version to 0.1.3 (#8)`
- **PR #9** は別マシンでマージ済み(2026-07-10): `feat(monitor): expose session id to watcher child via SENTINEL_SESSION_ID`(`src/lib/watcher.ts` に env 注入1行 + test)
- **変更内容**(本ブランチ):
  - `.agents/memory/MEMORY.md`(新規)
  - `.agents/handoff/HANDOFF.md`(旧をアーカイブ → 新規作成)
  - `.sisyphus/notepads/opencode-sentinel/learnings.md`(Phase 0 初期メモ → 実 Discoveries に書き直し・前セッションでの変更)

## ロードマップ状況(Milestone: Post-MVP Roadmap)

| # | Issue | 状態 | 摘要 |
|---|---|---|---|
| #1 | 条件マッチ通知(filter/until) | **OPEN** | 最優先候補 |
| #2 | agmsg 統合(monitor=yes 化) | **CLOSED** 2026-07-10 | PR #9 + agmsg fork で完了 |
| #3 | steer/parts ハイブリッド配信 | OPEN | 実行中セッションへの即時割り込み |
| #4 | sentinel_tail(履歴照会) | OPEN | monitor 出力履歴の照会ツール |
| #5 | OS 通知(attention.notify) | OPEN | monitor イベントの OS 通知連携 |

## agmsg fork の状態(要理解)

- **2ブランチが実装済み**:
  - `feat/opencode-spawn`: opencode TUI を `--prompt` で spawn。live testing 済み。
  - `feat/opencode-monitor`: `_delivery.sh` 経由で sentinel 配信。PR #9 と対。
- **本家 `fujibee/agmsg` への PR は未提出**(ユーザー判断待ち)
- **このマシン(tsuki)には agmsg のローカル clone がない** → 検証時は `~/Work/agmsg` あたりに clone する

## 次のセッションで最初にやること

1. `.agents/memory/MEMORY.md` と本ファイルを読む(必須・AGENTS.md 指示)
2. **docs PR が merge 済みか確認**(未なら merge 待ち・ユーザー判断)
3. **agmsg E2E 検証をやる場合**:
   - `git clone git@github-tsukimiya:tsukimiya/agmsg.git ~/Work/agmsg`
   - `upstream` に `fujibee/agmsg` を追加
   - `feat/opencode-spawn` と `feat/opencode-monitor` を両方取り込んだ検証用ブランチを作る(または順番に checkout して検証)
   - ローカルの `agmsg` コマンド(npm global・v?)を fork 版に向けるか、`~/.agents/skills/agmsg` に適用
   - tmux セッション内で `spawn.sh opencode worker1 --boot-prompt "..."` → TUI 起動・actas・メッセージ疎通・despawn を確認
4. **agmsg をスキップして Issue #1 等を進める場合**: `.plan/monitor-sidebar-claude-code-status-swift-moth.md`(TUI sidebar) または Issue #1 の設計から着手

## 注意点・ブロッカー

- **main 直 commit 禁止**: 常設フックで拒否。必ずブランチ + PR。
- **tsukimiya 名義の gh**: `GH_TOKEN=$(cat ~/.config/gh/tsukimiya.token)` + `-R tsukimiya/<repo>`(詳細は MEMORY.md の「tsukimiya 名義の運用」)
- **前セッションは別マシン(hirokinakai)** で進行していたため、ローカル PATH や clone 状態が異なる。このマシンでの再検証が必要。
- **`.plan/agmsg-opencode-spawn-tmux.md` は古い方針**(prompt_arg 汎用キー導入を謳っているが、実際は既存機構で解決済み)。履歴として保持、実装時は fork ブランチのコミットメッセージ(`33663984`)を参照すること。
- **MEMORY.md は以前 untracked だった** が、今回の PR で tracked 化する(別マシンでも再開できるように)。

## 残課題(任意・優先度低)

- 本家 `fujibee/agmsg` への PR 提出(spawn / monitor それぞれ)
- opencode 本体への issue 報告2件(HANDOFF 旧版より): serverUrl ダミー / steer がアイドルで消える — 未着手
- sidebar プラン(`.plan/monitor-sidebar-claude-code-status-swift-moth.md`): 承認待ち・未着手
