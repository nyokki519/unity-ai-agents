import type {StateData} from './model.js';
const statusLabels:Record<string,string>={running:'未完了',success:'取得・タスク化完了',partial:'一部保留',failed:'失敗',stopped:'停止で見送り',not_configured:'設定不足',cooldown:'取得間隔で見送り'};
const aiLabels:Record<string,string>={not_run:'対応する生成記録なし',running:'未完了',succeeded:'生成・形式検証済み',failed:'生成失敗',held:'保留'};
export function monthlyOperations(s:StateData,now=new Date()){
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now),currentMonth=today.slice(0,7);
 const eligible=s.operationsHistory.filter(r=>r.day<=today),months=[...new Set([currentMonth,...eligible.map(r=>r.day.slice(0,7))])].sort().reverse();
 const reports=months.map(month=>{
  const monthEnd=new Date(month+'-01T00:00:00Z');monthEnd.setUTCMonth(monthEnd.getUTCMonth()+1,0);
  const elapsedDays=month===currentMonth?Number(today.slice(8)):monthEnd.getUTCDate(),rows=eligible.filter(r=>r.day.startsWith(month)).sort((a,b)=>a.day<b.day?-1:a.day>b.day?1:0);
  const count=(status:string)=>rows.filter(r=>r.status===status).length,success=count('success'),partial=count('partial'),failed=count('failed'),rateDenominator=success+partial+failed;
  const executions={success,partial,failed,skipped:rows.filter(r=>['stopped','not_configured','cooldown'].includes(r.status)).length,running:count('running'),rateDenominator,completionRate:rateDenominator?Math.round(success/rateDenominator*1000)/10:null};
  const ai={succeeded:rows.filter(r=>r.aiStatus==='succeeded').length,failed:rows.filter(r=>r.aiStatus==='failed').length,held:rows.filter(r=>r.aiStatus==='held').length,running:rows.filter(r=>r.aiStatus==='running').length,notRun:rows.filter(r=>r.aiStatus==='not_run').length};
  const last=[...rows].reverse().find(r=>r.snapshot&&r.fetchedAt),p=last?.snapshot;
  const latest=p&&last?{day:last.day,observedAt:p.observedAt,sourceUpdatedAt:p.sourceUpdatedAt,fetchedAt:last.fetchedAt,quality:p.syncStatus==='complete'&&p.sourceUpdatedAt&&Date.parse(p.observedAt)>=Date.parse(p.sourceUpdatedAt)&&Date.parse(p.observedAt)-Date.parse(p.sourceUpdatedAt)<=36*3600000?'complete':'partial_or_unknown',metrics:(['bookings','attendance','pageviews'] as const).map(name=>({name,label:{bookings:'予約合計',attendance:'実参加合計',pageviews:'PV累計合計'}[name],...p[name]}))}:null;
  const recordedCreatedTasks=rows.reduce((n,r)=>n+r.created,0),coverage={recordedDays:rows.length,elapsedDays,missingDays:Math.max(0,elapsedDays-rows.length)};
  const notes=['未記録の日は、導入前・未実行・保存不可を区別できません。失敗や人数0と決めつけません。','完了率は成功・一部保留・失敗の記録だけを分母とし、意図した停止・見送り・未完了を除きます。','AI生成記録は形式検証の記録です。内容の正しさや施策効果の確認ではありません。','日別の予約・実参加・PV累計を合算しません。月間参加人数・収益・リピート・満足度は未計測です。'];
  const days=[...rows].reverse().map(r=>({day:r.day,status:statusLabels[r.status],created:r.created,ai:aiLabels[r.aiStatus],aiReason:r.aiReason,hasMeasurement:!!r.snapshot}));
  const markdown=[`# ${month} Unity月次運用レポート`,`記録日: ${coverage.recordedDays} / 経過${coverage.elapsedDays}日（未記録${coverage.missingDays}日）`,`取得・タスク化: 完了${success} / 一部保留${partial} / 失敗${failed} / 見送り${executions.skipped} / 未完了${executions.running}`,`完了率: ${executions.completionRate??'未算出'}${executions.completionRate===null?'':'%'}（分母${rateDenominator}件）`,`記録上の確認タスク作成: ${recordedCreatedTasks}件`,`対応するAI記録: 生成${ai.succeeded} / 失敗${ai.failed} / 保留${ai.held} / 未完了${ai.running} / 記録なし${ai.notRun}`,'','## 直近の保存値（期間合計ではありません）',...(latest?[`観測日時: ${latest.observedAt}`,`元データ更新日時: ${latest.sourceUpdatedAt??'不明'}`,`保存時の品質: ${latest.quality==='complete'?'完全':'部分/不明'}`,...latest.metrics.map(m=>`${m.label}: ${m.value??'未取得'}（既知${m.knownEvents} / 対象${m.totalEvents}イベント）`)]:['保存値はありません。']),'','## 日ごとの実行記録',...days.map(d=>`- ${d.day}: ${d.status} / 作成${d.created} / AI: ${d.ai}${d.aiReason?' ('+d.aiReason+')':''}`),'','## 読み方',...notes.map(n=>'- '+n),'モデル文章・元IDは含めていません。外部送付や公開はしていません。'].join('\n');
  return {month,coverage,executions,ai,recordedCreatedTasks,latest,days,notes,markdown};
 });
 return {currentMonth,maximumDays:90,recordedDays:s.operationsHistory.length,remainingDays:Math.max(0,90-s.operationsHistory.length),atCapacity:s.operationsHistory.length>=90,storagePressure:Buffer.byteLength(JSON.stringify(s))>1800000,ignoredFutureDays:s.operationsHistory.length-eligible.length,reports};
}
