# GitHub読み取り連携

対象: `nyokki519/unity-ai-agents` だけ。既存Unityリポジトリは読み書きしない。

## 実装済み
- 固定API endpointでrepo公開状態、open Issues（最大100、PR除外）、completed workflow runs（最大100）を3 GETで取得。
- 未割当/未分類Issue、最終更新から7日以上のIssue、workflow+branchごとの最新completed CI失敗を検出。上限到達時は全件集計と表示しない。
- タイトルは私用メール/token形式をマスクしてローカル保存。Issue本文・コメント本文・ユーザー情報を収集しない。表示はtextContent。
- 確認事項は安定key。ローカルタスク化はサーバーが生成した固定文だけを計画する。外部タイトルを指示に変換せず、何度押しても同じsource taskを返す。Issueの優先度は確認一覧で表示し、タスク化ではCI=高/Issue=通常とする。
- 状態はprivate `.runtime/state.json`へ保存。前回成功を残し、取得失敗時はエラーを明示。5分cooldown、同時実行lease、最大3 GET、5秒request timeout、redirect拒否、response 1MB上限。
- 緊急停止中は新規読み取り不可。開始済みの読み取りが終了する場合があるが、停止後の結果は採用しない。API回数は試行数で、到達/成功数とは異なる。

## 操作
管理画面の「連携状況 → GitHub → GitHubを読み取り確認」。接続確認後の項目からローカルタスクを作れる。

CLIはNode 24を推奨する。proxy環境では以下のように公式proxy機能を使う（proxy/CAを回避しない）。

```sh
node --use-env-proxy --import tsx src/cli.ts github-scan
```

認証なしでも公開repoは読める。認証する場合は任意のUNITY_GITHUB_TOKENまたはGitHub Actionsの一時GITHUB_TOKENを使用。必要権限は対象repoのMetadata/Issues/Actionsのreadだけ。キーはUIやログへ返さない。公開APIへの通信許可api.github.comが必要。

## 定期実行の準備
`.github/workflows/github-read.yml` は毎日UTC22:35（JST翌07:35頃）と手動起動。標準ubuntuランナー、5分上限、contents/issues/actions readのみ、cache/artifactなし。
公開repoとUNITY_FREE_ACTIONS_CONFIRMED=trueが両方確認できるまでjobはスキップする。GitHub remote作成・初回push・フラグ設定・実際のworkflow起動はAPIアクセスが通ってから確認する。
実行結果はGitHub Actions履歴とJob Summaryへ件数だけ記録する。Issue本文/タイトル、ローカル状態全体を公開artifactにしない。ランナーのローカルJSONは次回runへ継承しないため、管理画面のローカル履歴とActions実行履歴は別。Issue/PRを自動作成する機能はない。

## まだできないこと
CI修正、コード実行、PR作成、他Unity repoへの接続、外部通知、AI推論の無人実行。これらはreadonly scanの結果と混同しない。
