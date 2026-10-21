import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const m = vi.hoisted(() => ({ language:vi.fn(), identity:vi.fn(), prepare:vi.fn(), get:vi.fn(), stage:vi.fn(), confirm:vi.fn(), reserve:vi.fn(), download:vi.fn(), transcribe:vi.fn(), state:vi.fn(), done:vi.fn() }));
vi.mock('@/lib/persistence/seniorMessagingIdentityRepository', () => ({findSeniorIdByMessagingIdentity:m.identity}));
vi.mock('@/lib/persistence/telegramVoiceRepository', () => ({prepareVoiceDraft:m.prepare,getVoiceDraft:m.get,stageVoiceDraft:m.stage,confirmVoiceDraft:m.confirm,reserveVoiceInference:m.reserve}));
vi.mock('@/lib/persistence/voiceLanguageRepository',()=>({readVoiceLanguage:m.language}));
vi.mock('./voiceAudio', () => ({downloadTelegramVoice:m.download,transcribeVoice:m.transcribe}));
vi.mock('@/lib/persistence/telegramEventRepository', () => ({updateTelegramOutboundState:m.state,markTelegramEventProcessed:m.done}));
import { processVoiceEvent } from './voiceService';
import type { PersistedTelegramEvent } from '@/lib/persistence/telegramEventRepository';
const draftId='00000000-0000-4000-8000-000000000123';
const event=()=>({id:'event',event_type:'inbound_voice',sender_user_id:'11',chat_id:'11',telegram_message_id:'12',outbound_status:'not_started',payload:{fileId:'file',duration:10,fileSize:100}} as unknown as PersistedTelegramEvent);
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('TRUSTKAKI_TELEGRAM_VOICE_ENABLED','true');vi.stubEnv('GROQ_API_KEY','test-key');vi.stubEnv('TELEGRAM_BOT_TOKEN','test-token');m.identity.mockResolvedValue('senior');m.language.mockResolvedValue('en');m.prepare.mockResolvedValue({id:draftId});m.get.mockResolvedValue({id:draftId,status:'processing',transcript:null});m.download.mockResolvedValue(new Uint8Array([1]));m.transcribe.mockResolvedValue('I had toast today.');m.stage.mockResolvedValue(true);m.reserve.mockResolvedValue(true);});
const client=()=>({sendText:vi.fn().mockResolvedValue({messageId:'out'}),answerCallback:vi.fn().mockResolvedValue(undefined)});
it('authorises before media and stages a draft without care processing',async()=>{const c=client(),process=vi.fn();await processVoiceEvent(event(),c,process);expect(m.identity.mock.invocationCallOrder[0]).toBeLessThan(m.download.mock.invocationCallOrder[0]);expect(m.stage).toHaveBeenCalledWith({draftId,transcript:'I had toast today.'});expect(c.sendText.mock.calls[0][0]).toMatchObject({text:expect.stringContaining('I heard'),replyMarkup:{inline_keyboard:expect.any(Array)}});expect(c.sendText.mock.calls[0][0].text).toContain("I heard:\n");expect(process).not.toHaveBeenCalled();});
it('never downloads for unknown identity',async()=>{m.identity.mockResolvedValue(null);const c=client();await processVoiceEvent(event(),c,vi.fn());expect(m.download).not.toHaveBeenCalled();expect(c.sendText).not.toHaveBeenCalled();});
it('disabled feature does no lookups or network work',async()=>{vi.stubEnv('TRUSTKAKI_TELEGRAM_VOICE_ENABLED','false');await processVoiceEvent(event(),client(),vi.fn());expect(m.identity).not.toHaveBeenCalled();});
it('rejects metadata bounds before downloading',async()=>{const e=event();e.payload={fileId:'f',duration:61,fileSize:10};const c=client();await processVoiceEvent(e,c,vi.fn());expect(m.download).not.toHaveBeenCalled();expect(c.sendText.mock.calls[0][0].text).toContain('60 seconds');});
it('provider failure asks for typed text without exposing provider errors',async()=>{m.transcribe.mockRejectedValue(new Error('SECRET raw payload'));const c=client();await processVoiceEvent(event(),c,vi.fn());expect(c.sendText.mock.calls[0][0].text).toContain('type');expect(JSON.stringify(c.sendText.mock.calls)).not.toContain('SECRET');});
it('retry reuses staged transcript without another model call',async()=>{m.get.mockResolvedValue({id:draftId,status:'pending',transcript:'Stored transcript'});await processVoiceEvent(event(),client(),vi.fn());expect(m.transcribe).not.toHaveBeenCalled();});
it('superseded draft does not send confirmation',async()=>{m.stage.mockResolvedValue(false);const c=client();await processVoiceEvent(event(),c,vi.fn());expect(c.sendText).not.toHaveBeenCalled();});
it('only confirmed callback processes stable durable text event',async()=>{const e=event();e.event_type='voice_callback';e.payload={draftId,action:'confirm',callbackId:'cb'};m.confirm.mockResolvedValue('text-event');const process=vi.fn();await processVoiceEvent(e,client(),process);expect(m.confirm).toHaveBeenCalledWith({draftId,seniorId:'senior',senderUserId:'11',chatId:'11',action:'confirm'});expect(process).toHaveBeenCalledWith('text-event');expect(m.transcribe).not.toHaveBeenCalled();});
it('discard or expired confirmation never reaches care pipeline',async()=>{const e=event();e.event_type='voice_callback';e.payload={draftId,action:'discard',callbackId:'cb'};m.confirm.mockResolvedValue(null);const process=vi.fn();await processVoiceEvent(e,client(),process);expect(process).not.toHaveBeenCalled();});
it('rechecks callback actor identity',async()=>{m.identity.mockResolvedValue(null);const e=event();e.event_type='voice_callback';e.payload={draftId,action:'confirm',callbackId:'cb'};await processVoiceEvent(e,client(),vi.fn());expect(m.confirm).not.toHaveBeenCalled();});

it('does not repeat inference after interrupted first attempt',async()=>{m.reserve.mockResolvedValue(false);const c=client();await processVoiceEvent(event(),c,vi.fn());expect(m.transcribe).not.toHaveBeenCalled();expect(m.download).not.toHaveBeenCalled();});

it('uses the authorised senior language for transcription',async()=>{
 await processVoiceEvent(event(),client(),vi.fn());
 expect(m.language).toHaveBeenCalledWith('senior');
 expect(m.transcribe).toHaveBeenCalledWith(expect.any(Uint8Array),'test-key',undefined,'en');
});
it('uses automatic detection when no preference is saved',async()=>{
 m.language.mockResolvedValue(null);
 await processVoiceEvent(event(),client(),vi.fn());
 expect(m.transcribe).toHaveBeenCalledWith(expect.any(Uint8Array),'test-key',undefined,null);
});
it('does not silently guess when the preference lookup fails',async()=>{
 m.language.mockRejectedValue(new Error('private database detail'));
 const c=client();await processVoiceEvent(event(),c,vi.fn());
 expect(m.transcribe).not.toHaveBeenCalled();
 expect(c.sendText.mock.calls[0][0].text).toContain('type');
});
