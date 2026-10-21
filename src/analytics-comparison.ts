import type {StateData} from './model.js';
export function compareAnalytics(a:StateData['analytics'],now=new Date()){
 const p=a?.previousSnapshot,c=a?.snapshot;
 const fresh=(t:string|null|undefined,at:number)=>!!t&&Number.isFinite(Date.parse(t))&&Date.parse(t)<=at&&at-Date.parse(t)<=36*3600000;
 const reason=!c||!p?'no_baseline':a?.error||c.syncStatus!=='complete'||p.syncStatus!=='complete'||!fresh(a?.lastSuccessAt,+now)||!fresh(c.observedAt,+now)||!fresh(c.sourceUpdatedAt,+now)||!fresh(p.sourceUpdatedAt,Date.parse(p.observedAt))||+now-Date.parse(p.observedAt)>7*86400000?'source_not_trustworthy':Date.parse(p.observedAt)>=Date.parse(c.observedAt)?'time_order':null;
 return {previousObservedAt:p?.observedAt??null,currentObservedAt:c?.observedAt??null,note:'同じ対象・既知イベント群の時点値の差です。施策の因果や期間流入・転換率を示しません。',metrics:(['bookings','attendance','pageviews'] as const).map(name=>{
  const before=p?.[name],after=c?.[name];
  const why=reason??(!p?.comparisonScopes||!c?.comparisonScopes?'unverified_scope':p.comparisonScopes[name]!==c.comparisonScopes[name]?'scope_changed':before?.value==null||after?.value==null?'no_values':'ready');
  return {name,comparable:why==='ready',reason:why,previous:why==='ready'?before!.value:null,current:after?.value??null,delta:why==='ready'?after!.value!-before!.value!:null};
 })};
}
