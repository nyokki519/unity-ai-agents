// Local workerd integration: no Cloudflare account, deployment or external API calls.
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {randomBytes} from 'node:crypto';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
const directory=await mkdtemp(join(tmpdir(),'unity-cloud-smoke-')),origin='https://agents.example.com',token=randomBytes(32).toString('hex');
const options={name:'unity-ai-agents',telemetry:{enabled:false},modules:true,scriptPath:resolve('.runtime/worker-build/worker.js'),compatibilityDate:'2026-10-18',compatibilityFlags:['nodejs_compat'],durableObjects:{CONSOLE:{className:'UnityConsole',useSQLite:true}},resourcePersistencePath:directory,bindings:{UNITY_PUBLIC_ORIGIN:origin,UNITY_ADMIN_TOKEN:token,UNITY_FREE_CLOUD_CONFIRMED:'true'},serviceBindings:{ASSETS:async request=>{const path=new URL(request.url).pathname;const file=path==='/'?'index.html':path.slice(1);return new Response(await readFile(resolve('public',file)),{headers:{'Content-Type':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html'}});}}};
let mf=new Miniflare(convertV4MiniflareOptions(options));
const post=(path,body,headers={})=>mf.dispatchFetch(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
try{
 const html=await mf.dispatchFetch(origin+'/');assert.equal(html.status,200);assert.match(await html.text(),/Unity AI Agents/);assert.match(html.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);
 assert.equal((await mf.dispatchFetch(origin+'/api/state')).status,401);
 const login=await post('/api/login',{token});assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/Secure/);
 const {csrf}=await login.json(),headers={cookie:login.headers.get('set-cookie').split(';')[0],'x-csrf-token':csrf};
 assert.equal((await post('/api/tasks',{instruction:'このシステムの稼働状態を確認',idempotencyKey:'worker-smoke'},headers)).status,201);
 let state=await (await mf.dispatchFetch(origin+'/api/state',{headers})).json();assert.equal(state.tasks[0].status,'succeeded');assert.equal(state.runs.length,2);
 await mf.dispose();mf=new Miniflare(convertV4MiniflareOptions(options));
 const restored=await mf.dispatchFetch(origin+'/api/state',{headers});assert.equal(restored.status,200,'restart response '+await restored.clone().text());state=await restored.json();assert.equal(state.tasks.length,1);assert.equal(state.runs.length,2);
 assert.equal((await post('/api/stop',{stopped:true},headers)).status,200);
 state=await (await mf.dispatchFetch(origin+'/api/state',{headers})).json();assert.equal(state.stopped,true);
 assert.equal((await post('/api/logout',{},headers)).status,200);assert.equal((await mf.dispatchFetch(origin+'/api/state',{headers})).status,401);
 console.log('PASS: workerd assets/auth/CSRF/automatic task execution/SQLite restart persistence/emergency stop/logout');
}finally{await mf.dispose();await rm(directory,{recursive:true,force:true});}
