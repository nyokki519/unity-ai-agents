# Unity AI Agents

追加月額費用0円を初期条件とする、独立した運営エージェント基盤。**Phase 0〜1＋GitHub読み取り連携のローカル構成**です。既存Unityのコード・DB・公開環境は変更しません。

## 今できること

- 6役（Research / Strategy / Developer / Marketing / Analytics / Auditor）の役割・ツール・権限登録。
- 指示受付、ルールによる計画/担当選択、優先度、依存待ち、重複防止、ローカル集計/監査。
- JSON永続化、履歴、タイムアウト、最大2回の再試行、lease、中断/再開、緊急停止。
- AIが必要な依頼はChatGPT/Codexへ渡す構造化プロンプトを生成。結果の手動取り込み。無人AI推論ではありません。
- 対象/操作を固定した15分有効・単回の承認token基盤。重要操作の実行器は未実装なので、承認してもデプロイ/外部送信しません。
- 認証付きレスポンシブ管理画面の8画面、CLI、ローカル実行の集計。GitHubの読み取りアダプタを追加。他の外部サービスは未接続モック。

## セットアップ

Node.js 22以上（検証: 24）。GitHub/外部サービスの認証は不要です。

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run cli -- init
cp .env.example .env
```

`.env`のUNITY_ADMIN_TOKENに、パスワード管理ツール等で作った32文字以上のランダム値を設定してください。秘密値をGitやチャットへ貼らないでください。

```sh
node --env-file=.env --import tsx src/cli.ts serve
```

http://127.0.0.1:8787 を開き、そのtokenでログインします。.envは明示ロード時のみ読まれます。token未設定でも `npm run dev` で起動できますが、ログイン操作は拒否されます。

ビルド後は `npm run build` → `node --env-file=.env dist/cli.js serve`。サーバーはloopback固定です。スマホ幅に対応していますが、iPhone実機から遠隔接続する配信経路は未設定です。公開URLを作る操作は承認待ちです。

## 試す

管理画面「タスク」で「このシステムの稼働状態を確認」と入力し、ダッシュボードで「キューを1工程進める」を2回押すと、集計と監査が完了します。
「次のイベントの集客改善案を考えて」なら、実行後にタスク内へ引継ぎプロンプトを表示します。ChatGPT/Codexで確認後、以下のJSONで結果を取り込むと監査工程へ進めます。事実性は自動検証しません。

```json
{"summary":"確認した提案の要約","evidence":["根拠・参照元"],"objections":["反論・リスク"],"unverified":["未検証事項"]}
```

CLIでも利用できます。

```sh
npm run cli -- task このシステムの稼働状態を確認
npm run cli -- run
npm run cli -- run
npm run cli -- status
npm run cli -- stop
npm run cli -- resume-system
npm run cli -- handoff TASK_UUID result.json
```

## 検証

```sh
npm test
npm run typecheck
npm run build
```

UIの実ブラウザ検証方法はtests/browser_smoke.py。Python Playwrightと既存Chromiumがある環境で実行する開発用確認です。本体の依存ではありません。

## GitHub / 自律実行の初期状態

公開先は [nyokki519/unity-ai-agents](https://github.com/nyokki519/unity-ai-agents) です。この独立repoへの初回pushと実GitHub読み取り（3 GET成功）を確認しました。既存Unity repo・本番・対外送信は変更していません。
Actionsは手動検証と日次読み取りを用意しています。無料条件を確認してUNITY_FREE_ACTIONS_CONFIRMED=trueを設定した公開repoだけが標準ランナーで実行可能です。private repoは常に停止。cache/artifact/large runnerは使いません。所有者が無料条件フラグを設定済み。Actions上でテスト・型検査・ビルドとGitHub監視の各step成功を確認しました。日次監視は日本時間07:35前後です（遅延・省略の可能性あり）。PR作成は未実装です。詳細は[GitHub連携](docs/GITHUB.md)。

## 運用上の境界

.runtime/state.jsonは非公開ローカル状態。500タスク/2MBまで、実行/監査履歴は最大1000件を保存（満杯時は停止し、自動削除しない）します。削除や長期archiveは将来の承認付き機能。複数端末/複数サーバーの共有保存には未対応。通常のJSONのため、OS所有者による改ざんを防ぐ台帳ではありません。

- [構成と設計](ARCHITECTURE.md)
- [費用と公式根拠](COST_POLICY.md)
- [セキュリティと復旧](SECURITY.md)
- [段階別ロードマップ](ROADMAP.md)
- [作業記録・未対応事項](docs/STATUS.md)
