# Architecture — Phase 0〜1

目的は追加月額費用0円で、ローカル処理と人の判断をつなぐ独立した運営基盤。ユーザー指定に従いPhase 0〜1だけを実装する。既存Unityコード・DB・APIは変更も接続もしない。

## 採用した構成
- Node.js 22+ / TypeScript / Zod / Vitest。HTTPはNode標準API、UIはフレームワークなし。
- FileStore: JSON状態を0600で原子的に置換しfsync。排他ロック、入力schema、2MB上限、symlink拒否、破損時停止。DB追加なし。
- Engine: 指示受付→保守的ルール計画→権限確認→依存・優先度→1工程claim→結果検証→履歴。最大500タスク、同時1工程、初回+再試行2回、timeout1秒、再試行backoff。lease IDで停止後/期限後の結果を拒否する。
- Agent Registry: 6役、使用ツール・入出力・権限を固定。常駐モデルなし。一般的な調査・企画はstructured handoffとして人のChatGPT/Codexへ渡す。
- local.report/local.auditだけが実行可能。手動結果はschema検証するが内容の事実性は未検証。AI出力を計画・権限に変換しない。
- HTTP: loopback、認証セッション、CSRF/Origin/Host、CSP、no-store、入力上限、rate limit。静的ファイルは3ファイルだけ。
- integrations: 11サービスの契約と未接続モック。実通信はPhase 3のGitHub読み取りから。

## 選択理由
ローカルJSONでPhase 1の永続化・承認・履歴を検証できる。Cloudflare/新規DB/公開ホスティングは今は不要で、無料枠や秘密の管理先を増やさない。GitHub Issuesを運用上の依頼入口/永続台帳とする設計はPhase 3で実装し、ローカルJSONと二重の正本を持たない移行方針を決める。

## 状態と承認
queued → running → queued/succeeded。推論はawaiting_inference、重要操作はawaiting_approval。paused/failed/blockedを区別する。依存が未完了なら選択しない。依存は既存IDのみ、編集不可で循環を作れない。
承認は操作/対象/依頼本文/工程のhashと15分の期限に固定し、tokenのhashだけ保存する。発行し直せば旧tokenは無効。consumeは単回。UIは記録のみ、実行器未実装を明記する。token消費も実操作を発生させない。

## 現時点で存在しないもの
定期実行、Webhook受付、GitHub実通信、Issue/PR作成、外部送信、デプロイ、参加者操作、有料/無料の自動モデル推論、実モデル同士の議論、クラウド永続化。UIの履歴は手動ローカル工程で、自律運転実績ではない。

## GitHub読み取りの追加
GitHubReaderとprivate JSONのscan状態、認証付きsync API、一覧/タスク化UIを追加した。詳細はdocs/GITHUB.md。外部書込みは引き続き存在しない。Actions日次workflowは準備済みだが、公開先・無料条件フラグ・実runは接続待ち。その他の未実装事項は変わらない。
