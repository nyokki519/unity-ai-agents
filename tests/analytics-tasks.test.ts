import {it,expect} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {FileStore} from '../src/store.js';import {Engine} from '../src/engine.js';import {AnalyticsSnapshot} from '../src/analytics-model.js';
import {createAnalyticsTasks} from '../src/analytics-tasks.js';
async function fixture(){const dir=await mkdtemp(join(tmpdir(),'unity-findings-')),store=new FileStore(dir),now=new Date().toISOString();const snapshot=AnalyticsSnapshot.parse({observedAt:now,sourceUpdatedAt:now,period:{start:now,end:new Date(Date.now()+86400000).toISOString()},syncStatus:'complete',events:5,pastEvents:0,upcomingEvents:5,bookings:{value:5,knownEvents:5,totalEvents:5},attendance:{value:null,knownEvents:0,totalEvents:0},pageviews:{value:null,knownEvents:0,totalEvents:5},revenue:null,repeatRate:null,satisfaction:null,findings:Array.from({length:5},(_,i)=>({key:String(i).repeat(64),kind:'booking_gap',priority:1,title:'開催間近の予約状況を確認',startsAt:now,evidence:'予約 1 / 20、予約率5%。',check:'告知状況を確認して集客対策を検討してください。'}))});await store.transaction(s=>{s.analytics={lastAttemptAt:now,lastSuccessAt:now,lease:null,error:null,snapshot};});return {store,cleanup:()=>rm(dir,{recursive:true,force:true})};}
it('creates at most three internal handoff tasks with evidence and no duplicates or paid operations',async()=>{const f=await fixture();try{
 expect((await createAnalyticsTasks(f.store)).created).toBe(3);let s=await f.store.read();expect(s.tasks).toHaveLength(3);expect(s.tasks.every(t=>t.status==='awaiting_inference')).toBe(true);expect(s.tasks[0]!.instruction).toContain('予約 1 / 20');expect(s.tasks[0]!.instruction).toContain('検出時');expect(s.tasks[0]!.instruction).toContain('自動添付');expect(s.tasks[0]!.instruction).toContain('元データ更新日時');expect(s.tasks[0]!.instruction).toContain('全体集計');expect(s.tasks.every(t=>t.instruction.length<=4000)).toBe(true);expect(s.usage.paidApiCalls).toBe(0);
 expect((await createAnalyticsTasks(f.store)).created).toBe(0);expect((await f.store.read()).tasks).toHaveLength(3);
 const engine=new Engine(f.store),id=s.tasks[0]!.id;await engine.handoff(id,{summary:'確認した',evidence:[],objections:[],unverified:[]});await engine.runNext(id);
 await createAnalyticsTasks(f.store);s=await f.store.read();expect(s.tasks).toHaveLength(3);expect(s.tasks.find(t=>t.id===id)!.status).toBe('succeeded');
 }finally{await f.cleanup();}});
it('does not act on stopped, failed or old snapshots and preserves data when task capacity is unavailable',async()=>{const f=await fixture();try{
 await f.store.transaction(s=>{s.stopped=true;});expect((await createAnalyticsTasks(f.store)).created).toBe(0);
 await f.store.transaction(s=>{s.stopped=false;s.analytics!.error='analytics_http_503';});expect((await createAnalyticsTasks(f.store)).created).toBe(0);
 await f.store.transaction(s=>{s.analytics!.error=null;s.analytics!.lastSuccessAt=new Date(Date.now()-2*3600000).toISOString();});expect((await createAnalyticsTasks(f.store)).created).toBe(0);
 await f.store.transaction(s=>{s.analytics!.lastSuccessAt=new Date().toISOString();s.audit=Array.from({length:1000},()=>({event:'task_created',at:new Date().toISOString()}));});
 expect((await createAnalyticsTasks(f.store)).status).toBe('blocked');const s=await f.store.read();expect(s.tasks).toHaveLength(0);expect(s.analytics!.snapshot).not.toBeNull();
 }finally{await f.cleanup();}});
it('reserves one batch across concurrent calls and handles remaining candidates on the next successful scan',async()=>{const f=await fixture();try{
 const results=await Promise.all([createAnalyticsTasks(f.store),createAnalyticsTasks(f.store)]);expect(results.reduce((n,r)=>n+r.created,0)).toBe(3);expect((await f.store.read()).tasks).toHaveLength(3);
 await f.store.transaction(s=>{s.analytics!.lastSuccessAt=new Date(Date.now()+1000).toISOString();s.analytics!.tasksProcessedAt=null;});
 expect((await createAnalyticsTasks(f.store)).created).toBe(2);expect((await f.store.read()).tasks).toHaveLength(5);
 }finally{await f.cleanup();}});
it('fences automatic tasks if stop/resume occurs after the batch was reserved',async()=>{const f=await fixture();try{
 let transactions=0;const guarded={read:()=>f.store.read(),transaction:async<T>(fn:Parameters<FileStore['transaction']>[0]):Promise<T>=>{if(++transactions===2){const engine=new Engine(f.store);await engine.stop(true);await engine.stop(false);}return f.store.transaction(fn) as Promise<T>;}};
 expect((await createAnalyticsTasks(guarded)).status).toBe('interrupted');expect((await f.store.read()).tasks).toHaveLength(0);
 }finally{await f.cleanup();}});
