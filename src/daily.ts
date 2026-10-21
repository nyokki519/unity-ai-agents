import {z} from 'zod';
import type {StoragePort} from './cloud.js';
import type {StateStore} from './state-store.js';
import {syncAndPlanAnalytics} from './analytics-tasks.js';
export const DAILY_KEY='automation-daily-v1';
export const DailyRecord=z.object({day:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),startedAt:z.iso.datetime(),finishedAt:z.iso.datetime().nullable(),status:z.enum(['running','success','partial','failed','stopped','not_configured','cooldown']),created:z.number().int().min(0).max(3)}).strict();
type ScanResult={status:string;followup?:{status:string;created?:number}};
/** A single bounded read-and-plan operation. No queue drain, AI or external writes. */
export async function runDaily(store:StateStore,storage:StoragePort,token:string,now=new Date(),scan:(s:StateStore,t:string)=>Promise<ScanResult>=syncAndPlanAnalytics){
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const claim=await storage.transaction(async s=>{const raw=await s.get(DAILY_KEY),last=raw?DailyRecord.parse(raw):undefined;if(last&&last.day>=day)return {owned:false,record:last};const record=DailyRecord.parse({day,startedAt:now.toISOString(),finishedAt:null,status:'running',created:0});await s.put(DAILY_KEY,record);return {owned:true,record};});
 if(!claim.owned)return claim.record;
 const record=claim.record;
 try{
  if((await store.read()).stopped)record.status='stopped';
  else if(!token)record.status='not_configured';
  else {const r=await scan(store,token);record.created=r.followup?.created??0;record.status=r.status==='success'?(r.followup&&r.followup.status!=='completed'?'partial':'success'):r.status==='stopped'?'stopped':r.status==='cooldown'?'cooldown':'failed';}
 }catch{record.status='failed';}
 record.finishedAt=new Date().toISOString();
 await storage.transaction(async s=>{const current=DailyRecord.parse(await s.get(DAILY_KEY));if(current.day===day&&current.startedAt===record.startedAt)await s.put(DAILY_KEY,DailyRecord.parse(record));});return record;
}
