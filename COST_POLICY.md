# 追加費用0円ポリシー

## Phase 0確認（2026-10-18）
公式資料をHTTPSで読み取り確認した。docsサイトは環境のネットワーク制限で直接読めず、公式リポジトリの同文書を参照した。

1. GitHub Actions公式課金文書: https://github.com/github/docs/blob/main/content/billing/concepts/product-billing/github-actions.md
   - 公開リポジトリ＋標準GitHub-hostedランナーは無料。
   - 非公開リポジトリはプランごとの無料枠を超えると課金される。
   - Larger runnerは無料枠があっても課金対象。artifact/cacheにもストレージ課金条件がある。
2. Codex公式README: https://github.com/openai/codex/blob/main/README.md
   - ChatGPTでサインインしPlus等の契約で利用できる。契約ごとの制限はある。
   - Plusを無制限の自動実行APIや常駐サーバーと見なす根拠はない。本実装は人への引継ぎだけで活用する。
3. Cloudflare Workers: 現段階で必要なし。最新の無料条件を本環境で確認できていないため採用しない。無料の自動推論サービスも未採用。

## 強制する初期値
- 有料API SDK/呼出し・プロバイダ設定を実装しない。キーを追加しても利用経路はない。
- AI呼出し0。GitHub読み取りを実装し、1scanにつき最大3 GETを試行数として計測する。Phase 0での公式文書取得は開発調査であり、稼働エンジンの利用回数ではない。
- 検証Actionsは手動起動のみ。日次GitHub読み取りworkflowも実装したが、初期状態は無効。UNITY_FREE_ACTIONS_CONFIRMED=trueかつ公開リポジトリと確認できたときだけ標準ubuntuランナーを使う。初期状態はjobをスキップする。非公開repoは停止する。
- cache/artifact、有料runner、公開ホスティング、Cloudflare、外部通知は使わない。
- ローカルの既存端末/Nodeで実行。新規の月額契約/従量課金0円。端末は常時稼働前提にしない。
- 課金条件が変わった/不明になったら有効化しない。将来のGitHub定期実行前に、当時の規約・無料条件を再確認する。

GitHubの実利用枠と請求状態は未接続なのでUIでは未取得と表示する。金額/利用量を0と捏造しない。Phase 1のローカル処理追加費用は0円。
