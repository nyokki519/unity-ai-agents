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

## GitHub公開承認後の作業（2026-10-18 JST）
- ユーザーはnyokki519/unity-ai-agentsの公開作成・push・読み取り連携を明示承認済み。既存repoの変更は未承認のまま。
- 実装: 最大3 GETの固定repo reader、open Issue/停滞/最新completed CI失敗、5分cooldown/lease/中断/実試行カウンター、private repo/redirect/不正schema拒否、認証付き読み取りUI、source keyによる重複しないローカルタスク化。外部タイトルを指示として採用しない。
- 日次readonly workflowを準備。public + UNITY_FREE_ACTIONS_CONFIRMED=trueだけで標準runnerを使用。APIの権限はcontents/issues/actions readのみ。cache/artifactなし、公開Job Summaryは件数のみ。
- 検証: Vitest22成功、typecheck/build成功、既存browser smoke成功。実GitHub API/実workflowは未検証。state/env/ビルド出力の追跡なしを確認。
- 接続上のblocker: gh api userはapi.github.comへの通信許可不足でForbidden。GH_TOKENは存在するので新規tokenを要求していない。Gitのreadは使えるが、対象repoのls-remoteはRepository not found（非存在/未許可を区別できない）。
- 環境設定draftへapi.github.comだけを追加保存済み。既存api.vercel.comとAnalyticsのdomain・presetを保持。requires_publish=true、現在の実行環境には未反映。ユーザーの環境設定保存・再公開が必要。
- その後の順序: gh api userでowner確認→対象repoの存在/公開状態確認→未存在ならgh repo create nyokki519/unity-ai-agents --public --source=. --remote=origin --push→公開状態再確認→無料条件フラグを新repoだけに設定→手動verify/readonly workflowを起動→実データと実行履歴を確認する。既存remoteがあれば勝手に上書き/force-pushしない。
- 公開、GitHub remote追加、実workflow有効化・起動はまだ行っていない。新しい承認の取り直しは不要で、通信反映後に既存認証を再試行する。
