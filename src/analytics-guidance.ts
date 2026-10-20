import type {AnalyticsFindingData} from './analytics-model.js';
export type AnalyticsGuidance={steps:string[];doneWhen:string[];ifUnknown:string};
export function analyticsGuidance(kind:AnalyticsFindingData['kind']):AnalyticsGuidance{
 const ifUnknown='確認できない項目は未確認として残し、必要な情報・確認先・次に確認する日時を記録してください。推測で数値や原因を埋めません。';
 if(kind==='booking_gap')return {steps:[
  'Analyticsで開催予定日時・定員・予約残数・募集終了日時を照合し、確認時刻を記録する。',
  '告知の案内先から申込画面へ到達できるか、日付・場所・費用・参加条件が一致しているかを確認する。',
  '既に行った告知の場所と日時を確認し、「現状維持」「告知内容の見直し案」「募集方法の相談」から対応候補を選ぶ。',
  '選んだ候補の根拠、担当候補、開催前の次回確認日時をまとめる。'],doneWhen:[
  '照合した予約数/定員、確認元、確認時刻が記録されている。',
  '対応候補と選定理由、担当候補、次回確認日時がそろっている。改善効果は未検証と分けて記録する。'],ifUnknown};
 if(kind==='attendance_gap')return {steps:[
  '予定日時に対応するイベントが開催・中止・延期のどれだったか、Analyticsと運営記録で確認する。',
  '開催した場合は実参加人数の集計記録と記録日を確認する。個人名や連絡先は記載しない。',
  '「元記録に数値あり」「元記録が未整備」「取得経路で確認できない」に分け、元記録とAnalyticsの差を整理する。',
  '記録の確認が必要な担当候補と、次に確認する日時を記録する。'],doneWhen:[
  '開催状態と、実参加数または未取得の理由が記録されている。未取得を0人に置き換えない。',
  '根拠となる集計記録・確認時刻と、残る確認事項の担当候補・確認日時がそろっている。'],ifUnknown};
 return {steps:[
  'Analyticsの同期履歴で直近の結果(success/partial/failed)と最終成功日時を確認する。',
  '対象期間と元データ更新日時を照合し、どの指標・範囲が欠損または古いのかを数値と日時で整理する。',
  '確認できた事実と、認証・同期未完了・元記録不足などの未検証の可能性を分ける。',
  '判断を保留する指標、必要な確認先、次回確認日時を記録する。'],doneWhen:[
  '同期結果・対象期間・最終成功/元データ更新日時が記録されている。不明な日時は未確認と明記する。',
  '利用できる指標と保留する指標、未解決事項の担当候補と次回確認日時がそろっている。'],ifUnknown};
}
export function formatGuidance(g:AnalyticsGuidance){return `確認手順:\n${g.steps.map((s,i)=>`${i+1}. ${s}`).join('\n')}\n完了条件:\n${g.doneWhen.map(s=>'- '+s).join('\n')}\n${g.ifUnknown}`;}
