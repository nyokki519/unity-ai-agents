import {mkdir,open,lstat,rename,unlink,readFile,realpath} from 'node:fs/promises';import {join,resolve} from 'node:path';import {constants} from 'node:fs';import {randomUUID} from 'node:crypto';
import {State,emptyState,type StateData} from './model.js';
export class FileStore{
 readonly directory:string;constructor(directory=resolve('.runtime')){this.directory=resolve(directory);}
 private async prepare(){await mkdir(this.directory,{recursive:true,mode:0o700});if((await lstat(this.directory)).isSymbolicLink()||await realpath(this.directory)!==this.directory)throw new Error('state_path_unsafe');}
 private async load():Promise<StateData>{const path=join(this.directory,'state.json');try{const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{if((await handle.stat()).size>2_000_000)throw new Error('state_capacity_exceeded');return State.parse(JSON.parse(await handle.readFile('utf8')));}finally{await handle.close();}}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return emptyState();throw new Error('state_invalid_or_unreadable');}}
 async read(){await this.prepare();return this.load();}
 async transaction<T>(mutate:(state:StateData)=>T|Promise<T>):Promise<T>{
  await this.prepare();const lockPath=join(this.directory,'.lock');let lock;
  for(let i=0;i<100;i++){try{lock=await open(lockPath,'wx',0o600);break;}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw new Error('state_lock_failed');await new Promise(r=>setTimeout(r,20));}}
  if(!lock)throw new Error('state_locked');
  let temp:string|undefined;
  try{await lock.writeFile(JSON.stringify({pid:process.pid}));const state=await this.load();const result=await mutate(state);state.revision++;State.parse(state);const bytes=JSON.stringify(state);if(Buffer.byteLength(bytes)>2_000_000)throw new Error('state_capacity_exceeded');temp=join(this.directory,`.state-${randomUUID()}.tmp`);const handle=await open(temp,'wx',0o600);try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}await rename(temp,join(this.directory,'state.json'));temp=undefined;const dir=await open(this.directory,'r');try{await dir.sync();}finally{await dir.close();}return structuredClone(result);}finally{if(temp)await unlink(temp).catch(()=>{});await lock.close();await unlink(lockPath);}
 }
}
