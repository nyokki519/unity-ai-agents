// Local workerd integration: no Cloudflare account, deployment or external API calls.
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {randomBytes} from 'node:crypto';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
const directory=await mkdtemp(join(tmpdir(),'unity-cloud-smoke-')),origin='https://agents.example.com',token=randomBytes(32).toString('hex');
let redirectUpstream=false,upstreamCalls=0;
const options={outboundService:async request=>{
 upstreamCalls++;assert.equal(request.url,'https://unity-analytics.vercel.app/api/agent/summary');
 assert.equal(request.headers.get('Authorization'),'Bearer smoke-read-key');
 if(redirectUpstream)return new Response(null,{status:302,headers:{Location:'https://untrusted.test/'}});
 const now=new Date(),start=new Date(now.getTime()-86400000),end=new Date(now.getTime()+86400000);
 return Response.json({schema_version:'1',source:'unity-analytics:93279',timezone:'Asia/Tokyo',observed_at:now.toISOString(),source_updated_at:now.toISOString(),period:{start:start.toISOString(),end:end.toISOString()},sync_status:'complete',events:[{event_id:'private-id-not-persisted',title:'private title',starts_at:new Date(now.getTime()+12*3600000).toISOString(),status:'open',capacity:20,bookings_active:2,attended:null,pv:null}]});
},name:'unity-ai-agents',telemetry:{enabled:false},modules:true,scriptPath:resolve('.runtime/worker-build/worker.js'),compatibilityDate:'2026-10-18',compatibilityFlags:['nodejs_compat'],durableObjects:{CONSOLE:{className:'UnityConsole',useSQLite:true}},resourcePersistencePath:directory,bindings:{UNITY_ANALYTICS_READ_TOKEN:'smoke-read-key',UNITY_PUBLIC_ORIGIN:origin,UNITY_ADMIN_TOKEN:token,UNITY_FREE_CLOUD_CONFIRMED:'true'},serviceBindings:{ASSETS:async request=>{const path=new URL(request.url).pathname;const file=path==='/'?'index.html':path.slice(1);return new Response(await readFile(resolve('public',file)),{headers:{'Content-Type':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html'}});}}};
let mf=new Miniflare(convertV4MiniflareOptions(options));
const post=(path,body,headers={})=>mf.dispatchFetch(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
try{
 const html=await mf.dispatchFetch(origin+'/');assert.equal(html.status,200);assert.match(await html.text(),/Unity AI Agents/);assert.match(html.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);
 assert.equal((await mf.dispatchFetch(origin+'/api/state')).status,401);
 const login=await post('/api/login',{token});assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/Secure/);
 const {csrf}=await login.json(),headers={cookie:login.headers.get('set-cookie').split(';')[0],'x-csrf-token':csrf};
 assert.equal((await post('/api/tasks',{instruction:'このシステムの稼働状態を確認',idempotencyKey:'worker-smoke'},headers)).status,201);
 let state=await (await mf.dispatchFetch(origin+'/api/state',{headers})).json();assert.equal(state.tasks[0].status,'succeeded');assert.equal(state.runs.length,2);
 const analytics=await (await post('/api/analytics/sync',{},headers)).json();assert.equal(analytics.status,'success',JSON.stringify(analytics));assert.equal(analytics.followup.created,1);assert.equal(upstreamCalls,1);
 await mf.dispose();mf=new Miniflare(convertV4MiniflareOptions(options));
 const restored=await mf.dispatchFetch(origin+'/api/state',{headers});assert.equal(restored.status,200,'restart response '+await restored.clone().text());state=await restored.json();assert.equal(state.tasks.length,2);assert.equal(state.runs.length,3);assert.equal(state.tasks.filter(t=>t.status==='awaiting_inference').length,1);assert.ok(state.tasks.find(t=>t.status==='awaiting_inference').guidance.steps.length>=3);assert.ok(state.tasks.find(t=>t.status==='awaiting_inference').instruction.includes('完了条件'));assert.ok(!JSON.stringify(state).includes('private-id-not-persisted'));assert.ok(!JSON.stringify(state).includes('private title'));
 assert.equal((await post('/api/stop',{stopped:true},headers)).status,200);
 state=await (await mf.dispatchFetch(origin+'/api/state',{headers})).json();assert.equal(state.stopped,true);
 assert.equal((await post('/api/logout',{},headers)).status,200);assert.equal((await mf.dispatchFetch(origin+'/api/state',{headers})).status,401);
 await mf.dispose();redirectUpstream=true;upstreamCalls=0;mf=new Miniflare(convertV4MiniflareOptions({...options,resourcePersistencePath:join(directory,'redirect-test')}));
 const redirectLogin=await post('/api/login',{token}),redirectSession=await redirectLogin.json();
 const redirectHeaders={cookie:redirectLogin.headers.get('set-cookie').split(';')[0],'x-csrf-token':redirectSession.csrf};
 const redirectResult=await (await post('/api/analytics/sync',{},redirectHeaders)).json();assert.equal(redirectResult.error,'analytics_http_302');assert.equal(upstreamCalls,1,'must not follow redirect or forward credentials');
 console.log('PASS: workerd assets/auth/CSRF/automatic task execution/native Analytics fetch/finding task creation/redirect refusal/SQLite restart persistence/emergency stop/logout');
}finally{await mf.dispose();await rm(directory,{recursive:true,force:true});}
