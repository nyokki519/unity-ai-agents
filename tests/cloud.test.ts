import {describe,it,expect} from 'vitest';
import {CloudConsole,CloudStore,type StoragePort} from '../src/cloud.js';
class MemoryStorage implements StoragePort {
 data=new Map<string,unknown>();
 async get<T>(key:string){return structuredClone(this.data.get(key)) as T|undefined;}
 async put(key:string,value:unknown){this.data.set(key,structuredClone(value));}
 async delete(key:string){this.data.delete(key);}
 async transaction<T>(fn:(s:StoragePort)=>Promise<T>):Promise<T>{const copy=new Map(this.data);try{return await fn(this);}catch(e){this.data=copy;throw e;}}
}
const origin='https://agents.example.com',token='a'.repeat(40);
const env={UNITY_ADMIN_TOKEN:token,UNITY_PUBLIC_ORIGIN:origin,UNITY_FREE_CLOUD_CONFIRMED:'true'};
function req(path:string,body?:unknown,headers:Record<string,string>={}){return new Request(origin+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},...body===undefined?{}:{body:JSON.stringify(body)}});}
async function login(app:CloudConsole){const res=await app.fetch(req('/api/login',{token}));expect(res.status).toBe(200);const data=await res.json() as {csrf:string};return {cookie:res.headers.get('set-cookie')!.split(';')[0]!,'x-csrf-token':data.csrf};}
describe('cloud console security and persistence',()=>{
 it('fails closed without configured secret/free confirmation and denies anonymous state',async()=>{
  expect((await new CloudConsole(new MemoryStorage(),{}).fetch(req('/api/login',{token}))).status).toBe(503);
  const app=new CloudConsole(new MemoryStorage(),env);
  expect((await app.fetch(req('/api/state'))).status).toBe(401);
  expect((await app.fetch(req('/api/login',{token},{Origin:'https://evil.example'}))).status).toBe(403);
 });
 it('persists login, tasks and stop across object recreation, enforces CSRF and logout',async()=>{
  const storage=new MemoryStorage();let app=new CloudConsole(storage,env);
  const response=await app.fetch(req('/api/login',{token}));expect(response.headers.get('set-cookie')).toContain('Secure');
  const headers=await login(app);
  expect((await app.fetch(req('/api/tasks',{instruction:'このシステムの稼働状態を確認',idempotencyKey:'cloud-test'}, {cookie:headers.cookie}))).status).toBe(403);
  const created=await app.fetch(req('/api/tasks',{instruction:'このシステムの稼働状態を確認',idempotencyKey:'cloud-test'},headers));expect(created.status).toBe(201);expect((await created.json() as {task:{status:string}}).task.status).toBe('succeeded');
  app=new CloudConsole(storage,env);
  const state=await (await app.fetch(req('/api/state',undefined,headers))).json() as {tasks:unknown[]};expect(state.tasks).toHaveLength(1);
  expect((await app.fetch(req('/api/stop',{stopped:true},headers))).status).toBe(200);
  const restarted=new CloudConsole(storage,env);expect((await (await restarted.fetch(req('/api/state',undefined,headers))).json() as {stopped:boolean}).stopped).toBe(true);
  await restarted.fetch(req('/api/logout',{},headers));expect((await app.fetch(req('/api/state',undefined,headers))).status).toBe(401);
 });
 it('keeps login throttling across restarts and rejects oversized bodies',async()=>{
  const storage=new MemoryStorage();for(let i=0;i<5;i++)expect((await new CloudConsole(storage,env).fetch(req('/api/login',{token:'wrong'}))).status).toBe(401);
  expect((await new CloudConsole(storage,env).fetch(req('/api/login',{token}))).status).toBe(429);
  expect((await new CloudConsole(new MemoryStorage(),env).fetch(req('/api/login',{token:'x'.repeat(65000)}))).status).toBe(400);
 });
 it('revokes existing sessions when the administrator secret changes',async()=>{
  const storage=new MemoryStorage(),old=new CloudConsole(storage,env),headers=await login(old);
  const rotated=new CloudConsole(storage,{...env,UNITY_ADMIN_TOKEN:'b'.repeat(40)});
  expect((await rotated.fetch(req('/api/state',undefined,headers))).status).toBe(401);
 });
 it('requires HTTPS and exact configured origin',async()=>{
  const app=new CloudConsole(new MemoryStorage(),env);
  expect((await app.fetch(new Request('http://agents.example.com/api/state'))).status).toBe(403);
  expect((await app.fetch(new Request('https://attacker.example/api/state'))).status).toBe(403);
 });
 it('records approval without enabling a protected executor',async()=>{
  const app=new CloudConsole(new MemoryStorage(),env),headers=await login(app);
  const created=await (await app.fetch(req('/api/tasks',{instruction:'本番デプロイして',idempotencyKey:'protected-cloud'},headers))).json() as {task:{id:string;status:string}};
  expect(created.task.status).toBe('awaiting_approval');
  const state=await (await app.fetch(req('/api/state',undefined,headers))).json() as {tasks:{id:string;operationHash:string}[]};
  const approval=await app.fetch(req('/api/tasks/'+created.task.id+'/approve',{operationHash:state.tasks[0]!.operationHash},headers));
  expect(approval.status).toBe(200);expect((await approval.json() as {executable:boolean}).executable).toBe(false);
 });
 it('does not charge anonymous traffic to the admin quota and preserves emergency stop/logout at the limit',async()=>{
  const storage=new MemoryStorage(),app=new CloudConsole(storage,env),headers=await login(app);
  for(let i=0;i<125;i++)expect((await app.fetch(req('/api/state'))).status).toBe(401);
  expect((await app.fetch(req('/api/state',undefined,headers))).status).toBe(200);
  const auth=storage.data.get('auth') as {daily:number};auth.daily=2000;
  expect((await app.fetch(req('/api/state',undefined,headers))).status).toBe(429);
  expect((await app.fetch(req('/api/stop',{stopped:true},headers))).status).toBe(200);
  expect((await new CloudStore(storage).read()).stopped).toBe(true);
  expect((await app.fetch(req('/api/stop',{stopped:false},headers))).status).toBe(429);
  expect((await app.fetch(req('/api/logout',{},headers))).status).toBe(200);
 });
 it('rolls back invalid state and stores chunks below provider value limits',async()=>{
  const storage=new MemoryStorage(),store=new CloudStore(storage);
  await expect(store.transaction(s=>{s.version=2 as 1;})).rejects.toThrow();expect((await store.read()).version).toBe(1);
  await store.transaction(s=>{s.stopped=true;});expect((await new CloudStore(storage).read()).stopped).toBe(true);
  expect([...storage.data.values()].every(v=>typeof v!=='string'||Buffer.byteLength(v)<=32000)).toBe(true);
 });
});
