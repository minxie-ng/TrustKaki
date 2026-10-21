import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { downloadTelegramVoice, transcribeVoice } from './voiceAudio';
const ogg = new Uint8Array([79,103,103,83,1]);
const json = (x:unknown)=>new Response(JSON.stringify(x));
const file = (path='voice/file.oga')=>json({ok:true,result:{file_path:path}});
const transcript = (extra={})=>json({text:'Hello there',duration:4,segments:[{no_speech_prob:0.01}],...extra});
describe('voice audio',()=>{
 it('downloads fixed origin OGG with redirect refusal',async()=>{const fetcher=vi.fn().mockResolvedValueOnce(file()).mockResolvedValueOnce(new Response(ogg));expect(await downloadTelegramVoice({botToken:'secret',fileId:'id'},fetcher)).toEqual(ogg);expect(fetcher.mock.calls[1][0]).toBe('https://api.telegram.org/file/botsecret/voice/file.oga');expect(fetcher.mock.calls[1][1].redirect).toBe('error');});
 it.each(['../x','/x','https://evil/x','voice/../x','voice/x?token=x','voice/%2e%2e/x','voice/x#x'])('rejects path %s',async path=>{const fetcher=vi.fn().mockResolvedValue(file(path));await expect(downloadTelegramVoice({botToken:'secret',fileId:'id'},fetcher)).rejects.toThrow();expect(fetcher).toHaveBeenCalledTimes(1);});
 it('caps actual streamed bytes',async()=>{const fetcher=vi.fn().mockResolvedValueOnce(file()).mockResolvedValueOnce(new Response(new Uint8Array(2000001)));await expect(downloadTelegramVoice({botToken:'secret',fileId:'id'},fetcher)).rejects.toThrow();});
 it('rejects partial or invalid audio',async()=>{const fetcher=vi.fn().mockResolvedValueOnce(file()).mockResolvedValueOnce(new Response('Ogg'));await expect(downloadTelegramVoice({botToken:'secret',fileId:'id'},fetcher)).rejects.toThrow();});
 it('sanitizes fetch errors',async()=>{await expect(downloadTelegramVoice({botToken:'secret',fileId:'id'},vi.fn().mockRejectedValue(new Error('secret')))).rejects.toThrow('Voice download failed');});
 it('transcribes multipart OGG',async()=>{const fetcher=vi.fn().mockResolvedValue(transcript());expect(await transcribeVoice(ogg,'key',fetcher)).toBe('Hello there');expect(fetcher.mock.calls[0][1].body.get('model')).toBe('whisper-large-v3');});
 it.each([{text:''},{text:'x'.repeat(3001)},{duration:61},{duration:0},{segments:[{no_speech_prob:0.95}]},{duration:undefined}])('rejects unusable transcription',async extra=>{await expect(transcribeVoice(ogg,'key',vi.fn().mockResolvedValue(transcript(extra)))).rejects.toThrow();});
 it('rejects malformed provider JSON',async()=>{await expect(transcribeVoice(ogg,'key',vi.fn().mockResolvedValue(new Response('{')))).rejects.toThrow();});
});

describe('bounded failure handling',()=>{
 it('cancels a broken partial audio stream',async()=>{
  let reads=0;
  const stream=new ReadableStream<Uint8Array>({pull(controller){if(reads++===0)controller.enqueue(ogg);else controller.error(new Error('private failure'));}});
  const fetcher=vi.fn().mockResolvedValueOnce(file()).mockResolvedValueOnce(new Response(stream));
  await expect(downloadTelegramVoice({botToken:'secret',fileId:'id'},fetcher)).rejects.toThrow('Voice download failed');
 });
 it('rejects redirected audio',async()=>{
  const response=new Response(ogg);Object.defineProperty(response,'redirected',{value:true});
  await expect(downloadTelegramVoice({botToken:'secret',fileId:'id'},vi.fn().mockResolvedValueOnce(file()).mockResolvedValueOnce(response))).rejects.toThrow();
 });
 it('rejects provider HTTP failures and oversized responses',async()=>{
  for(const response of [new Response('key',{status:500}),new Response('x'.repeat(100001))])await expect(transcribeVoice(ogg,'key',vi.fn().mockResolvedValue(response))).rejects.toThrow('Voice transcription failed');
 });
 it('enforces the deadline even if fetch never resolves',async()=>{
  vi.useFakeTimers();
  try {
   const request=transcribeVoice(ogg,'key',vi.fn(()=>new Promise<Response>(()=>{})));
   const assertion=expect(request).rejects.toThrow('Voice transcription failed');
   await vi.advanceTimersByTimeAsync(20000);await assertion;
  } finally {vi.useRealTimers();}
 });
});

 it('enforces the 15-second download deadline',async()=>{
  vi.useFakeTimers();
  try {
   const request=downloadTelegramVoice({botToken:'secret',fileId:'id'},vi.fn(()=>new Promise<Response>(()=>{})));
   const assertion=expect(request).rejects.toThrow('Voice download failed');
   await vi.advanceTimersByTimeAsync(15000);await assertion;
  } finally {vi.useRealTimers();}
 });

it('passes an explicit supported language and omits it for automatic detection',async()=>{
 const english=vi.fn().mockResolvedValue(transcript());
 await transcribeVoice(ogg,'key',english,'en');
 expect(english.mock.calls[0][1].body.get('language')).toBe('en');
 const automatic=vi.fn().mockResolvedValue(transcript());
 await transcribeVoice(ogg,'key',automatic,null);
 expect(automatic.mock.calls[0][1].body.has('language')).toBe(false);
});
it('rejects unsupported language values before contacting the provider',async()=>{
 const fetcher=vi.fn();
 await expect(transcribeVoice(ogg,'key',fetcher,'invalid' as 'en')).rejects.toThrow('Voice transcription failed');
 expect(fetcher).not.toHaveBeenCalled();
});
