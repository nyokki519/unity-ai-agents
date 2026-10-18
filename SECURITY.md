# Security

- サーバーは127.0.0.1固定。TLSなしのため公開用ではない。公開URL/リバースプロキシ/Cloudflare Tunnelは未設定。
- UNITY_ADMIN_TOKENは32文字以上のランダム値。未設定でも起動できるがログイン不可。環境変数/ローカル.envのみ。ブラウザには保存せずログイン後に入力欄を消去。
- セッションはランダム、1時間、HttpOnly/SameSite=Strict。HTTP loopback限定のためSecure cookieは付けていない。TLS公開時にSecure必須へ変更する。
- 全操作は認証+CSRF+同一Origin+Host照合。ログイン5回/分、認証後API120回/分、body64KB、CSP、no-store。ログアウト後のcookieは無効。
- 個人データ/秘密をタスクへ入力しない。代表的なAPI token/Private key形式は保存前に拒否するが、完全な秘密検出器ではない。
- UIはtextContentのみで外部文字列を描画。任意HTML、shell、eval、URL fetchは実装しない。
- 外部サービス・Issue・Webページ・手動AI出力は信頼しない。結果は厳密なZod schemaで受領し権限・toolを変更しない。
- repo Allowlistはnyokki519/unity-ai-agentsのみ。外部送信先Allowlistは空。既存Unityシステムには接続/変更しない。
- 承認はtarget/operation hash・15分期限・単回token。DBにはtoken hashのみ。承認画面で記録してもPhase 1の重要操作は実行されない。
- ローカルJSONは暗号化DB/耐改ざん台帳ではない。同じOSユーザーによるファイル編集は防げない。ディスク/OSアカウントを保護する。
- 書込みは排他lock+原子的rename+fsync。JSON破損時に空データで置換しない。実行lease失効時の再試行は最大3試行内。停止後の遅い結果は棄却する。
- プロセスが書込中に異常終了し.lockが残った場合はfail closed。全関連プロセスを停止し、.runtimeを非公開の場所にバックアップし、lock内のpidが動作していないことを確認してから.lockのみを除去する。生存プロセスのlockを消さない。
- .runtime/state.json等のstate、.env、鍵、参加者原本をGit/Issue/公開artifactに入れない。履歴は最大1000件（自動削除なし）、タスクは最大500、保存2MB。削除・クラウド移行は今後の承認済み操作として設計する。

テスト範囲はローカルLinux/Node環境。Phase 2以降のWebhookは署名/時刻/再送検証を追加するまで受付不可。実行できない機能を模擬成功で返さない。
