import {z} from 'zod';
import {AnalyticsSnapshot} from './analytics-model.js';
import {FreeAIState} from './free-ai-model.js';
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(v+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===v;});
export const HistorySnapshot=AnalyticsSnapshot.omit({findings:true});
export const OperationDay=z.object({day,startedAt:z.iso.datetime(),finishedAt:z.iso.datetime().nullable(),recordedAt:z.iso.datetime(),status:z.enum(['running','success','partial','failed','stopped','not_configured','cooldown']),created:z.number().int().min(0).max(3),fetchedAt:z.iso.datetime().nullable(),snapshot:HistorySnapshot.nullable(),aiStatus:FreeAIState.shape.status.or(z.literal('not_run')),aiReason:FreeAIState.shape.reason}).strict();
export const OperationsHistory=z.array(OperationDay).max(90).refine(rows=>new Set(rows.map(r=>r.day)).size===rows.length);
export type OperationDayData=z.infer<typeof OperationDay>;
