import type {StateData} from './model.js';
import {attention,type Attention} from './attention.js';
import {compareAnalytics} from './analytics-comparison.js';
/** A display-time briefing of stored facts; never persists, infers or executes. */
export function operationsDigest(s:StateData,now=new Date()){
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now),a=s.analytics,p=a?.snapshot,alerts=attention(s,now);
 const sourceStatus=!p?(a?.error?'held':'missing'):alerts.some(i=>['analytics_error','analytics_quality'].includes(i.code))?'held':'usable';
 const headline=s.stopped?'緊急停止中。保存済みの運営記録を表示しています。':sourceStatus==='missing'?'運営データの取得待ちです。':sourceStatus==='held'?'データの完全性・鮮度を確認してから判断してください。':'保存済みの観測データから確認事項を整理しました。';
 const facts:string[]=[];
 if(sourceStatus==='usable'&&p){
  facts.push(`対象: ${p.events}イベント（過去${p.pastEvents} / 予定${p.upcomingEvents}）`);
  for(const [name,key] of [['予約合計','bookings'],['実参加合計','attendance'],['PV累計合計','pageviews']] as const){const m=p[key];facts.push(`${name}: ${m.value??'未取得'}（既知${m.knownEvents} / 対象${m.totalEvents}イベント）`);}
  for(const m of compareAnalytics(a,now).metrics)if(m.comparable)facts.push(`${{bookings:'予約',attendance:'実参加',pageviews:'PV累計'}[m.name]}の前回差分: ${m.delta!>0?'+':''}${m.delta}（同じ対象・既知イベント群）`);
 }else facts.push(sourceStatus==='missing'?'集計は未取得です。人数を0として扱いません。':'古い・部分・取得失敗等の参照値は、このサマリーの判断材料に使用していません。');
 facts.push('収益・リピート率・満足度は未取得。差分は施策の因果や期間流入・転換率を示しません。');
 const sourceCodes=['stopped','analytics_error','analytics_quality','analytics_missing'],priorities:Attention[]=alerts.filter(i=>sourceCodes.includes(i.code));
 if(!s.stopped&&sourceStatus==='usable'&&p){
  const bookings=p.findings.filter(f=>f.kind==='booking_gap'&&f.startsAt&&Date.parse(f.startsAt)>+now&&Date.parse(f.startsAt)-+now<=7*86400000).length;
  const attendance=p.findings.filter(f=>f.kind==='attendance_gap'&&f.startsAt&&+now-Date.parse(f.startsAt)>=2*86400000).length;
  if(bookings)priorities.push({code:'booking_check',message:`開催間近の予約確認候補が${bookings}件あります。定員・募集状況・告知履歴を照合してください。原因と施策効果は未確認です。`,target:'連携状況'});
  if(attendance)priorities.push({code:'attendance_check',message:`実参加データの確認候補が${attendance}件あります。開催有無・実績記録・同期状況を照合してください。`,target:'連携状況'});
 }
 if(!s.stopped)priorities.push(...alerts.filter(i=>!sourceCodes.includes(i.code)));
 const next=s.stopped?priorities.filter(i=>i.code==='stopped'):priorities.slice(0,3),r=s.freeAI;
 const fresh=(t:string)=>Number.isFinite(Date.parse(t))&&Date.parse(t)<=+now&&+now-Date.parse(t)<=36*3600000;
 const aiStatus=!r?'not_generated':r.status!=='succeeded'?r.status:sourceStatus==='usable'&&r.result&&r.finishedAt&&fresh(r.startedAt)&&fresh(r.finishedAt)&&Date.parse(r.finishedAt)>=Date.parse(r.startedAt)&&r.sourceAt===a?.lastSuccessAt?'unverified':'outdated';
 const ai={status:aiStatus,summary:aiStatus==='unverified'?r!.result!.summary:null};
 const generatedAt=now.toISOString(),observedAt=p?.observedAt??null,updatedAt=p?.sourceUpdatedAt??null,lastSuccessAt=a?.lastSuccessAt??null;
 const aiLabel=({not_generated:'生成記録なし',running:'分析中・未完了',failed:'生成失敗',held:'分析保留',unverified:'形式検証済み・内容は未検証',outdated:'参照データ不一致または古い提案'} as Record<string,string>)[ai.status];
 const markdown=[`# ${date} Unity運営サマリー`,headline,`表示用の生成日時: ${generatedAt}`,`データ観測日時: ${observedAt??'未取得'}`,`元データ更新日時: ${updatedAt??'不明'}`,`最終取得成功: ${lastSuccessAt??'未取得'}`,'','## 保存記録から確認できたこと',...facts.map(x=>'- '+x),'','## 次の確認事項',...(next.length?next.map(x=>'- '+x.message):['- 現在の保存記録から追加の確認事項は検出していません。']),'',`AIの記録: ${aiLabel}。モデルの文章はこの書き出しには含めていません。`,'表示時に再構成したサマリーです。日次履歴の保存や外部通知ではありません。'].join('\n');
 return {date,generatedAt,observedAt,updatedAt,lastSuccessAt,sourceStatus,headline,facts,priorities:next,ai,markdown};
}
