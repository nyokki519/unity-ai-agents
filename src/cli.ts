import {syncGitHub} from './github.js';
import {readFile,appendFile} from 'node:fs/promises';import {randomUUID} from 'node:crypto';import {FileStore} from './store.js';import {Engine} from './engine.js';import {view} from './view.js';import {createApp} from './server.js';
const store=new FileStore(),engine=new Engine(store),[command,...args]=process.argv.slice(2);
try{switch(command){
 case 'init':await store.transaction(()=>{});console.log('Local state initialized. External services: disconnected.');break;
 case 'task':{const instruction=args.join(' ');const task=await engine.create({instruction,idempotencyKey:randomUUID()});console.log(JSON.stringify({id:task.id,status:task.status,steps:task.steps.map(s=>({agent:s.agent,action:s.action}))},null,2));break;}
 case 'github-scan':{const result=await syncGitHub(store);console.log(JSON.stringify(result));if(args.includes('--summary')&&process.env.GITHUB_STEP_SUMMARY){const s=await store.read();const snapshot=s.github?.snapshot;const text=`# Unity AI Agents GitHub read-only check\n\nStatus: ${result.status}\n\nRepository: nyokki519/unity-ai-agents\n\nOpen issues in bounded sample: ${snapshot?.issues.length??'unknown'}\n\nFindings: ${snapshot?.findings.length??'unknown'}\n\nOnly GET requests; no Issue/PR/data writes; no AI inference.\n`;await appendFile(process.env.GITHUB_STEP_SUMMARY,text);}if(result.status==='failed')process.exitCode=1;break;}
 case 'run':console.log(JSON.stringify(await engine.runNext()));break;
 case 'status':{const state=await store.read();const v=view(state);console.log(JSON.stringify({metrics:v.metrics,stopped:v.stopped,usage:v.usage,tasks:v.tasks.map(t=>({id:t.id,status:t.status,handoff:t.handoff}))},null,2));break;}
 case 'stop':console.log(JSON.stringify(await engine.stop(true)));break;
 case 'resume-system':console.log(JSON.stringify(await engine.stop(false)));break;
 case 'handoff':{const [id,file]=args;if(!id||!file)throw new Error('usage');const bytes=await readFile(file);if(bytes.length>64_000)throw new Error('handoff_too_large');await engine.handoff(id,JSON.parse(bytes.toString('utf8')));console.log('Manual result received; not independently verified.');break;}
 case 'serve':{const port=Number(process.env.UNITY_PORT??8787);if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('port_invalid');createApp({store}).listen(port,'127.0.0.1',()=>console.log(`Unity AI Agents local UI: http://127.0.0.1:${port} (loopback only)`));break;}
 default:console.log('Usage: npm run cli -- init|task <instruction>|run|github-scan|status|stop|resume-system|handoff <id> <json-file>');
 }}catch{console.error('Command failed safely. Check validated inputs, local state and setup instructions.');process.exitCode=1;}
