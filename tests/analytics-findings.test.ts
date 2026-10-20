import {it,expect} from 'vitest';
import {detectAnalyticsFindings} from '../src/analytics-findings.js';
const now=Date.parse('2026-10-20T00:00:00Z');
const event={event_id:'private-event-id',starts_at:'2026-10-22T00:00:00Z',status:'open',capacity:20,bookings_active:4,attended:null};
const input={observedAt:new Date(now).toISOString(),sourceUpdatedAt:new Date(now-3600000).toISOString(),syncStatus:'complete' as const,events:[event]};
it('flags near-term low bookings with measured evidence and a stable non-identifying key',()=>{
 const findings=detectAnalyticsFindings(input,now);expect(findings).toHaveLength(1);expect(findings[0]!.kind).toBe('booking_gap');expect(findings[0]!.evidence).toContain('4 / 20');expect(findings[0]!.evidence).toContain('20%');expect(JSON.stringify(findings)).not.toContain(event.event_id);expect(detectAnalyticsFindings({...input,events:[{...event,bookings_active:5}]},now)[0]!.key).toBe(findings[0]!.key);
});
it('does not call stale/partial data a booking problem or invent missing/closed/cancelled capacity',()=>{
 for(const change of [{syncStatus:'partial' as const},{sourceUpdatedAt:null},{sourceUpdatedAt:new Date(now-40*3600000).toISOString()}]){const f=detectAnalyticsFindings({...input,...change},now);expect(f.some(x=>x.kind==='booking_gap')).toBe(false);expect(f.some(x=>x.kind==='source_quality')).toBe(true);}
 for(const change of [{capacity:null},{capacity:0},{bookings_active:null},{status:'closed'},{status:'cancelled'},{starts_at:'2026-11-02T00:00:00Z'},{bookings_active:10}])expect(detectAnalyticsFindings({...input,events:[{...event,...change}]},now)).toHaveLength(0);
});
it('treats zero attendance as measured, waits two days, caps findings and never says an event happened',()=>{
 const past={...event,starts_at:'2026-10-17T00:00:00Z'};
 const f=detectAnalyticsFindings({...input,events:[past]},now);expect(f[0]!.kind).toBe('attendance_gap');expect(f[0]!.check).toContain('開催有無');
 expect(detectAnalyticsFindings({...input,events:[{...past,attended:0}]},now)).toHaveLength(0);
 expect(detectAnalyticsFindings({...input,events:[{...past,starts_at:'2026-10-19T00:00:00Z'}]},now)).toHaveLength(0);
 expect(detectAnalyticsFindings({...input,events:Array.from({length:40},(_,i)=>({...event,event_id:String(i)}))},now)).toHaveLength(20);
});
