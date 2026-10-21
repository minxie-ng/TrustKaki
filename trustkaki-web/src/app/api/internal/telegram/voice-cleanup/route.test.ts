import {afterEach,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const expire=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/persistence/telegramVoiceRepository',()=>({expireVoiceDrafts:expire}));
import {GET} from './route';
afterEach(()=>{vi.unstubAllEnvs();vi.resetAllMocks();});
it('requires cron authentication before cleanup',async()=>{vi.stubEnv('CRON_SECRET','secret');expect((await GET(new Request('http://local'))).status).toBe(401);expect(expire).not.toHaveBeenCalled();});
it('cleans expired transcripts even with voice feature disabled',async()=>{vi.stubEnv('CRON_SECRET','secret');vi.stubEnv('TRUSTKAKI_TELEGRAM_VOICE_ENABLED','false');expect((await GET(new Request('http://local',{headers:{authorization:'Bearer secret'}}))).status).toBe(200);expect(expire).toHaveBeenCalledTimes(1);});
it('returns only a fixed error category',async()=>{vi.stubEnv('CRON_SECRET','secret');expire.mockRejectedValue(new Error('PRIVATE transcript'));const r=await GET(new Request('http://local',{headers:{authorization:'Bearer secret'}}));expect(r.status).toBe(503);expect(await r.text()).not.toContain('PRIVATE');});
