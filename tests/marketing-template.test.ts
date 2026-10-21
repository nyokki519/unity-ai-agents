import {it,expect} from 'vitest';
import {marketingTemplate} from '../src/marketing-template.js';
import {plan} from '../src/planner.js';
import {view} from '../src/view.js';
import {emptyState} from '../src/model.js';
it('offers a bounded marketing briefing without requesting external actions',()=>{
 expect(marketingTemplate.length).toBeLessThanOrEqual(4000);
 for(const label of ['開催日時','定員','予約数','告知先','申込導線','次回確認','未確認','同じ開催前日数','因果'])expect(marketingTemplate).toContain(label);
 expect(plan(marketingTemplate)[0]!.action).toBe('handoff.reasoning');
 expect(plan(marketingTemplate).every(s=>!s.action.startsWith('protected.'))).toBe(true);
});
it('exposes the same reusable template without creating tasks or changing state',()=>{
 const s=emptyState(),before=structuredClone(s);expect(view(s).marketingTemplate).toBe(marketingTemplate);expect(s).toEqual(before);
});
