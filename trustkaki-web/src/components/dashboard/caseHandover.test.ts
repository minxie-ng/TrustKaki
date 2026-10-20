import {describe,expect,it} from 'vitest';
import type {CaregiverActionItem,FollowUpQueueItem} from '@/lib/types';
import {buildCaseHandover} from './caseHandover';
const item={status:'pending',assignedTo:null,recommendedAction:'Check in today.'} as FollowUpQueueItem;
const action=(id:string,actionType:CaregiverActionItem['actionType'],createdAt:string,note:string|null=null):CaregiverActionItem=>({id,actionType,createdAt,note,caregiver:'Rachel'});
describe('case handover',()=>{
 it('keeps last recorded outcome distinct from a later assignment and note',()=>{
  const outcome={...action('outcome','record_outcome','2026-10-21T09:00:00Z','No answer.'),outcomeType:'unable_to_reach' as const};
  const assignment=action('assign','assign','2026-10-21T10:00:00Z','Mei Ling to try this evening.');
  const result=buildCaseHandover(item,[assignment,outcome]);
  expect(result.outcome?.id).toBe('outcome');expect(result.note?.id).toBe('assign');expect(result.owner).toBe('Unassigned');expect(result.suggestion).toBe('Check in today.');
 });
 it('does not invent a plan or promote an undated action to latest',()=>{
  const result=buildCaseHandover(item,[action('bad','record_outcome','invalid','Made-up latest')]);
  expect(result.outcome).toBeNull();expect(result.note).toBeNull();expect(result.undatedActions).toBe(true);
 });
 it('suppresses active suggestions on resolved cases without rewriting history',()=>{
  const outcome=action('record','record_outcome','2026-10-21T09:00:00Z','Needs another call.');
  const result=buildCaseHandover({...item,status:'resolved',assignedTo:'Mei Ling'},[outcome]);
  expect(result.suggestion).toBeNull();expect(result.owner).toBe('Mei Ling');expect(result.outcome?.note).toBe('Needs another call.');
 });
});
