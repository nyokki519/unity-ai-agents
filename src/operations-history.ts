import type {z} from 'zod';
import type {DailyRecord} from './daily.js';
import type {StateStore} from './state-store.js';
import {OperationDay,HistorySnapshot} from './operations-history-model.js';
/** Bounded operational evidence; never rolls off old records or blocks monitoring. */
export async function recordOperationDay(store:StateStore,d:z.infer<typeof DailyRecord>){
 return store.transaction(s=>{
  const index=s.operationsHistory.findIndex(r=>r.day===d.day),old=index>=0?s.operationsHistory[index]:undefined;
  if(index<0&&s.operationsHistory.length>=90)return {status:'capacity'};
  const sameJob=old?.startedAt===d.startedAt;
  if(sameJob&&old!.status!=='running'&&old!.finishedAt&&d.status==='running')return {status:'unchanged'};
  const a=s.analytics,success=!!a?.snapshot&&!!a.lastSuccessAt&&!!d.finishedAt&&['success','partial'].includes(d.status)&&Date.parse(a.lastSuccessAt)>=Date.parse(d.startedAt)&&Date.parse(a.lastSuccessAt)<=Date.parse(d.finishedAt);
  let snapshot=null;if(success){const {findings,...aggregate}=a!.snapshot!;snapshot=HistorySnapshot.parse(aggregate);}
  const r=s.freeAI,aiMatches=!!r&&!!d.finishedAt&&['success','partial'].includes(d.status)&&!!r.sourceAt&&Date.parse(r.sourceAt)>=Date.parse(d.startedAt)&&Date.parse(r.sourceAt)<=Date.parse(d.finishedAt)&&Date.parse(r.startedAt)>=Date.parse(r.sourceAt)&&Date.parse(r.startedAt)>=Date.parse(d.startedAt)&&Date.parse(r.startedAt)<=Date.parse(d.finishedAt)+60000;
  const record=OperationDay.parse({day:d.day,startedAt:d.startedAt,finishedAt:d.finishedAt,recordedAt:old?.recordedAt??new Date().toISOString(),status:d.status,created:d.created,fetchedAt:success?a!.lastSuccessAt:sameJob?old!.fetchedAt:null,snapshot:snapshot??(sameJob?old!.snapshot:null),aiStatus:aiMatches?r!.status:sameJob?old!.aiStatus:'not_run',aiReason:aiMatches?r!.reason:sameJob?old!.aiReason:null});
  if(old&&JSON.stringify(old)===JSON.stringify(record))return {status:'unchanged'};
  const rows=[...s.operationsHistory];if(index>=0)rows[index]=record;else rows.push(record);rows.sort((a,b)=>a.day<b.day?-1:a.day>b.day?1:0);
  if(Buffer.byteLength(JSON.stringify({...s,operationsHistory:rows}))>1800000)return {status:'storage_pressure'};
  s.operationsHistory=rows;return {status:index>=0?'updated':'saved'};
 });
}
