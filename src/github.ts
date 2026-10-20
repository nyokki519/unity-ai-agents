import {z} from 'zod';import {randomUUID} from 'node:crypto';import {REPOSITORY,audit} from './model.js';import type {StateStore} from './state-store.js';import {GitHubSnapshot,type GitHubSnapshotData} from './github-model.js';
const iso=z.iso.datetime({offset:true});
const issueSchema=z.object({number:z.number().int().positive(),title:z.string().max(2000),updated_at:iso,comments:z.number().int().nonnegative(),assignees:z.array(z.unknown()).max(100),labels:z.array(z.unknown()).max(100),state:z.literal('open'),pull_request:z.unknown().optional()});
const runSchema=z.object({id:z.number().int().positive(),workflow_id:z.number().int().positive(),head_branch:z.string().max(300).nullable(),status:z.literal('completed'),conclusion:z.string().max(50).nullable(),created_at:iso});
const title=(text:string)=>text.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,'[非公開]').replace(/(?:sk-[a-zA-Z0-9_-]{16,}|gh[pousr]_[a-zA-Z0-9_]{20,}|github_pat_[a-zA-Z0-9_]{20,}|Bearer\s+\S+)/g,'[非公開]').replace(/[\r\n\0<>]/g,' ').slice(0,240);
export class GitHubReader{
 apiCalls=0;private remaining:number|null=null;
 constructor(private transport:typeof fetch=fetch,private clock=()=>new Date(),private token=process.env.UNITY_GITHUB_TOKEN??process.env.GITHUB_TOKEN??process.env.GH_TOKEN??''){}
 private async get(suffix:string){
  if(this.apiCalls>=3)throw new Error('github_request_budget');
  if(this.transport===fetch&&(process.env.HTTPS_PROXY||process.env.HTTP_PROXY)&&process.env.NODE_USE_ENV_PROXY!=='1'&&!process.execArgv.includes('--use-env-proxy'))throw new Error('github_proxy_configuration_required');
  this.apiCalls++;
  let response:Response;try{response=await this.transport(`https://api.github.com/repos/${REPOSITORY}${suffix}`,{method:'GET',redirect:'manual',headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...this.token?{Authorization:'Bearer '+this.token}:{}},signal:AbortSignal.timeout(5000)});}catch{throw new Error('github_connection_failed');}
  if(!response.ok||response.status<200||response.status>=300)throw new Error('github_http_'+response.status);
  const remaining=response.headers.get('x-ratelimit-remaining');if(remaining!==null&&/^\d+$/.test(remaining))this.remaining=Number(remaining);
  const reader=response.body?.getReader();if(!reader)throw new Error('github_schema_invalid');const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const result=await reader.read();if(result.done)break;size+=result.value.byteLength;if(size>1_000_000){await reader.cancel();throw new Error('github_response_too_large');}chunks.push(result.value);}}catch{throw new Error('github_response_invalid');}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;}catch{throw new Error('github_schema_invalid');}
 }
 async scan():Promise<GitHubSnapshotData>{
  this.apiCalls=0;
  try{
   const repo=z.object({full_name:z.literal(REPOSITORY),private:z.boolean()}).parse(await this.get(''));if(repo.private)throw new Error('github_repository_not_public');
   // Sequential: after any error stop immediately; never leave uncounted reads in flight.
   const rawIssues=z.array(issueSchema).max(100).parse(await this.get('/issues?state=open&per_page=100&sort=updated&direction=desc'));
   const rawRuns=z.object({workflow_runs:z.array(runSchema).max(100)}).parse(await this.get('/actions/runs?status=completed&per_page=100'));
   const issues=rawIssues.filter(x=>!x.pull_request).map(x=>({number:x.number,title:title(x.title),updatedAt:x.updated_at,comments:x.comments,assigned:x.assignees.length>0,labelCount:x.labels.length})),findings:GitHubSnapshotData['findings']=[];
   for(const issue of issues){const days=Math.max(0,Math.floor((this.clock().getTime()-Date.parse(issue.updatedAt))/86400000));if(days>=7)findings.push({key:'issue:'+issue.number,kind:'stalled_issue',priority:2,number:issue.number,summary:`Issue #${issue.number}: 最終更新から${days}日。担当・次の作業を確認。`});else if(!issue.assigned||!issue.labelCount)findings.push({key:'issue:'+issue.number,kind:'untriaged_issue',priority:3,number:issue.number,summary:`Issue #${issue.number}: 担当または分類が未設定。対応状況を確認。`});}
   const seen=new Set<string>();for(const run of [...rawRuns.workflow_runs].sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at))){const key=JSON.stringify([run.workflow_id,run.head_branch]);if(seen.has(key))continue;seen.add(key);if(['failure','timed_out','action_required','startup_failure'].includes(run.conclusion??''))findings.push({key:'ci:'+run.id,kind:'ci_failure',priority:1,number:run.id,summary:`CI run #${run.id}: ${run.conclusion}。実行ログを読み取り確認。`});}
   findings.sort((a,b)=>a.priority-b.priority||a.key.localeCompare(b.key));
   return GitHubSnapshot.parse({repository:REPOSITORY,observedAt:this.clock().toISOString(),issues,findings,workflowRunsRead:rawRuns.workflow_runs.length,truncated:rawIssues.length===100||rawRuns.workflow_runs.length===100,rateLimitRemaining:this.remaining});
  }catch(e){if(e instanceof z.ZodError)throw new Error('github_schema_invalid');throw e;}
 }
}
export async function syncGitHub(store:StateStore,client=new GitHubReader(),clock=()=>new Date()){
 const claim=await store.transaction(state=>{const now=clock();if(state.stopped)return {status:'stopped' as const};if(state.github?.leaseUntil&&Date.parse(state.github.leaseUntil)>now.getTime())return {status:'busy' as const};if(state.github&&now.getTime()-Date.parse(state.github.lastAttemptAt)<300000)return {status:'cooldown' as const};if(state.audit.length>998)throw new Error('audit_capacity_exceeded');const lease=randomUUID();state.github={lastAttemptAt:now.toISOString(),lastSuccessAt:state.github?.lastSuccessAt??null,error:null,lease,leaseUntil:new Date(now.getTime()+30000).toISOString(),snapshot:state.github?.snapshot??null};audit(state,'github_scan_started',now.toISOString());return {status:'claimed' as const,lease};});
 if(claim.status!=='claimed')return claim;
 let snapshot:GitHubSnapshotData|undefined,error:string|null=null;
 try{snapshot=await client.scan();}catch(e){const code=e instanceof Error?e.message:'';error=/^github_(?:http_\d{3}|repository_not_public|schema_invalid|connection_failed|proxy_configuration_required|response_invalid|request_budget)$/.test(code)?code:'github_scan_failed';}
 return store.transaction(state=>{state.usage.externalApiCalls+=client.apiCalls;const current=state.github;if(!current||current.lease!==claim.lease)return {status:'interrupted',apiCalls:client.apiCalls};current.lease=null;current.leaseUntil=null;if(state.stopped)error='github_scan_interrupted';current.error=error;if(snapshot&&!error){current.snapshot=snapshot;current.lastSuccessAt=clock().toISOString();}if(state.audit.length<1000)audit(state,'github_scan_finished',clock().toISOString(),undefined,error??'success');return {status:error?'failed':'success',error,apiCalls:client.apiCalls,issueCount:snapshot?.issues.length??null,findingCount:snapshot?.findings.length??null};});
}
