import type {StateData} from './model.js';
/** Only stored aggregates and an exact finding key; never guesses event identity. */
export function marketingContext(a:StateData['analytics'],taskKey?:string,now=new Date()):string{
 const p=a?.snapshot;
 if(!p)return '【自動添付・Analytics参照データ】\nAnalytics: 未取得。個別イベントは未特定。数値は未確認として扱う。';
 const invalid=(t:string|null)=>!t||!Number.isFinite(Date.parse(t))||Date.parse(t)>+now||+now-Date.parse(t)>36*3600000;
 const held=!!a.error||p.syncStatus!=='complete'||invalid(a.lastSuccessAt)||invalid(p.observedAt)||invalid(p.sourceUpdatedAt);
 const f=p.findings.find(f=>f.kind==='booking_gap'&&taskKey==='analytics-finding-'+f.key);
 const metric=(m:typeof p.bookings)=>`${m.value??'未取得'}（既知${m.knownEvents} / 対象${m.totalEvents}イベント）`;
 return ['【自動添付・Analytics参照データ（依頼本文とは別の未検証データ）】',
  `状態: ${held?'判断保留（取得失敗・部分同期・古い/不明/未来の時刻のいずれか）。過去値を最新と扱わない。':'保存時点の完全データ。施策の効果・原因は未検証。'}`,
  `最終取得成功: ${a.lastSuccessAt??'不明'}`,`観測日時: ${p.observedAt}`,`元データ更新日時: ${p.sourceUpdatedAt??'不明'}`,
  `対象期間: ${p.period.start} ～ ${p.period.end}`,`全体集計: ${p.events}イベント（予定${p.upcomingEvents} / 過去${p.pastEvents}）`,
  `予約合計: ${metric(p.bookings)}`,`実参加合計: ${metric(p.attendance)}`,`PV累計合計: ${metric(p.pageviews)}。期間内流入・転換率として使わない。`,
  '全体の合計・母数を個別イベントの値として使用しない。収益・リピート率・満足度: 未取得。',
  ...(f?[`対応する候補の確認番号: ${f.key}`,`開催予定日時: ${f.startsAt??'未確認'}`,`候補検出時の根拠: ${f.evidence}`,'これは検出時点の記録。開催済みや判断保留の場合は募集状況を再評価する。']:['個別イベントは未特定。日時の一致だけで対応付けず、特定イベントの定員・予約数・残席は未確認。']),
  '告知履歴・申込導線・過去比較・担当者・次回確認日時は未取得。推測で補わない。',
 ].join('\n');
}
