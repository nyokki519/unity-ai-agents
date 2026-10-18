# iPhoneから使う管理画面

## 実装範囲
Workers + SQLite Durable Object一つ。既存UI/Engineを再利用。認証、指示受付、タスク/履歴確認、手動引継ぎ、承認記録、緊急停止、固定GitHubの読取りを提供する。ローカルFileStoreとクラウドStateは別で、自動移行しない。重要操作の実行や自動AI推論は追加していない。

## 無料条件（必須）
Cloudflareの **Workers Free** アカウントのみ。Workers Paidや有料アドオンを契約しない。上限超過時のエラー停止を受け入れる。アプリの確認フラグだけでは実アカウントの契約状態を判定できないため、所有者がダッシュボードでFreeを確認する。Paidを使っているアカウントでは有効化しない。

2026-10-18の公式資料: [Workers料金](https://developers.cloudflare.com/workers/platform/pricing/)、[Durable Objects料金](https://developers.cloudflare.com/durable-objects/platform/pricing/)。Workers Freeは100,000 request/日、CPU 10ms/呼出し。SQLite DOは100,000 request/日、13,000 GB-s/日、500万row読取/日、10万row書込/日、計5GB。全Workerとの共有上限で、アプリ内の日次2000 API制限より先にサービス側の上限に達することもある。大きい状態や混雑で処理が停止する可能性がある。日次API制限はUTCで更新、GitHubは最大3 GET/5分。使用量はCloudflare画面で確認（UIで実測0と表示しない）。

## 公開手順
1. Freeプランを確認。Cloudflare認証を用意する。ローカル端末なら `npx wrangler login`。Codexクラウドから作業する場合は環境設定に `CLOUDFLARE_API_TOKEN` を安全に登録する。チャットには貼らない。
2. API tokenは対象アカウント一つに限定し、有効期限を付ける。Workers Scripts Edit（新規Worker/DO/secretの設定）、Account Settings Read（アカウント特定・設定読取り）を必要範囲で許可する。Zone権限や既存Unityのキーは不要。アカウントIDはCloudflareのAccount homeで確認できる非秘密値。既存の同名Workerがあればデプロイを停止し、所有者に確認する。
3. `npm ci --ignore-scripts --no-audit --no-fund` → `npm run cloud:check` → `npm run cloud:smoke`。クラウド環境で設定ディレクトリが書込不可なら `XDG_CONFIG_HOME=/tmp/unity-cloud-config WRANGLER_SEND_METRICS=false npm run cloud:check`。必要なproxy/CAは保持する。
4. `npm run cloud:deploy` で新規 `unity-ai-agents` のみを公開する。初回は設定不足でAPI操作が停止する。公開URLを取得して次項を設定する。Worker scriptのアップロードは公開操作なので、指示/承認がある場合のみ。
5. Worker Settings → Variables and Secretsで以下を登録する（値をGitに書かない）。
   - `UNITY_PUBLIC_ORIGIN`: 実URLの `https://unity-ai-agents.<subdomain>.workers.dev` の部分。末尾 `/` なし。
   - `UNITY_FREE_CLOUD_CONFIRMED`: Free契約を確認後のみ `true`。
   - `UNITY_ADMIN_TOKEN`: **Secret** として、32文字以上のランダムな値。パスワードマネージャーで保管。ローカル生成なら `openssl rand -hex 32`。Codexが生成する場合も秘密値はログやGitに残さない。
6. 設定をDeployし、実URLで未認証 `/api/state` が401、認証後の指示登録と再読込みが成功することを確認する。iPhone Safariで開き、共有→ホーム画面に追加でショートカットにできる。オフラインアプリではない。

`keep_vars:true` でDashboardに設定した変数を保持する。自動デプロイのGitHub Actionsは追加していない。Worker secret、アカウント契約、実URLの確認が済むまでは公開完了と報告しない。

## セキュリティと運用
- 設定したHTTPS Originだけ許可。CookieはSecure/HttpOnly/SameSite=Strict、1時間。CSRFはメモリのみ。再読込み時は再ログイン。管理者secret変更で既存セッション失効。
- セッション/ログイン制限はDOに保存され、再起動でリセットされない。ログイン5回/分、認証済みAPI120回/分・2000回/日。未認証の読取りは管理者の操作枠を消費しない。認証＋CSRFを満たす緊急停止・ログアウトはアプリ内上限時も許可（停止解除は制限対象）。プロバイダ自体の停止を回避できるものではない。攻撃でログイン不能になる場合は窓の更新を待つ。Cloudflareの追加防御はFree範囲を確認して所有者が設定する。
- SQLiteのtransactionで状態を検証して原子的に保存。32KB以下の片に分割、500タスク/2MB/履歴1000件。満杯で停止し、自動削除しない。無期限のバックアップや改ざん防止台帳ではない。
- Workerは常駐タスクを回さない。新規タスク登録時にそのタスクだけ最大3工程を自動実行する。手動の1工程実行も可能。引継ぎ・承認・依存待ち・失敗・停止は人の対応待ち。GitHub Actionsの日次結果とWorker保存状態は自動同期しない。GitHub読取りは公開repoを認証なしで取得するためGitHub側のIP制限で失敗する場合もある。
- 監査は既存のtask/実行/承認ログ。指示本文・認証値・生エラーはconsoleに出さない。Cloudflare observabilityは初期OFF。
- 認証情報を失った場合はDashboardでsecretを再設定する。secretをIssueに書かない。DO/Worker削除はデータ消失につながるため、自動で実行しない。
