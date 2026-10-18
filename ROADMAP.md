# Roadmap

|Phase|実装/検証|状態・外部設定待ち|
|---|---|---|
|0|公式無料条件・Codex契約利用・安全な初期値|検証済み。公開/課金設定は変更なし|
|1|TypeScript司令塔、queue/依存、JSON保存、6役、手動引継ぎ、権限制御、ローカルUI、CLI|実装済み。独立public repoへpush済み|
|2|自律scheduler、停滞検知、稼働集計、Webhook署名|日次readonly設定済み。無料フラグ有効、手動実run成功。cron初回起動は予定待ち|
|3|GitHub読み取り、Issues依頼、CI失敗、重複防止|固定repoの読み取り・一覧/タスク化を実装。実API/Actions読取り成功。Issueからの指示受付は未実装|
|4|複数視点の議論、反論/根拠/未検証の評価|手動promptと出力schemaのみ。実モデルは未接続|
|5|外部アプリ連携|契約/未接続モックのみ。GitHub以外は後回し|
|6|承認されたlevel2実行器、内部通知、重要操作の承認UI|期限/単回primitiveのみ実装。実行器は未実装|
|7|iPhone遠隔操作、TLS、公開ホスティング、永続化|Workers Free＋SQLite DO/認証を追加。ローカルworkerd検証済み。実公開はCloudflare認証とHTTPS検証待ち|
|8|過去施策・実行効果の評価、最適化提案|ローカル成功率/再試行/時間の集計のみ|

次はCloudflare接続設定後にPhase 7の実公開を検証する。GitHub Issuesの依頼/状態を正本とし、private dataを公開repoへ書かない方法を先に決める。公開repo標準Actionsか、既存端末の明示的な実行かを選ぶ。AI推論の無人自動化は利用条件と契約の裏付けがなければ追加しない。
