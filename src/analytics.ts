import {detectAnalyticsFindings} from './analytics-findings.js';
import {z} from 'zod';
import {randomUUID,createHash} from 'node:crypto';
import {AnalyticsSnapshot,type AnalyticsSnapshotData} from './analytics-model.js';
import type {StateStore} from './state-store.js';
export const ANALYTICS_URL='https://unity-analytics.vercel.app/api/agent/summary';
const count=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),date=z.iso.datetime({offset:true});
const event=z.object({event_id:z.string().min(1).max(100),starts_at:date,status:z.enum(['cancelled','completed','open','closed','scheduled']),capacity:count.optional().default(null),bookings_active:count,attended:count,pv:count});
const envelope=z.object({schema_version:z.literal('1'),source:z.literal('unity-analytics:93279'),timezone:z.literal('Asia/Tokyo'),observed_at:date,source_updated_at:date.nullable(),period:z.object({start:date,end:date}),sync_status:z.enum(['complete','partial']),events:z.array(event).max(500)});
/** Fixed endpoint only; titles/IDs/PII and unrecognised fields are never persisted. */
export async function readAnalytics(url:string,token:string,transport:typeof fetch=fetch):Promise<AnalyticsSnapshotData>{
 if(url!==ANALYTICS_URL)throw new Error('analytics_destination_rejected');
 if(!token)throw new Error('analytics_not_configured');
 if(transport===fetch&&(process.env.HTTPS_PROXY||process.env.HTTP_PROXY)&&process.env.NODE_USE_ENV_PROXY!=='1'&&!process.execArgv.includes('--use-env-proxy'))throw new Error('analytics_proxy_configuration_required');
 let response:Response;
 try{response=await transport(url,{method:'GET',redirect:'manual',headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal:AbortSignal.timeout(12000)});}catch{throw new Error('analytics_connection_failed');}
 if(response.status<200||response.status>=300)throw new Error('analytics_http_'+response.status);
 const reader=response.body?.getReader();if(!reader)throw new Error('analytics_schema_invalid');
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>1000000){await reader.cancel();throw new Error('analytics_response_too_large');}chunks.push(r.value);}
 let data:z.infer<typeof envelope>;
 try{data=envelope.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{throw new Error('analytics_schema_invalid');}
 const observed=Date.parse(data.observed_at),start=Date.parse(data.period.start),end=Date.parse(data.period.end);
 if(new Set(data.events.map(e=>e.event_id)).size!==data.events.length||start>=end||end-start>366*86400000||observed>Date.now()+300000||(data.source_updated_at&&Date.parse(data.source_updated_at)>observed)||data.events.some(e=>Date.parse(e.starts_at)<start||Date.parse(e.starts_at)>=end))throw new Error('analytics_schema_invalid');
 const events=data.events.filter(e=>e.status!=='cancelled'),past=events.filter(e=>Date.parse(e.starts_at)<observed);
 const sum=(rows:typeof events,field:'bookings_active'|'attended'|'pv')=>{const known=rows.filter(e=>e[field]!==null);return {value:known.length?known.reduce((n,e)=>n+e[field]!,0):null,knownEvents:known.length,totalEvents:rows.length};};
 const scope=(rows:typeof events,field:'bookings_active'|'attended'|'pv')=>createHash('sha256').update(JSON.stringify(['unity-analytics:93279/schema1/'+field,rows.map(e=>[e.event_id,new Date(e.starts_at).toISOString(),e[field]!==null]).sort((a,b)=>{const x=JSON.stringify(a),y=JSON.stringify(b);return x<y?-1:x>y?1:0;})])).digest('hex');
 return AnalyticsSnapshot.parse({comparisonScopes:{bookings:scope(events,'bookings_active'),attendance:scope(past,'attended'),pageviews:scope(events,'pv')},observedAt:data.observed_at,sourceUpdatedAt:data.source_updated_at,period:data.period,syncStatus:data.sync_status,findings:detectAnalyticsFindings({observedAt:data.observed_at,sourceUpdatedAt:data.source_updated_at,syncStatus:data.sync_status,events:data.events}),events:events.length,pastEvents:past.length,upcomingEvents:events.length-past.length,bookings:sum(events,'bookings_active'),attendance:sum(past,'attended'),pageviews:sum(events,'pv'),revenue:null,repeatRate:null,satisfaction:null});
}
export async function syncAnalytics(store:StateStore,token:string,reader:()=>Promise<AnalyticsSnapshotData>=()=>readAnalytics(ANALYTICS_URL,token)){
 if(!token)return {status:'not_configured' as const};
 const lease=randomUUID(),now=new Date().toISOString();let stopCount=-1,retryAfterSeconds=0;
 const start=await store.transaction(s=>{
  if(s.stopped)return 'stopped';
  const waitMs=s.analytics?.error?5*60000:3600000;
  if(s.analytics?.lastAttemptAt){const remaining=waitMs-(Date.now()-Date.parse(s.analytics.lastAttemptAt));if(remaining>0){retryAfterSeconds=Math.ceil(remaining/1000);return 'cooldown';}}
  stopCount=s.safety.stopCount;
  s.analytics={previousSnapshot:s.analytics?.previousSnapshot??null,tasksProcessedAt:null,lastAttemptAt:now,lastSuccessAt:s.analytics?.lastSuccessAt??null,snapshot:s.analytics?.snapshot??null,error:null,lease};s.usage.externalApiCalls++;return 'started';
 });
 if(start!=='started')return {status:start,...start==='cooldown'?{retryAfterSeconds}:{}};
 let snapshot:AnalyticsSnapshotData|null=null,error:string|null=null;
 try{snapshot=AnalyticsSnapshot.parse(await reader());}catch(e){const message=e instanceof Error?e.message:'';error=/^analytics_(http_\d{3}|schema_invalid|response_too_large|connection_failed|proxy_configuration_required)$/.test(message)?message:'analytics_read_failed';}
 return store.transaction(s=>{
  if(s.analytics?.lease!==lease)return {status:'interrupted'};
  s.analytics.lease=null;
  if(s.stopped||s.safety.stopCount!==stopCount){s.analytics.error='analytics_interrupted';return {status:'interrupted'};}
  s.analytics.error=error;if(snapshot){s.analytics.previousSnapshot=s.analytics.snapshot?{...s.analytics.snapshot,findings:[]}:null;s.analytics.snapshot=snapshot;s.analytics.lastSuccessAt=new Date().toISOString();}
  return {status:error?'failed':'success',error};
 });
}
