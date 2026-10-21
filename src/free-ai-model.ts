import {z} from 'zod';
const text=z.string().trim().min(1).max(300);
export const AIReport=z.object({summary:z.string().trim().min(1).max(1000),proposals:z.array(z.object({action:text,reason:text,effect:text,effort:z.enum(['low','medium','high']),risk:text,verification:text}).strict()).min(1).max(3),unverified:z.array(text).max(6)}).strict();
export const FreeAIState=z.object({utcDay:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),startedAt:z.iso.datetime(),finishedAt:z.iso.datetime().nullable(),sourceAt:z.iso.datetime().nullable(),status:z.enum(['running','succeeded','failed','held']),reason:z.enum(['no_data','stopped','provider_error','invalid_output','timeout','interrupted']).nullable(),result:AIReport.nullable()}).strict();
