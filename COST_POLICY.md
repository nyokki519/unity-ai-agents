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
3. Cloudflare Workers: iPhone管理画面用にFree限定の構成を追加。2026-10-18にcloudflare/cloudflare-docsのWorkers pricingとDO pricing/partialsをGitHub APIで確認。SQLite DOはFree対応、上限超過時はエラー停止。Workers Paidは月額最低$5のため禁止。無料AI推論は未採用。詳細と上限はdocs/CLOUDFLARE.md。

## 強制する初期値
- 有料API SDK/呼出し・プロバイダ設定を実装しない。キーを追加しても利用経路はない。
- ローカルAI呼出し0。クラウドの無料AIは下記の固定上限のみ。GitHub読み取りを実装し、1scanにつき最大3 GETを試行数として計測する。Phase 0での公式文書取得は開発調査であり、稼働エンジンの利用回数ではない。
- 検証Actionsは手動起動のみ。日次GitHub読み取りworkflowも実装したが、初期状態は無効。UNITY_FREE_ACTIONS_CONFIRMED=trueかつ公開リポジトリと確認できたときだけ標準ubuntuランナーを使う。初期状態はjobをスキップする。非公開repoは停止する。
- cache/artifact、有料runner、課金ホスティング、外部通知は使わない。Cloudflare Free構成は所有者の契約確認と認証設定まで無効。
- ローカルの既存端末/Nodeで実行。新規の月額契約/従量課金0円。端末は常時稼働前提にしない。
- 課金条件が変わった/不明になったら有効化しない。将来のGitHub定期実行前に、当時の規約・無料条件を再確認する。

GitHubの実利用枠と請求状態は未接続なのでUIでは未取得と表示する。金額/利用量を0と捏造しない。Phase 1のローカル処理追加費用は0円。

## 日次監視（2026-10-21）
既存のWorkers Free/SQLite DOでCronを1本追加（毎日22:40 UTC＝07:40 JST）。1日最大1回のAnalytics GET、タスク作成最大3件、AI呼出し0。追加契約・有料プランへの変更なし。Free確認フラグと既存管理者設定がない場合は起動しない。取得先の既存システムには1日最大1 GETを追加するため、その既存無料枠も消費する。残枠を実測した値とは報告しない。

同日配信の重複はSQLiteのclaimで抑止し、失敗後の当日自動再試行は行わない。容量上限やAI引継ぎ待ちで止まる。Cronは予定時刻から遅延し得るため、正確な時刻の保証や無制限の安定稼働を前提にしない。Freeの上限で失敗した際にPaidへ自動変更しない。

## 無料推論の調査（未接続）
2026-10-21、公式 https://developers.cloudflare.com/workers-ai/platform/pricing/ のソース https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/workers-ai/platform/pricing.mdx をGitHub APIで確認。Workers Freeは1日10,000 Neurons、超過はエラー。Paidプランでは超過課金があり、一部モデルは支払手段必須。Free対応モデル候補は存在するが、当実装のAI呼出しはまだ0。無料推論を導入する場合もモデル/回数/出力上限を固定し、プラン確認・データ送付範囲・出力検証・停止境界を別途実装する。全モデル無料とは見なさない。

## 現在の無料AI上限（2026-10-21）
Workers Free所有者確認＋固定モデル@cf/meta/llama-3.1-8b-instruct-fp8-fastで日次集計の提案生成を実装。UTC1日1試行（失敗含む）・入力6000文字・出力1024token。pricing記載の入力4119/出力34868 Neurons per M tokensを参照すると小規模利用だが、文字数から正確なtoken数/請求額を算出したとは扱わない。Free上限超過は停止、有料モデル/別providerへのfallbackやPaid切替はない。他Workerとの合算残枠は未知。詳細docs/FREE-AI.md。実モデル成功は接続設定とは別に確認する。
