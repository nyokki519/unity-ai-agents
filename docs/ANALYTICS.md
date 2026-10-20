# Unity Analytics 読み取り連携

## 2026-10-20の反映結果
所有者承認後、Analyticsに専用API2実装ファイル＋テストを追加し、GitHub mainへ反映済み（43cd81f）。認証済みGitHub APIの同一tree再デプロイcommit b5fce4aでVercelのDeployment has completedを確認。全333テスト・型検査・本番ビルド成功。既存画面/DB構造は変更なし。キー設定と実データ取得の検証は未完了。

次の設定: Vercelのunity-analytics ProductionへAGENT_READ_TOKEN、Cloudflareのunity-ai-agentsへUNITY_ANALYTICS_READ_TOKENを同じ専用の強い秘密値で設定する。既存キーがある場合は別の利用者への影響を確認し、管理者/CRON/DBキーを流用しない。Vercelの設定API認証がこの環境にないため、値の登録は所有者の設定画面で行う。

## 調査時点の状態（以下は過去記録）
利用者が確認した公開先は https://unity-analytics.vercel.app 。新しいAgents側のreader/UIは実装したが、実データ接続は未確認。集計APIのローカル実装は /workspace/unity-analytics/app/api/agent/summary/route.ts と lib/agent-summary.ts にある。GitHub mainの同API pathは404、同じ権限でpackage.jsonは取得できるため、少なくともGitHubには未反映。本番に手動デプロイ済みかは不明。
登録済み旧preview URLは、未認証・既存専用tokenを使った読取りともproxy CONNECT403で到達できなかった。これはAPIの401/404とは区別する。現在の実URLはクラウド環境のnetwork/secret送信先に未登録。VERCEL_TOKENは提供されていない。既存Analyticsのファイル/DB/デプロイは今回変更していない。

## 新Agents側の機能
- 固定URL https://unity-analytics.vercel.app/api/agent/summary に専用キーでGETのみ。任意URL/リダイレクトは禁止。1MB/12秒/500イベント、source/期間/日時/数値/重複IDを検証する。
- 対象期間・元データ更新時刻・complete/partial・欠損母数を表示。中止イベントは除外。予約残数と実参加数を区別し、実参加は過去イベントのみ。PVはイベントごとの最新累計を合計（期間内PVではない）。
- 保存するのは集計値だけ。イベント名/ID/参加者情報/自由記述/認証値/元payloadは保存しない。未知フィールドは捨てる。
- 収益/リピート率/満足度は取得元が未提供なのでnull。0や推測値で埋めず、月次改善の根拠があると捏造しない。
- 成否と最終成功を保持。成功後は1時間、失敗後は5分待機、緊急停止とstopCountで遅延結果を棄却。失敗時の旧snapshotには取得エラーを明示。使用回数は取得試行数で、費用の実測ではない。
- 認証+CSRF済みのPOST /api/analytics/syncと連携状況UI。自律的な外部アクセス、外部送信、AI呼出しは追加しない。

## 接続を完成させるための差分（API追加・公開は承認済み／反映済み）
元の「既存Unity関連システムは変更しない」指定を維持しているため、以下を勝手に実行しない。
1. 既存Analyticsにローカル実装済みapp/api/agent/summary/route.ts、lib/agent-summary.tsを追加し、tests/agent-summary.test.tsで検証したうえでGitへ反映・Vercelへデプロイする。既存画面/既存API/DB構造は変更しない。
2. Analytics側に専用AGENT_READ_TOKENをSecretとして設定。同じ読み取り専用の値を新WorkerのUNITY_ANALYTICS_READ_TOKENへSecretとして設定。管理者/CRON/DBキーは流用しない。クラウド環境のproxy secretを抽出してWorkerへ転用しない。
3. Codex環境からの検証では、実URLドメインのnetwork許可と既存UNITY_OS_ANALYTICS_TOKENの送信先追加を安全な設定UIで行う。現在の旧preview向けbindingを黙って使い回さない。
4. 未認証401、認証済みの実応答、集計値/欠損の整合、元システムへの書込み0を検証してから「接続済み」と報告する。

新Worker側のsecret未設定では外部呼び出しを行わずnot_configuredを返す。新しい状態schemaはanalytics=nullをdefaultとし、既存のstateを削除・初期化しない。旧版へrollbackする場合は追加fieldを認識できる版を使い、strict schemaで読めなくなる旧版へ無条件に戻さない。

## Workers通信の互換性修正

Cloudflare Workersはredirect:errorをサポートしないため、Analytics/GitHubともredirect:manualで3xxを拒否する。移動先への追跡・キー転送は行わない。実workerdのnative fetchを模擬upstreamにつなぐ回帰テストで、正常応答と302拒否（呼出し1回）を検証する。失敗後の再取得は5分、成功後は1時間。残り待機秒を画面に表示し、古い失敗を新しい試行と混同しない。

## 取得後の確認タスク

取得時に数値/日時から確認候補を導出し、候補の根拠だけを保持する機能を追加。元イベントID/名前は保持しない。取得成功後に最大3タスクを生成する。基準と重複/停止/容量時の扱いはdocs/ANALYTICS-TASKS.md参照。旧snapshotはfindings=[]として読み、次の取得から判定する。
