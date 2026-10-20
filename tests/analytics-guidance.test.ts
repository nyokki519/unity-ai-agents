import {it,expect} from 'vitest';
import {analyticsGuidance,formatGuidance} from '../src/analytics-guidance.js';
import {plan} from '../src/planner.js';
it('provides distinct read-only verification steps and completion evidence for all finding types',()=>{
 for(const kind of ['booking_gap','attendance_gap','source_quality'] as const){const g=analyticsGuidance(kind);expect(g.steps.length).toBeGreaterThanOrEqual(3);expect(g.doneWhen.length).toBeGreaterThanOrEqual(2);expect(g.ifUnknown).toContain('未確認');expect(formatGuidance(g)).toContain('完了条件');expect(plan('Analytics確認\n'+formatGuidance(g))[0]!.action).toBe('handoff.reasoning');}
 expect(formatGuidance(analyticsGuidance('booking_gap'))).toContain('告知');expect(formatGuidance(analyticsGuidance('attendance_gap'))).toContain('0人');expect(formatGuidance(analyticsGuidance('source_quality'))).toContain('同期履歴');
});
it('shows guidance for an existing linked task without rewriting its instruction or stored state',async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{FileStore}=await import('../src/store.js'),{Engine}=await import('../src/engine.js'),{readAnalytics,ANALYTICS_URL}=await import('../src/analytics.js'),{view}=await import('../src/view.js');
 const dir=await mkdtemp(join(tmpdir(),'unity-guidance-')),store=new FileStore(dir),now=new Date();
 try{
  const snapshot=await readAnalytics(ANALYTICS_URL,'test',async()=>Response.json({schema_version:'1',source:'unity-analytics:93279',timezone:'Asia/Tokyo',observed_at:now.toISOString(),source_updated_at:now.toISOString(),period:{start:now.toISOString(),end:new Date(+now+2*86400000).toISOString()},sync_status:'complete',events:[{event_id:'private',starts_at:new Date(+now+86400000).toISOString(),status:'open',capacity:20,bookings_active:1,attended:null,pv:null}]}));
  await store.transaction(s=>{s.analytics={lastAttemptAt:now.toISOString(),lastSuccessAt:now.toISOString(),error:null,lease:null,snapshot};});
  const task=await new Engine(store).create({instruction:'Analytics既存の確認タスク',idempotencyKey:'analytics-finding-'+snapshot.findings[0]!.key});
  const before=await store.read(),display=view(before).tasks.find(t=>t.id===task.id)!;
  expect(display.guidance?.steps.length).toBeGreaterThanOrEqual(3);expect(display.instruction).toBe(task.instruction);expect(await store.read()).toEqual(before);
 }finally{await rm(dir,{recursive:true,force:true});}
});
