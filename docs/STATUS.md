# 作業記録 — 2026-10-18 JST

## 対象と完了範囲
- 新規独立ローカルrepo `/workspace/unity-ai-agents` のPhase 0〜1。
- 既存Unityリポジトリ・DB・本番・LINE・Vercel・Cloudflareは変更なし。
- 6役、ルール計画、優先度・依存・idempotency（別keyで同一active依頼の再受付も追跡）、永続JSON、最大初回+2retry、timeout、lease、停止/再開。
- 手動ChatGPT/Codex引継ぎとstrictな結果JSON取込。AI実行回数0。根拠/反論/未検証事項と複数視点のprompt。
- 承認primitiveは対象/操作固定・15分・単回token hash。UIでは承認記録のみ。危険操作の実行器なし。
- 認証UI8画面、CLI、未接続integration契約、費用/安全/構成/ロードマップ/セットアップ文書。
- 容量: 500タスク、2000request keys、1000実行、1000監査、2MB。履歴の自動削除はしない。上限で停止し、緊急停止は監査満杯でも独立した停止記録で永続化する。

## 検証結果
- Node 24.19.0 / npm 11.9.0。
- Vitest 17成功、失敗/skip 0。
- typecheck（TSとpublic/app.js構文検査）成功。build成功。
- HTTP: tokenなし起動、未認証401、Origin/CSRF拒否、認証/ログアウト、no-store、ソース/.env非公開。
- 実ブラウザ390px/1280px: ログイン、local report/audit、手動handoff、承認記録、緊急停止、ログアウト、8画面、横はみ出し0、JSエラー0。
- CLI init→task→run 2工程→statusでsucceededと永続履歴を確認。stateはignored .runtimeのみ。
- テストで発見したUI構文エラーを修正し、typecheckにJS構文確認を加えた。
- 認識可能なcredential拒否、JSON破損/symlink拒否、同時claim、遅延結果棄却、停止のfencing、最大3試行、tokenの単回/期限/対象変更を検証。

## Phase 0根拠
COST_POLICY.md参照。公式GitHub Actions課金資料とCodex READMEをHTTPSで確認。未確認の無料推論・Cloudflareは不採用。Actionsは初期OFF/手動/public限定、cache/artifactなし。

## 未実施・外部設定待ち
GitHub remote作成/push/公開、GitHub Actions実行、GitHub Issue/PR通信、定期実行、Webhook、公開URL、iPhone実機からの遠隔接続、クラウド保存、実モデル推論・議論、外部通知は未実施。ローカル管理者tokenのみ利用者が設定する。新しいクラウドタスクでの復元は未検証。

## 次回の入口
このファイルとROADMAP.mdを読み、Phase 2〜3のGitHub読み取り/schedulerを検討する。既存Unityコードを読む必要はない。公開repoの承認・無料条件・private dataの保管先・最小権限の接続を決めてから有効化する。推論や対外操作を勝手に接続しない。
