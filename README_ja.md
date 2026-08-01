# OpenCode Sentinel

opencode 用の Monitor プラグイン。バックグラウンドプロセスの stdout をリアルタイムでエージェントに通知します。

## 機能

- **プロセス監視**: 任意のシェルコマンドをバックグラウンドで実行し、stdout の各行をエージェントに steer 通知
- **並行監視**: 複数の monitor を同時起動可能
- **200ms バッチ**: 高頻度の出力を 200ms 間隔でまとめて通知（レート制限）
- **フラッド対策**: 100 行/秒を超えると自動停止
- **stderr 分離**: stderr は `/tmp/sentinel-{id}-stderr.log` に記録
- **クリーンアップ**: セッション終了・プラグインアンロード時に全プロセスを自動停止

## インストール

```json
// opencode.json に追加
{
  "plugin": ["opencode-sentinel"]
}
```

またはファイルパス指定:

```json
{
  "plugin": ["file:///path/to/opencode-sentinel/src/index.ts"]
}
```

## 使い方

### ログ監視

```
sentinel_monitor で /var/log/app.log の ERROR 行を監視して
```

エージェントが以下のツールを呼び出します：
- `sentinel_monitor` — 監視開始（コマンド + 説明ラベル）
- `sentinel_stop` — 指定した monitor を停止
- `sentinel_list` — 実行中の monitor 一覧

### grep を使う場合の注意

パイプで grep を使う場合は **必ず `--line-buffered` を指定**してください。

```
✅ tail -f /var/log/app.log | grep --line-buffered ERROR
❌ tail -f /var/log/app.log | grep ERROR
```

### 出力のフィルタリング (filter)

JavaScript の正規表現を `filter` に渡すと、マッチした行だけ通知します:

```
sentinel_monitor with:
  command: tail -f /var/log/app.log | grep --line-buffered -E "(ERROR|WARN)"
  filter: "ERROR"
```

ERROR 行だけが通知され、WARN 行は通知されません。

### ワンショット待機 (until)

`until` を使うと、マッチした行が現れた時点で monitor を自動終了します。
「CI が終わったら起こして」のような sleep ポーリング不要のパターンに最適:

```
sentinel_monitor with:
  command: gh run watch <run-id>
  until: "(completed|failed)"
```

`until` がマッチすると該当行が通知され、monitor は自動的に終了します。
`filter` と組み合わせて、まずストリームを絞ってから `until` を評価することもできます:

```
sentinel_monitor with:
  command: tail -f build.log
  filter: "(error|fatal)"
  until: "BUILD (SUCCESS|FAILED)"
```

## 制限事項

- **プロセスの孤児化**: opencode 本体が `SIGKILL` などで強制終了した場合、監視プロセスが残る可能性があります。通常の終了（`dispose` フック経由）では全プロセスが停止されます。
- **即時割り込み不可**: エージェントが LLM 応答のストリーミング中は、その turn が終わるまで steer 通知は取り込まれません。アイドル時は 500ms 以内に反応します。

## steer と queue の違い

sentinel は `delivery: "steer"` を使用してエージェントに通知を送ります。これは opencode の `delivery` パラメータの2つのモードと以下のように異なります：

| モード | 挙動 |
|--------|------|
| **steer**（sentinel が使用） | アイドル時は即座にエージェントを wake して新規 run を開始。実行中は現在の provider turn が終了した後、次の turn の冒頭で取り込まれる。ストリーミング中は割り込み不可。 |
| **queue** | run が完了するまでキューに溜められ、次のユーザー入力時にまとめて取り込まれる。リアルタイム性が必要な監視には不向き。 |

steer を選択している理由：
- **リアルタイム性**: アイドル時の即時 wake により、ログ監視の即応性を確保
- **割り込み抑制**: 実行中の LLM 応答は妨げず、turn の切れ目で自然に取り込まれる
- **キュー詰まり防止**: queue だと長時間 run 中に通知が滞留するのを回避

## 技術スタック

- TypeScript (strict)
- @opencode-ai/plugin (v1 Hooks API)
- @opencode-ai/sdk/v2 (steer 送信用)
- Bun / Node.js 互換
