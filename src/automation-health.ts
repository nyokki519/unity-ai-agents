import type {z} from 'zod';
import type {DailyRecord} from './daily.js';
import type {StateData} from './model.js';
type Issue={code:string;severity:'attention'|'waiting';message:string;check:string};
/** Inspect saved execution records only; no network, AI, retries or state mutations. */
export function automationHealth(s:Pick<StateData,'stopped'|'freeAI'|'analytics'>,d:z.infer<typeof DailyRecord>|null,aiConfigured:boolean,now=new Date()){
 const issues:Issue[]=[],add=(code:string,severity:Issue['severity'],message:string,check:string)=>issues.push({code,severity,message,check});
 if(s.stopped)return {level:'stopped',issues:[{code:'stopped',severity:'waiting',message:'緊急停止中です。',check:'停止理由を確認してから解除してください。再開後も重要操作は自動実行しません。'}]};
 const age=(t:string)=>+now-Date.parse(t),bad=(t:string)=>!Number.isFinite(Date.parse(t))||age(t)<0;
 if(!d)add('schedule_waiting','waiting','定期実行の初回記録がありません。','予定は毎日07:40（日本時間）です。初回成功まで稼働確認は未完了です。');
 else{
  if(bad(d.startedAt)||d.finishedAt&&(bad(d.finishedAt)||Date.parse(d.finishedAt)<Date.parse(d.startedAt)))add('clock','attention','定期実行の時刻が不明または未来です。','保存記録と実行環境の時刻を確認してください。');
  else if(age(d.startedAt)>36*3600000)add('schedule_overdue','attention','最後の定期実行開始から36時間を超えています。','CloudflareのCron登録・実行履歴・無料枠のエラーを確認してください。日次予定の停止原因は未特定です。');
  if(d.status==='running')add(age(d.startedAt)>120000?'daily_stalled':'daily_running',age(d.startedAt)>120000?'attention':'waiting',age(d.startedAt)>120000?'前回の定期処理が未完了のままです。':'定期処理が進行中です。','記録を再取得し、未完了が続く場合は実行履歴と保存容量を確認してください。');
  else if(d.status==='failed')add('daily_failed','attention','前回のデータ取得・判定が失敗しました。','連携状況の診断と実行履歴を確認し、接続・無料枠・保存容量を切り分けてください。');
  else if(d.status==='partial')add('daily_partial','attention','データ取得は成功しましたが内部タスク作成が保留です。','タスク件数・保存容量・停止履歴を確認してください。取得成功を全工程完了とは扱いません。');
  else if(d.status==='not_configured')add('daily_not_configured','attention','前回の定期処理は読取り設定が不足していました。','Workerの専用読取りキーの登録状態と連携状況を確認してください。');
  else if(['stopped','cooldown'].includes(d.status))add('daily_skipped','waiting','前回の定期処理は停止または取得間隔により見送りました。','停止状態と直近の手動取得日時を確認してください。次の定期処理も同じ制限を守ります。');
  else if(!d.finishedAt)add('daily_inconsistent','attention','完了状態に終了日時がありません。','保存記録を確認し、正常完了とは扱わないでください。');
 }
 const a=s.freeAI;
 if(!aiConfigured)add('ai_not_configured','attention','無料AIの接続設定がありません。','AI bindingの登録状態を確認してください。有料サービスへは切り替えません。');
 else if(!a)add('ai_waiting','waiting','日次AI分析の初回記録がありません。','データ取得成功と分析結果の記録を待ちます。設定済みだけでは実モデルの成功は未確認です。');
 else{
  if(bad(a.startedAt)||a.finishedAt&&(bad(a.finishedAt)||Date.parse(a.finishedAt)<Date.parse(a.startedAt)))add('ai_clock','attention','AI記録の時刻が不明または未来です。','実行時刻と保存記録を確認してください。');
  else if(age(a.startedAt)>36*3600000)add('ai_overdue','attention','AI分析の開始記録が36時間を超えて更新されていません。','定期取得の結果とデータ鮮度を確認してください。生成済みの古い提案を最新と扱わないでください。');
  if(a.status==='running')add(age(a.startedAt)>120000?'ai_stalled':'ai_running',age(a.startedAt)>120000?'attention':'waiting',age(a.startedAt)>120000?'AI分析が未完了のままです。':'AI分析が進行中です。','AIの試行枠は予約済みです。記録を再取得して確認し、当日の重複呼出しは行いません。');
  else if(a.status==='failed')add('ai_failed','attention','前回のAI生成が失敗しました。',a.reason==='invalid_output'?'出力JSONが規定の形式に合いませんでした。固定モデルの出力形式を確認してください。':a.reason==='timeout'?'25秒以内に応答が完了しませんでした。実行履歴を確認してください。当日は自動再試行しません。':'無料枠・モデル利用可否・AI接続設定を確認してください。原因は未特定で、有料fallbackはありません。');
  else if(a.status==='held')add('ai_held','attention','AI分析または結果の保存を保留しています。','データの完全性・鮮度・停止履歴を確認してください。途中でデータが変わった場合の結果は採用しません。');
  else if(!a.finishedAt||!a.result||!a.sourceAt)add('ai_inconsistent','attention','AI完了状態に終了日時・参照日時・結果が不足しています。','保存記録を確認してください。生成成功とは扱いません。');
  else if(s.analytics?.lastSuccessAt&&a.sourceAt!==s.analytics.lastSuccessAt)add('ai_source_changed','waiting','AI提案の後に参照データが更新されています。','提案の参照日時を確認してください。新しいデータでの提案は次回の分析対象です。');
 }
 return {level:issues.some(i=>i.severity==='attention')?'attention':issues.length?'waiting':'recorded',issues};
}
