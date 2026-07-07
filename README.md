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

## 制限事項

- **プロセスの孤児化**: opencode 本体が `SIGKILL` などで強制終了した場合、監視プロセスが残る可能性があります。通常の終了（`dispose` フック経由）では全プロセスが停止されます。
- **即時割り込み不可**: エージェントが LLM 応答のストリーミング中は、その turn が終わるまで steer 通知は取り込まれません。アイドル時は 500ms 以内に反応します。

## 技術スタック

- TypeScript (strict)
- @opencode-ai/plugin (v1 Hooks API)
- @opencode-ai/sdk/v2 (steer 送信用)
- Bun / Node.js 互換
