import {CloudConsole,type CloudEnv,type StoragePort} from './cloud.js';
interface Context {storage:StoragePort;blockConcurrencyWhile<T>(fn:()=>Promise<T>):Promise<T>}
interface Env extends CloudEnv {
 CONSOLE:{idFromName(name:string):unknown;get(id:unknown):{fetch(req:Request):Promise<Response>}};
 ASSETS:{fetch(req:Request):Promise<Response>};
}
/** One object per installation; no user-controlled namespace/object selection. */
export class UnityConsole {
 private console:CloudConsole;
 constructor(private ctx:Context,env:CloudEnv){this.console=new CloudConsole(ctx.storage,env);}
 fetch(request:Request){return this.ctx.blockConcurrencyWhile(()=>this.console.fetch(request));}
}
export default {
 async fetch(request:Request,env:Env):Promise<Response>{
  const url=new URL(request.url);
  if(request.method==='GET'&&['/','/app.js','/style.css'].includes(url.pathname)){
   const result=await env.ASSETS.fetch(request),response=new Response(result.body,result);
   response.headers.set('Cache-Control','no-store');response.headers.set('X-Content-Type-Options','nosniff');response.headers.set('Referrer-Policy','no-referrer');response.headers.set('Strict-Transport-Security','max-age=31536000');
   response.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");return response;
  }
  if(!url.pathname.startsWith('/api/'))return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
  return env.CONSOLE.get(env.CONSOLE.idFromName('unity-console-v1')).fetch(request);
 }
};
