# Unity AI Agents

追加月額費用0円を初期条件とする、独立した運営エージェント基盤。**Phase 0〜1＋GitHub読み取り連携のローカル構成**です。既存Unityのコード・DB・公開環境は変更しません。

## 今できること

- 6役（Research / Strategy / Developer / Marketing / Analytics / Auditor）の役割・ツール・権限登録。
- 指示受付、ルールによる計画/担当選択、優先度、依存待ち、重複防止、ローカル集計/監査。
- JSON永続化、履歴、タイムアウト、最大2回の再試行、lease、中断/再開、緊急停止。
- AIが必要な依頼はChatGPT/Codexへ渡す構造化プロンプトを生成。結果の手動取り込み。無人AI推論ではありません。
- 対象/操作を固定した15分有効・単回の承認token基盤。重要操作の実行器は未実装なので、承認してもデプロイ/外部送信しません。
- 認証付きレスポンシブ管理画面の8画面、CLI、ローカル実行の集計。GitHubの読み取りアダプタを追加。Unity Analyticsの集計readerは設定待ち。その他の外部サービスは未接続モック。

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

ビルド後は `npm run build` → `node --env-file=.env dist/cli.js serve`。サーバーはloopback固定です。スマホ幅に対応していますが、iPhone向けのWorkers Free版を追加しました。設定・公開手順は[Cloudflare管理画面](docs/CLOUDFLARE.md)を参照してください。Cloudflareへの公開は完了し、管理者キーの設定と実URLでのログイン確認が残っています。

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

## iPhone用クラウド版

同じUI・タスクエンジンをWorkers Free＋SQLite Durable Objectで実行できます。認証と永続保存を実装済み。`npm run cloud:check`（公開しないbundle検証）と `npm run cloud:smoke`（ローカルworkerd/SQLite検証）を利用してください。Cloudflareへの認証・Free確認・本番HTTPS検証は別途必要です。[セットアップ](docs/CLOUDFLARE.md)。

公開先: https://unity-ai-agents.kukki519.workers.dev 。初回利用前にCloudflareのWorker Settings → Variables and Secretsで `UNITY_ADMIN_TOKEN` をSecretとして登録してください。値は32文字以上のランダムなものを使い、チャットやGitへ貼らないでください。

## 登録時の自動実行

管理画面で指示を登録すると、そのタスクだけを最大3工程まで自動で進めます。稼働状態の確認はreport/auditの2工程で完了します。AI引継ぎ・承認・依存待ち・失敗・緊急停止では停止し、遅延retryを連打しません。過去の別タスクを勝手に処理しません。手動の1工程ボタンは残しています。常駐スケジューラーやAIの自動推論ではありません。CLIのtaskは従来どおり登録だけです。

## Analyticsの接続準備

連携状況に専用集計APIの読取りを追加しました。実接続はAPI公開と専用キー設定待ちです。取得可能なのは予約残数・実参加・PV等。収益・リピート率・満足度は未取得です。[接続差分と設定](docs/ANALYTICS.md)。
