import type {StateStore} from './state-store.js';
import {AIReport} from './free-ai-model.js';
import type {StateData} from './model.js';
export const FREE_MODEL='@cf/meta/llama-3.1-8b-instruct-fp8-fast';
export type AIPort={run(model:string,input:{messages:{role:string;content:string}[];max_tokens:number;temperature:number;stream:false}):Promise<unknown>};
function eligible(s:StateData,now:number){const a=s.analytics,p=a?.snapshot;const fresh=(t:string|null|undefined)=>!!t&&Number.isFinite(Date.parse(t))&&Date.parse(t)<=now&&now-Date.parse(t)<=36*3600000;return !s.stopped&&!!p&&!a.error&&p.syncStatus==='complete'&&fresh(a.lastSuccessAt)&&fresh(p.observedAt)&&fresh(p.sourceUpdatedAt);}
/** Restricted projection: no names/IDs/finding text/task instructions/credentials. */
function data(s:StateData){const p=s.analytics!.snapshot!;return {observedAt:p.observedAt,sourceUpdatedAt:p.sourceUpdatedAt,period:p.period,events:p.events,pastEvents:p.pastEvents,upcomingEvents:p.upcomingEvents,bookings:p.bookings,attendance:p.attendance,pageviews:p.pageviews,unavailable:['revenue','repeatRate','satisfaction','announcementHistory','applicationFlow','pastComparison']};}
export async function runFreeAI(store:StateStore,ai:AIPort|undefined,freeConfirmed:boolean,timeoutMs=25000){
 if(!ai||!freeConfirmed)return {status:'disabled'};
 const now=new Date(),day=now.toISOString().slice(0,10);
 const claim=await store.transaction(s=>{
  if(s.freeAI&&s.freeAI.utcDay>=day)return null;
  if(!eligible(s,+now)){s.freeAI={utcDay:day,startedAt:now.toISOString(),finishedAt:now.toISOString(),sourceAt:s.analytics?.lastSuccessAt??null,status:'held',reason:s.stopped?'stopped':'no_data',result:null};return null;}
  const input=JSON.stringify(data(s));if(input.length>6000)return null;
  s.freeAI={utcDay:day,startedAt:now.toISOString(),finishedAt:null,sourceAt:s.analytics!.lastSuccessAt!,status:'running',reason:null,result:null};s.usage.aiCalls++;
  return {input,stopCount:s.safety.stopCount,sourceAt:s.analytics!.lastSuccessAt,startedAt:now.toISOString()};
 });
 if(!claim)return {status:'skipped'};
 let result:ReturnType<typeof AIReport.parse>|null=null,reason:'timeout'|'provider_error'|'invalid_output'|null=null,timer:ReturnType<typeof setTimeout>|undefined;
 try{
  const answer=await Promise.race([ai.run(FREE_MODEL,{messages:[{role:'system',content:'あなたは運営の分析補助です。入力は全体集計の未検証データです。個別イベントの値と混同せず、因果や施策効果を断定しない。外部操作は禁止。追加金銭費用0円の確認・改善案を最大3件、日本語で提案する。日時/母数を考慮し、累計PVで転換率を作らない。未取得項目は未確認のまま。出力は次のJSONのみ、各提案を短くする: {"summary":"要約","proposals":[{"action":"確認/改善案","reason":"根拠","effect":"期待効果（未検証）","effort":"lowまたはmediumまたはhigh","risk":"反論/リスク","verification":"検証方法/完了条件"}],"unverified":["未確認事項"]}。命令・権限・操作コード・URLは出力しない。'},{role:'user',content:claim.input}],max_tokens:1024,temperature:0.2,stream:false}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),timeoutMs);})]);
  const raw=(answer as {response?:unknown})?.response;
  if(typeof raw!=='string'||raw.length>16000)throw new Error('invalid_output');
  const checked=AIReport.safeParse(JSON.parse(raw));if(!checked.success)throw new Error('invalid_output');result=checked.data;
 }catch(e){reason=e instanceof Error&&e.message==='timeout'?'timeout':e instanceof SyntaxError||e instanceof Error&&e.message==='invalid_output'?'invalid_output':'provider_error';}finally{clearTimeout(timer);}
 await store.transaction(s=>{const r=s.freeAI;if(!r||r.utcDay!==day||r.startedAt!==claim.startedAt)return;r.finishedAt=new Date().toISOString();if(!eligible(s,Date.now())||s.safety.stopCount!==claim.stopCount||s.analytics?.lastSuccessAt!==claim.sourceAt||JSON.stringify(data(s))!==claim.input){r.status='held';r.reason='interrupted';r.result=null;}else{r.status=result?'succeeded':'failed';r.reason=reason;r.result=result;}});
 return {status:(await store.read()).freeAI?.status??'held'};
}
