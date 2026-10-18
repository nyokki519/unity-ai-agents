import {assertNoCredentials} from './input-safety.js';
import {randomUUID,randomBytes,timingSafeEqual} from 'node:crypto';
import {CreateTask,REPOSITORY,Result,audit,type StateData,type TaskData,type ResultData} from './model.js';
import {digest,plan,handoffPrompt,operationHash} from './planner.js';import type {StateStore} from './state-store.js';
export const MAX_ATTEMPTS=3; // initial execution + at most two retries
const TRANSIENT=new Set(['temporarily_unavailable','timeout']);
const output=(summary:string,unverified:string[]=[]):ResultData=>({summary,evidence:['この工程はローカル保存状態のみを参照。外部API・AI推論の実行なし。'],objections:[],unverified});
export type Handler=(context:{task:TaskData;state:StateData;action:string},signal:AbortSignal)=>Promise<ResultData>;
const defaultHandler:Handler=async({state,action})=>{
 if(action==='local.report')return output(`ローカルタスク${state.tasks.length}件、完了${state.tasks.filter(t=>t.status==='succeeded').length}件、保留${state.tasks.filter(t=>['awaiting_inference','awaiting_approval','blocked'].includes(t.status)).length}件。実行記録${state.runs.length}件。`,['GitHub・Unityサービスの実データは未接続。']);
 if(action==='local.audit')return output('ルール監査完了。登録されたローカル処理のみを実行。有料推論0回・外部書き込み0回。',['人が受け渡した分析の事実・提案効果は未検証。']);
 throw new Error('executor_unavailable');
};
export class Engine{
 constructor(readonly store:StateStore,private handler:Handler=defaultHandler,private clock=()=>new Date(),private timeoutMs=1000){if(timeoutMs<10||timeoutMs>10_000)throw new Error('timeout_invalid');}
 async create(value:unknown){assertNoCredentials(value);const input=CreateTask.parse(value);if(input.repository!==REPOSITORY)throw new Error('repository_not_allowed');return this.store.transaction(state=>{
  const fingerprint=digest(JSON.stringify({instruction:input.instruction,repository:input.repository,priority:input.priority,dependencies:input.dependencies}));
  const prior=state.requests.find(r=>r.key===input.idempotencyKey);if(prior){if(prior.fingerprint!==fingerprint)throw new Error('idempotency_conflict');const task=state.tasks.find(t=>t.id===prior.taskId);if(!task)throw new Error('state_invalid_or_unreadable');return task;}
  if(state.requests.length>=2000)throw new Error('request_capacity_exceeded');
  const active=state.tasks.find(t=>t.fingerprint===fingerprint&&!['succeeded','failed'].includes(t.status));if(active){state.requests.push({key:input.idempotencyKey,fingerprint,taskId:active.id});return active;}
  if(input.dependencies.some(id=>!state.tasks.some(t=>t.id===id)))throw new Error('dependency_missing');if(state.tasks.length>=500)throw new Error('task_capacity_exceeded');
  const steps=plan(input.instruction),now=this.clock().toISOString();const task:TaskData={...input,repository:REPOSITORY,id:randomUUID(),fingerprint,steps,status:steps[0]!.action.startsWith('protected.')?'awaiting_approval':'queued',createdAt:now,updatedAt:now,attempts:0,retryAt:null,lease:null,leaseUntil:null,handoff:null,error:null};state.tasks.push(task);state.requests.push({key:input.idempotencyKey,fingerprint,taskId:task.id});audit(state,'task_created',now,task.id);return task;
 });}
 async runNext(){
  const claim=await this.store.transaction(state=>{const now=this.clock();
   if(state.stopped)return {status:'stopped' as const};
   for(const task of state.tasks)if(task.status==='running'&&task.leaseUntil&&Date.parse(task.leaseUntil)<=now.getTime()){const run=state.runs.find(r=>r.id===task.lease);if(run){run.status='interrupted';run.finishedAt=now.toISOString();run.error='lease_expired';}task.status=task.attempts<MAX_ATTEMPTS?'queued':'failed';task.lease=null;task.leaseUntil=null;task.error='lease_expired';audit(state,'lease_recovered',now.toISOString(),task.id);}
   if(state.tasks.some(t=>t.status==='running'))return {status:'busy' as const};
   const task=state.tasks.filter(t=>t.status==='queued'&&t.attempts<MAX_ATTEMPTS&&(!t.retryAt||Date.parse(t.retryAt)<=now.getTime())&&t.dependencies.every(id=>state.tasks.some(d=>d.id===id&&d.status==='succeeded'))).sort((a,b)=>a.priority-b.priority||a.createdAt.localeCompare(b.createdAt))[0];
   if(!task)return {status:'idle' as const};const step=task.steps.find(s=>s.status==='pending');if(!step)throw new Error('plan_invalid');
   if(step.action.startsWith('protected.')){task.status='awaiting_approval';return {status:'held' as const};}
   const lease=randomUUID();task.status='running';task.attempts++;task.lease=lease;task.leaseUntil=new Date(now.getTime()+this.timeoutMs+5000).toISOString();task.updatedAt=now.toISOString();
   if(state.runs.length>=1000)throw new Error('history_capacity_exceeded');state.runs.push({id:lease,taskId:task.id,stepId:step.id,attempt:task.attempts,status:'running',startedAt:now.toISOString(),finishedAt:null,durationMs:0,error:null});audit(state,'run_started',now.toISOString(),task.id);return {status:'claimed' as const,task:structuredClone(task),state:structuredClone(state),stepId:step.id,action:step.action,lease};
  });
  if(claim.status!=='claimed')return claim;
  let value:ResultData|undefined,error:string|undefined;const started=Date.now();
  if(claim.action!=='handoff.reasoning'){
   const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
   try{value=Result.parse(await Promise.race([this.handler({task:claim.task,state:claim.state,action:claim.action},controller.signal),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('timeout'));},this.timeoutMs);})]));}
   catch(e){const message=e instanceof Error?e.message:'';error=TRANSIENT.has(message)?message:'executor_failed';}finally{if(timer)clearTimeout(timer);}
  }
  return this.store.transaction(state=>{const task=state.tasks.find(t=>t.id===claim.task.id),run=state.runs.find(r=>r.id===claim.lease),now=this.clock().toISOString();
   if(!task||task.lease!==claim.lease||task.status!=='running'||state.stopped)return {status:'interrupted'};
   if(!run)throw new Error('run_missing');run.finishedAt=now;run.durationMs=Math.max(0,Date.now()-started);task.lease=null;task.leaseUntil=null;task.updatedAt=now;
   if(claim.action==='handoff.reasoning'){task.status='awaiting_inference';task.handoff=handoffPrompt(task);run.status='held';run.error='inference_not_connected';}
   else if(error){run.status='failed';run.error=error;task.error=error;task.status=TRANSIENT.has(error)&&task.attempts<MAX_ATTEMPTS?'queued':'failed';task.retryAt=task.status==='queued'?new Date(this.clock().getTime()+task.attempts*1000).toISOString():null;}
   else{const step=task.steps.find(s=>s.id===claim.stepId)!;step.status='done';step.result=value!;task.attempts=0;task.retryAt=null;task.error=null;task.status=task.steps.every(s=>s.status==='done')?'succeeded':'queued';run.status='succeeded';}
   audit(state,'run_finished',now,task.id,run.error??run.status);return {status:task.status,taskId:task.id};
  });
 }
 async handoff(id:string,value:unknown){assertNoCredentials(value);const result=Result.parse(value);return this.store.transaction(state=>{const task=state.tasks.find(t=>t.id===id);if(!task||task.status!=='awaiting_inference')throw new Error('handoff_not_expected');const step=task.steps.find(s=>s.status==='pending');if(!step||step.action!=='handoff.reasoning')throw new Error('plan_invalid');step.result=result;step.status='done';task.handoff=null;task.status='queued';task.attempts=0;task.updatedAt=this.clock().toISOString();audit(state,'handoff_received',task.updatedAt,id);return task;});}
 async stop(stopped:boolean){return this.store.transaction(state=>{state.stopped=stopped;const now=this.clock().toISOString();if(stopped){state.safety.lastStopAt=now;state.safety.stopCount++;}if(stopped)for(const task of state.tasks)if(task.status==='running')this.interrupt(state,task,now);if(state.audit.length<1000)audit(state,stopped?'system_stopped':'system_resumed',now);else if(!stopped)throw new Error('audit_capacity_exceeded');return {stopped};});}
 private interrupt(state:StateData,task:TaskData,now:string){const run=state.runs.find(r=>r.id===task.lease);if(run){run.status='interrupted';run.finishedAt=now;run.error='stopped';}task.status='paused';task.lease=null;task.leaseUntil=null;task.updatedAt=now;}
 async pause(id:string){return this.store.transaction(state=>{const task=state.tasks.find(t=>t.id===id);if(!task||!['queued','running'].includes(task.status))throw new Error('task_not_pauseable');this.interrupt(state,task,this.clock().toISOString());audit(state,'task_paused',task.updatedAt,id);return task;});}
 async resume(id:string){return this.store.transaction(state=>{const task=state.tasks.find(t=>t.id===id);if(!task||task.status!=='paused'||task.attempts>=MAX_ATTEMPTS)throw new Error('task_not_resumable');task.status='queued';task.updatedAt=this.clock().toISOString();audit(state,'task_resumed',task.updatedAt,id);return task;});}
 async approve(id:string,expectedHash:string){const token=randomBytes(32).toString('base64url');const approval=await this.store.transaction(state=>{const task=state.tasks.find(t=>t.id===id);if(!task||task.status!=='awaiting_approval'||operationHash(task)!==expectedHash)throw new Error('approval_target_changed');const now=this.clock();const value={id:randomUUID(),taskId:id,operationHash:expectedHash,tokenHash:digest(token),expiresAt:new Date(now.getTime()+15*60_000).toISOString(),status:'approved' as const,createdAt:now.toISOString()};state.approvals=state.approvals.filter(a=>a.taskId!==id);state.approvals.push(value);audit(state,'approval_issued',now.toISOString(),id);return value;});return {id:approval.id,token,expiresAt:approval.expiresAt,executable:false};}
 async consumeApproval(id:string,token:string){if(token.length>200)throw new Error('approval_invalid');return this.store.transaction(state=>{const task=state.tasks.find(t=>t.id===id),a=state.approvals.find(x=>x.taskId===id),hash=digest(token);if(!task||!a||a.status!=='approved'||a.operationHash!==operationHash(task)||Date.parse(a.expiresAt)<=this.clock().getTime()||!timingSafeEqual(Buffer.from(a.tokenHash),Buffer.from(hash)))throw new Error('approval_invalid');a.status='consumed';audit(state,'approval_consumed',this.clock().toISOString(),id);return {approved:true,executable:false};});}
}
