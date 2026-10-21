import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only',()=>({}));
const m=vi.hoisted(()=>({client:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createTrustKakiServiceClient:m.client}));
import {readVoiceLanguage,saveVoiceLanguage} from './voiceLanguageRepository';
const id='00000000-0000-4000-8000-000000000001';
function setup(language:unknown=null,error:unknown=null){
 const q={select:vi.fn(),eq:vi.fn(),update:vi.fn(),single:vi.fn().mockResolvedValue({data:{preferred_voice_language:language},error})};
 q.select.mockReturnValue(q);q.eq.mockReturnValue(q);q.update.mockReturnValue(q);
 m.client.mockReturnValue({from:vi.fn().mockReturnValue(q)});return q;
}
beforeEach(()=>vi.resetAllMocks());
it('reads only the selected senior preference, including automatic',async()=>{
 const q=setup('ms');expect(await readVoiceLanguage(id)).toBe('ms');expect(q.eq).toHaveBeenCalledWith('id',id);
 setup(null);expect(await readVoiceLanguage(id)).toBeNull();
});
it('updates only the selected senior and supported language',async()=>{
 const q=setup('en');expect(await saveVoiceLanguage(id,'en')).toBe('en');
 expect(q.update).toHaveBeenCalledWith({preferred_voice_language:'en'});expect(q.eq).toHaveBeenCalledWith('id',id);
 await expect(saveVoiceLanguage(id,'bad' as 'en')).rejects.toThrow();expect(q.update).toHaveBeenCalledTimes(1);
});
it('fails closed for storage errors and invalid data',async()=>{
 setup(null,{message:'private'});await expect(readVoiceLanguage(id)).rejects.toThrow('Voice language unavailable');
 setup('bad');await expect(readVoiceLanguage(id)).rejects.toThrow();
});
