import {it,expect} from 'vitest';
import {readAnalytics,syncAnalytics} from '../src/analytics.js';
const url='https://unity-analytics.vercel.app/api/agent/summary';
const sample={schema_version:'1',source:'unity-analytics:93279',observed_at:'2026-10-20T00:00:00Z',source_updated_at:null,timezone:'Asia/Tokyo',period:{start:'2026-07-20T00:00:00Z',end:'2026-11-03T00:00:00Z'},sync_status:'partial',events:[{event_id:'one',starts_at:'2026-10-01T00:00:00Z',status:'completed',bookings_active:12,attended:10,pv:100,title:'do not persist',email:'private@example.com'},{event_id:'two',starts_at:'2026-10-22T00:00:00Z',status:'open',bookings_active:5,attended:null,pv:null}]};
it('projects only aggregate counts, distinguishes bookings and attendance, and preserves missing metrics',async()=>{
 let calls=0;const snapshot=await readAnalytics(url,'test-token',async(input,init)=>{calls++;expect(String(input)).toBe(url);expect(init?.method).toBe('GET');expect(init?.redirect).toBe('error');return Response.json(sample);});
 expect(calls).toBe(1);expect(snapshot.bookings).toEqual({value:17,knownEvents:2,totalEvents:2});expect(snapshot.attendance).toEqual({value:10,knownEvents:1,totalEvents:1});expect(snapshot.revenue).toBeNull();expect(snapshot.repeatRate).toBeNull();expect(snapshot.satisfaction).toBeNull();expect(JSON.stringify(snapshot)).not.toContain('private@example.com');expect(JSON.stringify(snapshot)).not.toContain('do not persist');
});
it('fails closed for missing credentials, non-allowlisted destinations and redirects',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return Response.json(sample);};
 await expect(readAnalytics(url,'',fetcher)).rejects.toThrow('analytics_not_configured');await expect(readAnalytics('https://evil.example/api/agent/summary','token',fetcher)).rejects.toThrow('analytics_destination_rejected');expect(calls).toBe(0);
 await expect(readAnalytics(url,'token',async()=>new Response(null,{status:302,headers:{Location:'https://evil.example'}}))).rejects.toThrow('analytics_http_302');
});
it('rejects wrong source, invalid counts, timestamps and excessive payloads',async()=>{
 for(const data of [{...sample,source:'other'},{...sample,events:[{...sample.events[0],attended:-1}]},{...sample,observed_at:'unknown'},{...sample,events:[sample.events[0],sample.events[0]]}])await expect(readAnalytics(url,'token',async()=>Response.json(data))).rejects.toThrow('analytics_schema_invalid');
 await expect(readAnalytics(url,'token',async()=>new Response('x'.repeat(1000001)))).rejects.toThrow('analytics_response_too_large');
});

it('persists safe failures, suppresses repeated reads, and respects stop/configuration',async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{FileStore}=await import('../src/store.js');
 const dir=await mkdtemp(join(tmpdir(),'unity-analytics-test-')),store=new FileStore(dir);let calls=0;
 const reader=async()=>{calls++;throw new Error('sensitive failure that must not be stored');};
 try{
  expect((await syncAnalytics(store,'',reader)).status).toBe('not_configured');expect(calls).toBe(0);
  await store.transaction(s=>{s.stopped=true;});expect((await syncAnalytics(store,'token',reader)).status).toBe('stopped');expect(calls).toBe(0);
  await store.transaction(s=>{s.stopped=false;});expect((await syncAnalytics(store,'token',reader)).status).toBe('failed');
  expect((await syncAnalytics(store,'token',reader)).status).toBe('cooldown');expect(calls).toBe(1);
  const state=await store.read();expect(state.analytics?.error).toBe('analytics_read_failed');expect(JSON.stringify(state)).not.toContain('sensitive failure');expect(state.usage.externalApiCalls).toBe(1);
 }finally{await rm(dir,{recursive:true,force:true});}
});
it('discards a pre-stop response even when the system has already resumed',async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{FileStore}=await import('../src/store.js');
 const dir=await mkdtemp(join(tmpdir(),'unity-analytics-fence-')),store=new FileStore(dir);
 const snapshot=await readAnalytics(url,'token',async()=>Response.json(sample));
 let entered!:()=>void,release!:(value:typeof snapshot)=>void;const started=new Promise<void>(r=>{entered=r;}),pending=new Promise<typeof snapshot>(r=>{release=r;});
 try{
  const operation=syncAnalytics(store,'token',async()=>{entered();return pending;});await started;
  await store.transaction(s=>{s.stopped=true;s.safety.stopCount++;});await store.transaction(s=>{s.stopped=false;});release(snapshot);
  expect((await operation).status).toBe('interrupted');expect((await store.read()).analytics?.snapshot).toBeNull();
 }finally{await rm(dir,{recursive:true,force:true});}
});
