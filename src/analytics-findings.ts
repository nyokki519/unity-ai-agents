import {createHash} from 'node:crypto';
import type {AnalyticsFindingData} from './analytics-model.js';
type Event={event_id:string;starts_at:string;status:string;capacity:number|null;bookings_active:number|null;attended:number|null};
type Input={observedAt:string;sourceUpdatedAt:string|null;syncStatus:'complete'|'partial';events:Event[]};
const HOUR=3600000,DAY=24*HOUR;
const key=(kind:string,scope:string)=>createHash('sha256').update('unity-analytics:93279:'+kind+':'+scope).digest('hex');
export function detectAnalyticsFindings(input:Input,now=Date.now()):AnalyticsFindingData[]{
 const findings:AnalyticsFindingData[]=[],observed=Date.parse(input.observedAt),updated=input.sourceUpdatedAt?Date.parse(input.sourceUpdatedAt):NaN;
 const fresh=input.syncStatus==='complete'&&Number.isFinite(observed)&&Number.isFinite(updated)&&now-observed<=36*HOUR&&now-updated<=36*HOUR;
 if(!fresh){const reasons=[input.syncStatus!=='complete'?'部分同期':null,!Number.isFinite(updated)?'元データ更新日時不明':now-updated>36*HOUR?'元データが36時間超前':null,now-observed>36*HOUR?'取得時刻が36時間超前':null].filter(Boolean);
  findings.push({key:key('source_quality','all'),kind:'source_quality',priority:2,title:'Analyticsデータの完全性・鮮度を確認',startsAt:null,evidence:reasons.join(' / '),check:'元データの同期状態と更新日時を確認してください。欠損や古い値から集客不振を断定しません。'});
 }
 const events=input.events.filter(e=>e.status!=='cancelled').sort((a,b)=>{
  const aFuture=Date.parse(a.starts_at)>now,bFuture=Date.parse(b.starts_at)>now;
  return aFuture!==bFuture?aFuture?-1:1:aFuture?Date.parse(a.starts_at)-Date.parse(b.starts_at):Date.parse(b.starts_at)-Date.parse(a.starts_at);
 });
 for(const e of events){const starts=Date.parse(e.starts_at),scope=e.event_id+':'+e.starts_at;
  if(fresh&&e.status==='open'&&starts>now&&starts-now<=7*DAY&&e.capacity!==null&&e.capacity>0&&e.bookings_active!==null&&e.bookings_active/e.capacity<0.5){
   findings.push({key:key('booking_gap',scope),kind:'booking_gap',priority:starts-now<=3*DAY?1:2,title:'開催間近の予約状況を確認',startsAt:e.starts_at,evidence:`開催まで${Math.ceil((starts-now)/DAY)}日、予約 ${e.bookings_active} / ${e.capacity}、予約率${Math.round(e.bookings_active/e.capacity*1000)/10}%（確認基準50%未満）。`,check:'告知状況・定員設定・募集の進み具合を確認し、集客対策が必要か判断してください。原因や施策の効果は未検証です。'});
  }
  if(now-starts>=2*DAY&&e.attended===null){
   findings.push({key:key('attendance_gap',scope),kind:'attendance_gap',priority:3,title:'開催有無・実参加データを確認',startsAt:e.starts_at,evidence:'予定日時から2日以上経過していますが、実参加数は取得できていません。0人と扱っていません。',check:'開催有無と実績入力・同期状態を確認してください。未開催・未入力・取得不足のいずれかは断定できません。'});
  }
 }
 return findings.sort((a,b)=>a.priority-b.priority).slice(0,20);
}
