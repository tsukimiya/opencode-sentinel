# ADR 0001: agmsg 本家への還元は保留し、fork で運用する

## Status

Accepted（2026-07-28）

## Context

`opencode-sentinel` は、opencode に欠けている Claude Code 標準の Monitor 相当を補うアドホックなプラグインで、`sentinel_monitor` ツール（バックグラウンドプロセス監視 + steer 通知）を提供する。

一方 `agmsg`（fujibee/agmsg）は汎用的なクロスエージェントメッセージングツールで、各種 Agent CLI（claude-code / codex / gemini / opencode 等）を manifest 駆動で扱う。opencode 型はデフォルトで `monitor=no` で、アイドル状態ではリアルタイム受信ができず、各 turn の終わりでしかメッセージを確認できない（turn モード）。

このレイテンシを解消するため、fork（tsukimiya/agmsg）に2つのブランチを追加した:

- `feat/opencode-spawn`：`opencode --prompt` で worker を起動
- `feat/opencode-monitor`：`sentinel_monitor` ツール経由で `watch.sh` を常駐させるリアルタイム受信モード

### 解決したい課題

`feat/opencode-monitor` ブランチの実装は `sentinel_monitor` ツール（サードパーティプラグイン）に**ハード依存**している。この依存構造を、汎用ツールである agmsg 本家にそのまま取り込んでよいか、現時点では判断できない。

### 検討した選択肢

| | アプローチ | 概要 |
|---|---|---|
| **A** | fork 維持 | 本家へ還元しない。fork（tsukimiya/agmsg）だけで運用 |
| **B** | graceful degradation 付き PR | 「sentinel 推奨・なければ turn に fallback」を明示して本家 PR |
| **C** | agmsg 本体に内蔵 | monitor 機能を agmsg 標準機能として内蔵（sentinel から分離） |
| **D** | opencode 本体標準化 | sentinel 相当を opencode 本体に PR し、「標準 Monitor」に依存する形に |

### 各選択肢の評価

| 観点 | A: fork | B: degradation PR | C: 本体内蔵 | D: 標準化 |
|---|---|---|---|---|
| 本家の清潔さ | ★★★（影響なし） | ★★（オプション依存） | ★（機能重複） | ★★★（依存先が標準） |
| 普及度 | ★（fork 利用者限定） | ★★（本家利用者にも） | ★★★（最初から入る） | ★★★（理想） |
| 導入リスク | ★★★（低） | ★★（政治的調整） | ★（agmsg 肥大化） | ★（最大リードタイム） |
| 情報の揃い具合 | −（今すぐ実行可） | △（設計が未成熟） | ×（同左） | ×（opencode チームの合意要） |
| 実装コスト | 低（既に完了） | 中（capability detection） | 高（機能重複） | 高（本体 PR） |

## Decision

**agmsg 本家（fujibee/agmsg）への還元は、設計判断材料が揃うまで無期限で保留し、当面は fork（tsukimiya/agmsg）で運用する。**

### 1. 選定理由

核心の懸念は「特定サードパーティプラグイン（`tsukimiya/opencode-sentinel`）へのハード依存が、汎用ツールである agmsg 本家の性質に合うか」である。現時点では Issue #1（条件マッチ通知）等が未実装で、`sentinel_monitor` の API や運用がどう変わるか予測できない。成熟度が不十分な段階で本家に還元すると、将来の設計変更時に本家・利用者双方に混乱が及ぶリスクがある。

### 2. 保留中の運用

- fork（tsukimiya/agmsg）で `feat/opencode-spawn` / `feat/opencode-monitor` を維持
- 当該機能が必要なユーザーは明示的に fork を利用（fork の README にインストール手順を記載）
- fujibee/agmsg 本家とは定期的に rebase して追従

### 3. 再検討のトリガー

以下のいずれかを満たした時、本家還元（B/C/D の選択）を再検討する:

- `sentinel_monitor` の API が数バージョンの運用で安定した
- opencode-sentinel の Issue #1（条件マッチ通知）等が実装され、機能スコープが確定した
- fujibee/agmsg 本家で同じニーズスの Issue/PR が出た
- opencode 本体標準化（D）の目途が立った

## Consequences

### Positive

- 設計判断を誤るリスクなく時間を稼げる
- 本家に負担をかけない（未決の設計議論を持ち込まない）
- fork で実績が積める（将来の本家 PR の素材になる）
- opencode-sentinel 本体（Issue #1 等）にリソースを集中できる

### Negative

- 利用者は fork を意識する必要がある（普及度が限定的）
  - → fork 側の README・インストール手順・`opencode-sentinel` 側の agmsg 連携手順を整備して軽減
- 本家との追従コスト（fujibee 側の更新の rebase）
  - → fujibee/agmsg のリリース頻度は低いので、月1確認程度で実質負担は小さい
- 本家が別実装で同じ機能を取り込んだ場合、fork が無駄になる
  - → fujibee/agmsg の Issue/PR を watch して察知

### Risks

- **fork が腐るリスク**：メンテナのリソース低下で陳腐化
  - → opencode-sentinel 本体開発の節目（Issue 実装等）で fork も振り返る
- **依存の向きが歪むリスク**：fork での運用が常態化すると本家との乖離が拡大
  - → 本 ADR で「保留」という態度を明示することで、「意図的な先送り」であることを記録

## 決めていないこと

| 項目 | 決めない理由 | いつ決めるか |
|---|---|---|
| 本家還元そのものをやるか | 機能成熟度不足・依存構造が未定 | sentinel API が安定・Issue #1 実装後 |
| 還元時の方法（B/C/D） | 依存先（fork / fork+α / 本体標準）によって選べない | 同上。opencode 本体の態度も影響するため |
| fork の npm publish | 現時点ではニーズ不明 | fork 利用者からの要望が出た時 |

## Notes

### 参考資料

- 今セッションの会話履歴（opencode-sentinel/.agents/handoff/HANDOFF.md 2026-07-28 03:55 JST 版・ローカル）
- `tsukimiya/agmsg` fork の `feat/opencode-spawn`（commit `33663984`）・`feat/opencode-monitor`（commit `80d2200c`）
- opencode-sentinel Issue #2「agmsg 統合 — sentinel 配信経路による monitor=yes 化」（CLOSED 2026-07-10）
- opencode-sentinel PR #9「feat(monitor): expose session id to watcher child via SENTINEL_SESSION_ID」（本家 monitor 側の調整）
