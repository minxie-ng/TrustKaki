import 'server-only';
import { z } from 'zod';
import { voiceLanguageSchema, type VoiceLanguage } from '@/lib/voiceLanguage';

const MAX_AUDIO = 2_000_000;
const MAX_JSON = 100_000;

type Fetch = typeof fetch;

async function boundedBody(response: Response, cap: number): Promise<Uint8Array> {
  if (!response.ok || response.redirected) throw new Error('Invalid response');
  const length = response.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > cap)) throw new Error('Response too large');
  if (!response.body) throw new Error('Empty response');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > cap) throw new Error('Response too large');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}
async function boundedJson(response: Response) {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await boundedBody(response, MAX_JSON))) as unknown;
}
async function deadline<T>(message: string, timeoutMs: number, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work(controller.signal), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error(message)); }, timeoutMs);
    })]);
  } catch { throw new Error(message); }
  finally { if (timer) clearTimeout(timer); controller.abort(); }
}
function validOgg(audio: Uint8Array) {
  return audio.length >= 4 && audio.length <= MAX_AUDIO && audio[0] === 79 && audio[1] === 103 && audio[2] === 103 && audio[3] === 83;
}
const telegramFile = z.object({ ok: z.literal(true), result: z.object({ file_path: z.string().min(1).max(1024) }) });
export async function downloadTelegramVoice({ botToken, fileId }: { botToken: string; fileId: string }, fetchImpl: Fetch = fetch): Promise<Uint8Array> {
  return deadline('Voice download failed', 15_000, async signal => {
    if (!botToken || !fileId || fileId.length > 1024 || !/^[\w:-]+$/.test(botToken)) throw new Error('Invalid input');
    const metadata = telegramFile.parse(await boundedJson(await fetchImpl(`https://api.telegram.org/bot${botToken}/getFile`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file_id: fileId }), redirect: 'error', signal,
    })));
    const path = metadata.result.file_path;
    // Deliberately narrow: Telegram paths need no URL escapes or URL control characters.
    if (!/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.-]+)+$/.test(path) || path.split('/').some(p => p === '.' || p === '..')) throw new Error('Invalid file path');
    const audio = await boundedBody(await fetchImpl(`https://api.telegram.org/file/bot${botToken}/${path}`, { redirect: 'error', signal }), MAX_AUDIO);
    if (!validOgg(audio)) throw new Error('Invalid OGG');
    return audio;
  });
}
const transcription = z.object({
  text: z.string().trim().min(1).max(3000), duration: z.number().finite().positive().max(60),
  segments: z.array(z.object({ no_speech_prob: z.number().min(0).max(1).optional() })).max(1000).optional(),
});
export async function transcribeVoice(audio: Uint8Array, apiKey: string, fetchImpl: Fetch = fetch, language: VoiceLanguage = null): Promise<string> {
  return deadline('Voice transcription failed', 20_000, async signal => {
    if (!apiKey || !validOgg(audio)) throw new Error('Invalid input');
    const selectedLanguage = voiceLanguageSchema.parse(language);
    const body = new FormData();
    if (selectedLanguage) body.set('language', selectedLanguage);
    body.set('file', new Blob([new Uint8Array(audio)], { type: 'audio/ogg' }), 'voice.ogg');
    body.set('model', 'whisper-large-v3');
    body.set('response_format', 'verbose_json');
    const result = transcription.parse(await boundedJson(await fetchImpl('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body, redirect: 'error', signal,
    })));
    if (result.segments?.some(segment => (segment.no_speech_prob ?? 0) >= 0.8)) throw new Error('No speech');
    return result.text;
  });
}
