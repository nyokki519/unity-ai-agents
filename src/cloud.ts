import {syncAnalytics} from './analytics.js';
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {State,emptyState,type StateData} from './model.js';
import type {StateStore} from './state-store.js';
import {Engine} from './engine.js';
import {GitHubReader,syncGitHub} from './github.js';
import {view} from './view.js';

export interface StoragePort {
 get<T>(key:string):Promise<T|undefined>;
 put(key:string,value:unknown):Promise<unknown>;
 delete(key:string):Promise<unknown>;
 transaction<T>(fn:(storage:StoragePort)=>Promise<T>):Promise<T>;
}
export class CloudStore implements StateStore {
 constructor(private storage:StoragePort){}
 private async load(storage:StoragePort):Promise<StateData>{
  const count=await storage.get<number>('state-count');if(count===undefined)return emptyState();
  if(!Number.isInteger(count)||count<1||count>250)throw new Error('state_invalid_or_unreadable');
  let json='';for(let i=0;i<count;i++){const part=await storage.get<string>('state-'+i);if(typeof part!=='string')throw new Error('state_invalid_or_unreadable');json+=part;}
  if(Buffer.byteLength(json)>2_000_000)throw new Error('state_capacity_exceeded');
  return State.parse(JSON.parse(json));
 }
 async read(){return this.storage.transaction(s=>this.load(s));}
 async transaction<T>(mutate:(state:StateData)=>T|Promise<T>):Promise<T>{return this.storage.transaction(async storage=>{
  const state=await this.load(storage),result=await mutate(state);state.revision++;State.parse(state);const text=JSON.stringify(state);
  if(Buffer.byteLength(text)>2_000_000)throw new Error('state_capacity_exceeded');
  // 8000 UTF-16 code units <= 32000 UTF-8 bytes, safely below 128 KiB/value.
  const old=await storage.get<number>('state-count')??0,count=Math.ceil(text.length/8000);
  for(let i=0;i<count;i++)await storage.put('state-'+i,text.slice(i*8000,(i+1)*8000));
  for(let i=count;i<old;i++)await storage.delete('state-'+i);
  await storage.put('state-count',count);return structuredClone(result);
 });}
}
const Auth=z.object({epoch:z.string().default(''),sessions:z.array(z.object({hash:z.string(),csrf:z.string(),expires:z.number()})).max(100),minute:z.number(),logins:z.number(),calls:z.number(),day:z.string(),daily:z.number()});
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
const equal=(a:string,b:string)=>timingSafeEqual(Buffer.from(digest(a),'hex'),Buffer.from(digest(b),'hex'));
export type CloudEnv={UNITY_ANALYTICS_READ_TOKEN?:string;UNITY_ADMIN_TOKEN?:string;UNITY_PUBLIC_ORIGIN?:string;UNITY_FREE_CLOUD_CONFIRMED?:string};
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",'Strict-Transport-Security':'max-age=31536000'};
async function readBody(req:Request){
 const reader=req.body?.getReader();if(!reader)return {};
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>64000){await reader.cancel();throw new Error('request_invalid');}chunks.push(r.value);}
 try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw new Error('request_invalid');}
}
export class CloudConsole {
 private store:CloudStore;private engine:Engine;
 constructor(private storage:StoragePort,private env:CloudEnv){this.store=new CloudStore(storage);this.engine=new Engine(this.store);}
 async fetch(req:Request):Promise<Response>{
  const json=(data:unknown,status=200,extra:Record<string,string>={})=>Response.json(data,{status,headers:{...headers,...extra}});
  if((this.env.UNITY_ADMIN_TOKEN?.length??0)<32||this.env.UNITY_FREE_CLOUD_CONFIRMED!=='true')return json({error:'cloud_configuration_required'},503);
  const url=new URL(req.url),mutation=req.method!=='GET',origin=this.env.UNITY_PUBLIC_ORIGIN??'';
  if(!origin.startsWith('https://')||url.origin!==origin)return json({error:'origin_rejected'},403);
  if(mutation&&req.headers.get('Origin')!==origin)return json({error:'origin_rejected'},403);
  if(req.headers.get('Sec-Fetch-Site')==='cross-site')return json({error:'origin_rejected'},403);
  const path=url.pathname;
  if(path==='/api/health'&&req.method==='GET')return json({status:'cloud_ready'});
  try{
   const now=Date.now(),minute=Math.floor(now/60000),day=new Date(now).toISOString().slice(0,10);
   const access=await this.storage.transaction(async s=>{
    const auth=Auth.parse(await s.get('auth')??{sessions:[],minute,logins:0,calls:0,day,daily:0});
    const epoch=digest(this.env.UNITY_ADMIN_TOKEN!);if(auth.epoch!==epoch){auth.epoch=epoch;auth.sessions=[];}
    auth.sessions=auth.sessions.filter(s=>s.expires>now);
    if(auth.minute!==minute){auth.minute=minute;auth.logins=0;auth.calls=0;}
    if(auth.day!==day){auth.day=day;auth.daily=0;}
    const sid=(req.headers.get('cookie')??'').split(';').map(s=>s.trim()).find(s=>s.startsWith('unity_session='))?.slice(14)??'';
    const session=auth.sessions.find(s=>equal(s.hash,digest(sid)));
    const login=path==='/api/login'&&req.method==='POST';
    if(login)auth.logins++;else if(session){auth.daily++;auth.calls++;}
    const limited=login?auth.logins>5:!!session&&(auth.daily>2000||auth.calls>120);
    // Saturate counters to avoid unlimited growth under hostile traffic.
    auth.daily=Math.min(auth.daily,2001);auth.calls=Math.min(auth.calls,121);auth.logins=Math.min(auth.logins,6);
    if(login||session)await s.put('auth',auth);return {session,limited};
   });
   const safetyOperation=access.session&&req.method==='POST'&&['/api/stop','/api/logout'].includes(path);
   if(access.limited&&!safetyOperation)return json({error:'rate_limited'},429);
   if(path==='/api/login'&&req.method==='POST'){
    const input=z.object({token:z.string().max(512)}).strict().parse(await readBody(req));
    if(!equal(input.token,this.env.UNITY_ADMIN_TOKEN!))return json({error:'unauthorized'},401);
    const sid=randomBytes(32).toString('base64url'),csrf=randomBytes(32).toString('base64url');
    await this.storage.transaction(async s=>{const auth=Auth.parse(await s.get('auth'));if(auth.sessions.length>=100)throw new Error('session_capacity');auth.sessions.push({hash:digest(sid),csrf,expires:now+3600000});await s.put('auth',auth);});
    return json({ok:true,csrf},200,{'Set-Cookie':`unity_session=${sid}; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`});
   }
   if(!access.session)return json({error:'unauthorized'},401);
   if(mutation&&!equal(req.headers.get('x-csrf-token')??'',access.session.csrf))return json({error:'csrf_rejected'},403);
   if(path==='/api/logout'&&req.method==='POST'){
    await this.storage.transaction(async s=>{const a=Auth.parse(await s.get('auth'));a.sessions=a.sessions.filter(x=>x.hash!==access.session!.hash);await s.put('auth',a);});
    return json({ok:true},200,{'Set-Cookie':'unity_session=; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});
   }
   if(path==='/api/state'&&req.method==='GET'){
    const data=view(await this.store.read());return json({...data,usage:{...data.usage,mode:'cloud_rules_only',cloudUsage:null}});
   }
   if(req.method!=='POST')return json({error:'not_found'},404);
   if(path==='/api/tasks')return json(await this.engine.createAndAdvance(await readBody(req)),201);
   if(path==='/api/run')return json(await this.engine.runNext());
   if(path==='/api/stop'){const input=z.object({stopped:z.boolean()}).strict().parse(await readBody(req));if(access.limited&&!input.stopped)return json({error:'rate_limited'},429);return json(await this.engine.stop(input.stopped));}
   if(path==='/api/analytics/sync')return json(await syncAnalytics(this.store,this.env.UNITY_ANALYTICS_READ_TOKEN??''));
   if(path==='/api/github/sync')return json(await syncGitHub(this.store,new GitHubReader(fetch,()=>new Date(),'')));
   if(path==='/api/github/tasks'){
    const input=z.object({key:z.string().max(120)}).strict().parse(await readBody(req));const finding=(await this.store.read()).github?.snapshot?.findings.find(f=>f.key===input.key);
    if(!finding)return json({error:'github_finding_missing'},400);const ci=finding.kind==='ci_failure';
    return json(await this.engine.createAndAdvance({instruction:ci?`GitHub CI run #${finding.number}の失敗原因を調査して`:`GitHub Issue #${finding.number}の対応状況を確認して`,priority:ci?1:2,idempotencyKey:'github-source-'+finding.key.replace(':','-')}));
   }
   const match=path.match(/^\/api\/tasks\/([0-9a-f-]{36})\/(pause|resume|handoff|approve)$/);
   if(match){const id=z.uuid().parse(match[1]);switch(match[2]){
    case 'pause':return json(await this.engine.pause(id));case 'resume':return json(await this.engine.resume(id));case 'handoff':return json(await this.engine.handoff(id,await readBody(req)));
    case 'approve':{const input=z.object({operationHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(await readBody(req));const a=await this.engine.approve(id,input.operationHash);return json({id:a.id,expiresAt:a.expiresAt,executable:false});}
   }}
   return json({error:'not_found'},404);
  }catch(e){
   const safe=new Set(['request_invalid','secret_detected','repository_not_allowed','idempotency_conflict','dependency_missing','task_capacity_exceeded','request_capacity_exceeded','audit_capacity_exceeded','history_capacity_exceeded','handoff_not_expected','task_not_pauseable','task_not_resumable','approval_target_changed','approval_invalid','state_capacity_exceeded','session_capacity']);
   const code=e instanceof Error?e.message:'';return json({error:e instanceof z.ZodError?'request_invalid':safe.has(code)?code:'operation_failed'},e instanceof z.ZodError||safe.has(code)?400:503);
  }
 }
}
