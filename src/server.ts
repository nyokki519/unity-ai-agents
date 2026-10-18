import {syncGitHub} from './github.js';
import http,{type IncomingMessage,type ServerResponse} from 'node:http';import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';import {readFile} from 'node:fs/promises';import {resolve} from 'node:path';import {z} from 'zod';
import {Engine} from './engine.js';import {FileStore} from './store.js';import {view} from './view.js';
const safeErrors=new Set(['repository_not_allowed','idempotency_conflict','dependency_missing','task_capacity_exceeded','request_capacity_exceeded','audit_capacity_exceeded','history_capacity_exceeded','handoff_not_expected','task_not_pauseable','task_not_resumable','approval_target_changed','approval_invalid','state_locked','state_invalid_or_unreadable','state_capacity_exceeded','secret_detected']);
const hash=(s:string)=>createHash('sha256').update(s).digest();
const eq=(a:string,b:string)=>timingSafeEqual(hash(a),hash(b));
async function body(req:IncomingMessage){let bytes=0;const chunks:Buffer[]=[];for await(const part of req){const b=Buffer.from(part);bytes+=b.length;if(bytes>64_000)throw new Error('body_too_large');chunks.push(b);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new Error('request_invalid');}}
export function createApp({store=new FileStore(),adminToken=process.env.UNITY_ADMIN_TOKEN??'',publicDirectory=resolve('public')}={}){
 const engine=new Engine(store),sessions=new Map<string,{csrf:string;expires:number}>(),rates=new Map<string,{n:number;until:number}>();
 const configured=adminToken.length>=32;
 function limited(key:string,max:number){const now=Date.now();for(const [k,v] of rates)if(v.until<now)rates.delete(k);const r=rates.get(key)??{n:0,until:now+60_000};r.n++;rates.set(key,r);return r.n>max;}
 const server=http.createServer(async(req,res)=>{
  const json=(value:unknown,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  const address=server.address(),port=address&&typeof address==='object'?address.port:0,hosts=[`127.0.0.1:${port}`,`localhost:${port}`];
  if(!hosts.includes(req.headers.host??''))return json({error:'host_rejected'},403);
  const mutation=req.method!=='GET';if(mutation&&!hosts.some(h=>req.headers.origin===`http://${h}`))return json({error:'origin_rejected'},403);
  const path=(req.url??'/').split('?')[0]!;
  try{
   if(req.method==='GET'&&['/','/app.js','/style.css'].includes(path)){const file=path==='/'?'index.html':path.slice(1);res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8');res.end(await readFile(resolve(publicDirectory,file)));return;}
   if(path==='/api/health'&&req.method==='GET')return json({status:configured?'local_ready':'admin_token_required',phase:1});
   if(path==='/api/login'&&req.method==='POST'){
    if(!configured)return json({error:'admin_token_required'},503);
    if(limited('login',5))return json({error:'login_rate_limited'},429);
    const input=z.object({token:z.string().max(512)}).strict().parse(await body(req));if(!eq(input.token,adminToken))return json({error:'unauthorized'},401);
    for(const [k,v] of sessions)if(v.expires<Date.now())sessions.delete(k);if(sessions.size>=100)return json({error:'session_capacity'},429);
    const sid=randomBytes(32).toString('base64url'),csrf=randomBytes(32).toString('base64url');sessions.set(sid,{csrf,expires:Date.now()+3600_000});res.setHeader('Set-Cookie',`unity_session=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`);return json({ok:true,csrf});
   }
   const sid=(req.headers.cookie??'').split(';').map(x=>x.trim()).find(x=>x.startsWith('unity_session='))?.slice(14)??'',session=sessions.get(sid);
   if(!session||session.expires<Date.now())return json({error:'unauthorized'},401);
   if(limited('api',120))return json({error:'rate_limited'},429);
   if(mutation&&(!req.headers['x-csrf-token']||!eq(String(req.headers['x-csrf-token']),session.csrf)))return json({error:'csrf_rejected'},403);
   if(path==='/api/logout'&&req.method==='POST'){sessions.delete(sid);res.setHeader('Set-Cookie','unity_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json({ok:true});}
   if(path==='/api/state'&&req.method==='GET')return json(view(await store.read()));
   if(req.method!=='POST')return json({error:'not_found'},404);
   if(path==='/api/tasks')return json({task:await engine.create(await body(req))},201);
   if(path==='/api/github/sync')return json(await syncGitHub(store));
   if(path==='/api/github/tasks'){const input=z.object({key:z.string().max(120)}).strict().parse(await body(req));const snapshot=(await store.read()).github?.snapshot,finding=snapshot?.findings.find(f=>f.key===input.key);if(!finding)return json({error:'github_finding_missing'},400);const ci=finding.kind==='ci_failure';return json({task:await engine.create({instruction:ci?`GitHub CI run #${finding.number}の失敗原因を調査して`:`GitHub Issue #${finding.number}の対応状況を確認して`,priority:ci?1:2,idempotencyKey:'github-source-'+finding.key.replace(':','-')})});}
   if(path==='/api/run')return json(await engine.runNext());
   if(path==='/api/stop'){const value=z.object({stopped:z.boolean()}).strict().parse(await body(req));return json(await engine.stop(value.stopped));}
   const match=path.match(/^\/api\/tasks\/([0-9a-f-]{36})\/(pause|resume|handoff|approve)$/);
   if(match){const id=z.uuid().parse(match[1]);switch(match[2]){case 'pause':return json(await engine.pause(id));case 'resume':return json(await engine.resume(id));case 'handoff':return json(await engine.handoff(id,await body(req)));case 'approve':{const input=z.object({operationHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(await body(req));const a=await engine.approve(id,input.operationHash);return json({id:a.id,expiresAt:a.expiresAt,executable:false});}}}
   return json({error:'not_found'},404);
  }catch(e){const code=e instanceof Error?e.message:'';return json({error:safeErrors.has(code)?code:e instanceof z.ZodError||['request_invalid','body_too_large'].includes(code)?'request_invalid':'operation_failed'},safeErrors.has(code)||e instanceof z.ZodError||['request_invalid','body_too_large'].includes(code)?400:503);}
 });
 server.headersTimeout=10_000;server.requestTimeout=15_000;server.maxRequestsPerSocket=100;return server;
}
