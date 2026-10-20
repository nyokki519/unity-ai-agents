import {Engine} from './engine.js';
import type {StateStore} from './state-store.js';
import {syncAnalytics} from './analytics.js';
const requestKey=(key:string)=>'analytics-finding-'+key;
/** At most one bounded task batch per successful snapshot, atomically reserved. */
export async function createAnalyticsTasks(store:StateStore){
 const claim=await store.transaction(s=>{
  const a=s.analytics;
  if(s.stopped)return {status:'stopped' as const};
  if(!a?.snapshot||a.error||!a.lastSuccessAt||Date.now()-Date.parse(a.lastSuccessAt)>3600000)return {status:'no_data' as const};
  if(a.tasksProcessedAt===a.lastSuccessAt)return {status:'already_processed' as const};
  a.tasksProcessedAt=a.lastSuccessAt;
  const findings=a.snapshot.findings.filter(f=>!s.requests.some(r=>r.key===requestKey(f.key))).slice(0,3);
  return {status:'claimed' as const,findings,observedAt:a.snapshot.observedAt,successAt:a.lastSuccessAt,stopCount:s.safety.stopCount};
 });
 if(claim.status!=='claimed')return {status:claim.status,created:0};
 const guarded:StateStore={read:()=>store.read(),transaction:fn=>store.transaction(s=>{
  if(s.stopped||s.safety.stopCount!==claim.stopCount||s.analytics?.lastSuccessAt!==claim.successAt||s.analytics.error)throw new Error('analytics_task_interrupted');
  return fn(s);
 })};
 const engine=new Engine(guarded);let created=0;
 try{
  for(const finding of claim.findings){
   const time=finding.startsAt?`\n開催予定日時: ${finding.startsAt}`:'';
   const instruction=`Analytics確認: ${finding.title}${time}\n確認番号: ${finding.key}\n検出時: ${claim.observedAt}\n根拠: ${finding.evidence}\n確認内容: ${finding.check}\nこれはルールによる確認候補です。確認専用タスクです。`;
   const task=await engine.create({instruction,priority:finding.priority,idempotencyKey:requestKey(finding.key)});
   created++;await engine.runNext(task.id);
  }
  return {status:'completed',created};
 }catch(e){return {status:e instanceof Error&&e.message==='analytics_task_interrupted'?'interrupted':'blocked',created};}
}
export async function syncAndPlanAnalytics(store:StateStore,token:string){
 const result=await syncAnalytics(store,token);
 if(result.status!=='success')return result;
 try{return {...result,followup:await createAnalyticsTasks(store)};}
 catch{return {...result,followup:{status:'blocked',created:0}};}
}
