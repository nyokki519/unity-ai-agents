import type {StateData} from './model.js';
export type Attention={code:string;message:string;target:'設定'|'連携状況'|'タスク'|'承認待ち'};
/** Read-only, fixed-text guidance. Never converts remote content into operations. */
export function attention(s:StateData,now=new Date()):Attention[]{
 const items:Attention[]=[];
 const add=(code:string,message:string,target:Attention['target'])=>items.push({code,message,target});
 if(s.stopped)add('stopped','緊急停止中です。停止理由を確認してから解除してください。','設定');
 const a=s.analytics;
 if(a?.error)add('analytics_error','Analyticsの取得に失敗しています。前回の値を最新として判断せず、連携状況を確認してください。','連携状況');
 else if(!a?.snapshot)add('analytics_missing','Analyticsは未取得です。連携設定と初回の取得を確認してください。','連携状況');
 else {
  const stale=(t:string|null)=>!t||!Number.isFinite(Date.parse(t))||Date.parse(t)>+now||+now-Date.parse(t)>36*3600000;
  if(a.snapshot.syncStatus!=='complete'||stale(a.lastSuccessAt)||stale(a.snapshot.observedAt)||stale(a.snapshot.sourceUpdatedAt))add('analytics_quality','Analyticsに不完全・古い・時刻不明のデータがあります。取得日時と元データ更新日時を確認し、判断を保留する指標を整理してください。','連携状況');
 }
 if(s.github?.error)add('github_error','GitHubの取得に失敗しています。連携状況の診断を確認してください。','連携状況');
 for(const [status,code,text,target] of [
  ['awaiting_approval','approval','重要操作の承認待ち','承認待ち'],
  ['failed','failed','失敗したタスク。診断と実行履歴を確認','タスク'],
  ['awaiting_inference','inference','ChatGPT / Codexへの引継ぎ待ち。引継ぎプロンプトを確認','タスク'],
  ['blocked','blocked','保留タスク。依存関係と診断を確認','タスク'],
  ['paused','paused','中断タスク。再開が必要か確認','タスク'],
 ] as const){const count=s.tasks.filter(t=>t.status===status).length;if(count)add(code,`${count}件: ${text}。`,target);}
 return items;
}
