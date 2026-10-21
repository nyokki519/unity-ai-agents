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
 await mf.dispose();redirectUpstream=false;upstreamCalls=0;mf=new Miniflare(convertV4MiniflareOptions({...options,resourcePersistencePath:join(directory,'daily-test')}));
 assert.equal((await post('/_internal/daily',{}, {Authorization:'Bearer '+token})).status,404,'internal cron path must be unreachable through public Worker');
 await (await mf.getWorker()).scheduled({cron:'40 22 * * *',scheduledTime:Date.now()});assert.equal(upstreamCalls,1);
 const dailyLogin=await post('/api/login',{token}),dailySession=await dailyLogin.json(),dailyHeaders={cookie:dailyLogin.headers.get('set-cookie').split(';')[0],'x-csrf-token':dailySession.csrf};
 state=await (await mf.dispatchFetch(origin+'/api/state',{headers:dailyHeaders})).json();assert.equal(state.automation.lastRun.status,'success');assert.equal(state.automation.lastRun.created,1);assert.equal(state.tasks[0].status,'awaiting_inference');
 await mf.dispose();mf=new Miniflare(convertV4MiniflareOptions({...options,resourcePersistencePath:join(directory,'daily-test')}));await (await mf.getWorker()).scheduled({cron:'40 22 * * *',scheduledTime:Date.now()});assert.equal(upstreamCalls,1,'persisted daily claim must survive restart');
 await mf.dispose();upstreamCalls=0;
 const aiOptions=convertV4MiniflareOptions({...options,resourcePersistencePath:join(directory,'ai-test'),serviceBindings:{...options.serviceBindings,AI:{name:'ai-mock',entrypoint:'FakeAI'}}});
 const mockAI=convertV4MiniflareOptions({name:'ai-mock',modules:true,compatibilityDate:'2026-10-18',script:`import {WorkerEntrypoint} from 'cloudflare:workers';export class FakeAI extends WorkerEntrypoint {async run(model,input){await new Promise(r=>setTimeout(r,100));if(model!=='@cf/meta/llama-3.1-8b-instruct-fp8-fast'||input.max_tokens!==1024||JSON.stringify(input).includes('private'))throw new Error('unsafe_input');return {response:JSON.stringify({summary:'確認を優先',proposals:[{action:'告知状況を確認',reason:'参照情報が未取得',effect:'判断材料を整理',effort:'low',risk:'原因は未確認',verification:'確認日時を記録'}],unverified:['施策効果は未確認']})};}}export default {fetch(){return new Response('mock');}};`});
 aiOptions.workers.push(...mockAI.workers);mf=new Miniflare(aiOptions);
 await (await mf.getWorker('unity-ai-agents')).scheduled({cron:'40 22 * * *',scheduledTime:Date.now()});
 const aiLogin=await post('/api/login',{token}),aiSession=await aiLogin.json(),aiHeaders={cookie:aiLogin.headers.get('set-cookie').split(';')[0],'x-csrf-token':aiSession.csrf};
 state=await (await mf.dispatchFetch(origin+'/api/state',{headers:aiHeaders})).json();assert.equal(state.freeAI.status,'succeeded',JSON.stringify(state.freeAI));assert.equal(state.automation.health.level,'recorded');assert.equal(state.usage.aiCalls,1);assert.equal(state.usage.paidApiCalls,0);assert.equal(state.tasks[0].status,'awaiting_inference');
 await mf.dispose();mf=new Miniflare(aiOptions);await (await mf.getWorker('unity-ai-agents')).scheduled({cron:'40 22 * * *',scheduledTime:Date.now()});
 state=await (await mf.dispatchFetch(origin+'/api/state',{headers:aiHeaders})).json();assert.equal(state.usage.aiCalls,1,'AI claim must survive restart');assert.equal(state.freeAI.result.proposals.length,1);assert.equal(upstreamCalls,1);
 await mf.dispose();mf=new Miniflare({...aiOptions,resourcePersistencePath:join(directory,'ai-stop-test')});
 const stopLogin=await post('/api/login',{token}),stopSession=await stopLogin.json(),stopHeaders={cookie:stopLogin.headers.get('set-cookie').split(';')[0],'x-csrf-token':stopSession.csrf};
 const pendingAI=(await mf.getWorker('unity-ai-agents')).scheduled({cron:'40 22 * * *',scheduledTime:Date.now()});let observedRunning=false;
 for(let i=0;i<100;i++){state=await (await mf.dispatchFetch(origin+'/api/state',{headers:stopHeaders})).json();if(state.freeAI?.status==='running'){observedRunning=true;break;}await new Promise(r=>setTimeout(r,5));}
 assert.ok(observedRunning,'stop must interleave while AI is waiting');assert.equal((await post('/api/stop',{stopped:true},stopHeaders)).status,200);assert.equal((await post('/api/stop',{stopped:false},stopHeaders)).status,200);await pendingAI;
 state=await (await mf.dispatchFetch(origin+'/api/state',{headers:stopHeaders})).json();assert.equal(state.freeAI.status,'held');assert.ok(state.automation.health.issues.some(i=>i.code==='ai_held'));assert.equal(state.freeAI.result,null);assert.equal(state.usage.aiCalls,1);
 console.log('PASS: workerd assets/auth/CSRF/automatic task execution/native Analytics fetch/finding task creation/redirect refusal/SQLite restart persistence/emergency stop/logout/daily cron and deduplication/mock AI binding projection/restart/stop-resume fence');
}finally{await mf.dispose();await rm(directory,{recursive:true,force:true});}
