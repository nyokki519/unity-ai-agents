# iPhone管理画面: 設計と実装範囲

目的: iPhoneのSafariから指示・タスク確認・承認記録を行う。追加月額0円、既存Unity無変更。

方式: Cloudflare Workers Free + SQLite Durable Objectを一つ使用。既存public UIとEngine/planner/model/view/GitHub読取りを再利用。FileStoreはそのまま残し、小さなStateStore契約にクラウド保存を追加する。
代替: VercelだけではローカルJSON永続化ができず、常時起動PC＋VPNは利用者の管理負担が大きいため不採用。

認証: 32文字以上の管理者secret、1時間の永続セッション、Secure/HttpOnly/SameSite=Strict cookie、CSRFと固定HTTPS Origin検証。ログアウトで失効。再起動でrate limitを回避しない。secret未設定/無料確認フラグ未設定は操作停止。静的ファイル以外は未認証では返さない。
保存: DO transaction内でZod検証し、既存上限2MBを維持。KV値上限を避けるため32KB未満の文字列片で保存。旧ローカルstateは自動公開/移行しない。承認は記録のみ、重要操作のexecutorは追加しない。
費用: Workers Freeのみ。公式DO pricingを2026-10-18に確認。無料超過はエラー停止。課金プラン変更/カード登録/有料AIなし。アプリ側の日次API上限2000と5分GitHub cooldown。静的配信を含むアカウント全体の利用量はCloudflareで確認する。
公開: wranglerから新規unity-ai-agents Workerのみ。Cloudflare認証とFreeプラン確認は必要。既存Vercel/Unityは変更しない。クラウドURL公開の指示は今回のユーザー依頼による。

検証: 未認証拒否、Origin/CSRF拒否、Secure cookie、再生成後セッション/state保持、ログアウト、緊急停止、重要操作の保留、容量、入力上限。Wrangler dry-runとローカルWorkersランタイムでUI/API動作を確認。実公開の成功は別途HTTPS検証まで報告しない。
実装順: Store契約→永続化/認証付きWorker→UI配信設定→focused/full testsとtypecheck/build→ローカル実機相当確認→セットアップ手順と状態記録。
