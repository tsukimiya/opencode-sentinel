# agmsg: tmux 環境での opencode worker session spawn 対応

## Context

opencode-sentinel の `.plan/PLAN.md` Phase 7 構想の積み残し「agmsg統合 — `agmsg spawn opencode` が動くように」を実現する。agmsg(fujibee/agmsg)の spawn は tmux 内なら新ペイン/ウィンドウで worker エージェント CLI を起動し `/agmsg actas <name>` で登録させる仕組みだが、opencode の type manifest は `spawnable` 未設定で spawn 対象外。これを有効化し、tmux 環境で opencode の worker session を起動できるようにする。

**スコープ確定(ユーザー合意済み)**:
- spawn のみ。受信は既存の turn モード(ツール実行後 inbox 確認)のまま。monitor 統合(sentinel プラグイン経由のリアルタイム受信・readiness handshake)は次フェーズ。
- 実装先: **fujibee/agmsg を tsukimiya アカウントに fork し、feature branch で実装**(後日本家へ PR するかも)。

## 調査済みの前提

- agmsg spawn は完全にマニフェスト駆動(`scripts/spawn.sh:93,104` — `spawnable=yes` + `cli=` で direct-CLI 起動)。tmux 配置(`launch_in_tmux`, spawn.sh:338-367)・placement 記録・`despawn --force`(tmux pane/window kill)は型非依存で流用可。
- **核心ギャップ**: spawn.sh は初期プロンプトを positional で渡す(spawn.sh:322-327)が、opencode TUI の positional は project パス。初期プロンプトは `--prompt` フラグが必要(`opencode --help` 確認済み)。
- `monitor=no` の型は readiness 待機が自動スキップ(spawn.sh:478-481、codex と同運用)。タスクは `--boot-prompt` 同梱で渡す。
- opencode 用 agmsg スキルは `~/.config/opencode/skills/agmsg/SKILL.md` にインストール済み(install.sh:403-411)。
- ローカル環境: clone `~/Temp/agmsg`(origin=fujibee/agmsg, 1.1.0 でやや古い)、稼働インストールは `~/.agents/skills/agmsg`(v1.1.3)。
- このマシンの tsukimiya 名義 push は SSH ホスト別名 `github-tsukimiya`(鍵 `~/.ssh/id_ed25519_tsukimiya`)+ local git config `Kiryu Tsukimiya <71832+tsukimiya@users.noreply.github.com>` を使う(opencode-sentinel と同じ方式)。

## 実装内容

### 0. リポジトリ準備

1. ~~fork 作成~~ **済み: `tsukimiya/agmsg`(2026-07-08、Web UI で作成・存在確認済み)**
2. `~/Work/agmsg` に clone: `git clone git@github-tsukimiya:tsukimiya/agmsg.git`、`upstream` に fujibee/agmsg を追加
3. local git config を tsukimiya 名義に設定、feature branch `feat/opencode-spawn` 作成
   - 補足: tsukimiya 名義の gh 操作(PR 作成等)は `GH_TOKEN=$(cat ~/.config/gh/tsukimiya.token) gh ... -R tsukimiya/agmsg`(PAT の Repository access に tsukimiya/agmsg を追加してもらうこと)

### 1. `scripts/drivers/types/opencode/type.conf` — 4行追加

```diff
 name=opencode
 template=template.md
+cli=opencode
+spawnable=yes
+model_arg=--model
+prompt_arg=--prompt
 detect_proc=opencode opencode-*
 hooks_file=.opencode/rules/agmsg.md
 monitor=no
 delivery_modes=turn off
```

### 2. `scripts/spawn.sh` — 汎用キー `prompt_arg=` 導入(唯一の本体変更)

`model_arg` と同じデータ駆動パターン。ブートスクリプト組み立ての direct-CLI 分岐(spawn.sh:322-327)を変更:

```bash
PROMPT_ARG="$(agmsg_type_get "$AGENT_TYPE" prompt_arg)"   # 型resolve部に追加
...
printf '%q' "$CLI_BIN"
[ -n "$MODEL_ID" ] && printf ' %s %q' "$MODEL_ARG" "$MODEL_ID"
if [ -n "$PROMPT_ARG" ]; then
  printf ' %s %q\n' "$PROMPT_ARG" "$ACTAS_PROMPT"   # opencode: --prompt "..."
else
  printf ' %q\n' "$ACTAS_PROMPT"                     # 既存型: positional(挙動不変)
fi
```

既存型(claude-code/codex/gemini 等)は `prompt_arg` 未定義なので影響なし。

### 3. ドキュメント・テンプレート

- `scripts/drivers/types/opencode/template.md` に spawn/despawn 節を追記(despawn は watcher が無いため `--force` 運用であることを明記)
- README の型対応表(あれば)で opencode を spawnable に更新
- リポジトリに既存テスト/shellcheck CI があれば通す(実装時に `ls test` / `.github/workflows` を確認)

### 4. ローカル反映(検証用)

検証は稼働インストール `~/.agents/skills/agmsg` に同じ差分を適用して行う(v1.1.3 と clone main の乖離に注意 — spawn.sh の該当部が同一か diff で確認してから適用)。

## 検証手順(tmux 実機 E2E)

前提: tmux セッション内、agmsg チーム登録済みのプロジェクトで実施。

1. **ゲート確認**: `spawn.sh opencode worker1` 実行前に `spawn.sh badtype x` で supported 一覧に opencode が出ること
2. **spawn**: 親(Claude Code など既存メンバー)から `~/.agents/skills/agmsg/scripts/spawn.sh opencode worker1 --boot-prompt "READMEを読んで要約を親に send して"` → 新 tmux ペインに opencode TUI が起動、`--prompt` の初期プロンプトが投入される
3. **actas 登録**: worker1 がスキル経由で actas を完了し `team.sh <team>` に載る
4. **メッセージ疎通**: 親から `send.sh <team> <parent> worker1 "ping"` → worker1 の turn モード(ツール実行後 inbox 確認)で受信されること
5. **--model パススルー**: `--model <provider/model>` 付き spawn で opencode が指定モデルで起動
6. **despawn**: `despawn.sh <team> <parent> worker1 --force` → ペインが閉じ、placement 記録と actas ロックが片付く
7. **リグレッション**: `spawn claude-code test1`(prompt_arg 無し型)が従来どおり動く
8. clone 側でリポジトリの既存テストスイートを実行

## リスク・実装時確認事項

1. **`/agmsg actas <name>` を opencode が解釈できるか**: opencode に `/agmsg` スラッシュコマンドは無く、`~/.config/opencode/skills/agmsg/SKILL.md` のスキルトリガー(プレーンプロンプトとしてモデルがスキルを発動)に依存。E2E 手順3で最優先確認。ダメなら boot プロンプト文言の調整(スキル名を自然文で指す等)を opencode template 側で検討。
2. **opencode の actas フロー対応**: opencode 用 template.md に actas 節があるか未確認。無ければ codex template を参考に追記(actas-claim.sh 自体は型非依存)。
3. **`--prompt` の TUI 挙動**: 初期プロンプトが自動送信されるか(入力欄に置かれるだけではないか)。手順2で確認。
4. **graceful despawn 不可**: watcher が無いので `ctrl:despawn` は次 turn まで読まれない。`--force` 運用を明記(仕様として許容)。
5. clone(main)と稼働インストール(v1.1.3)の乖離。ローカル反映前に必ず diff 確認。

## 関連

- 次フェーズ候補(スコープ外): opencode の `monitor=yes` 化 — opencode-sentinel プラグインを delivery 経路にしたリアルタイム受信 + spawn readiness handshake(`.plan/PLAN.md` Phase 7)
- 別プラン進行中: [monitor-sidebar-claude-code-status-swift-moth.md](monitor-sidebar-claude-code-status-swift-moth.md)(TUI sidebar 表示、承認待ち)
