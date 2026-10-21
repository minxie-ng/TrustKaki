import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), allowed: vi.fn(), read: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireOrganisationAdmin: m.auth, canAdministerSenior: m.allowed,
  authJsonError: (r: {status:number,error:string}) => Response.json({error:r.error},{status:r.status}) }));
vi.mock("@/lib/persistence/voiceLanguageRepository", () => ({readVoiceLanguage:m.read,saveVoiceLanguage:m.save}));
const seniorId="00000000-0000-4000-8000-000000000001";
const context={params:Promise.resolve({seniorId})};
const request=(language:unknown)=>new Request("http://localhost",{method:"PUT",body:JSON.stringify({language}),headers:{"content-type":"application/json"}});
beforeEach(()=>{vi.resetAllMocks();m.auth.mockResolvedValue({ok:true,auth:{}});m.allowed.mockReturnValue(true);m.read.mockResolvedValue(null);m.save.mockImplementation((_,v)=>Promise.resolve(v));});
it('blocks unauthorised and cross-senior access before persistence',async()=>{
 const route=await import('./route');m.auth.mockResolvedValueOnce({ok:false,status:403,error:'Forbidden'});
 expect((await route.PUT(request('en'),context)).status).toBe(403);
 m.allowed.mockReturnValue(false);expect((await route.GET(new Request('http://localhost'),context)).status).toBe(403);
 expect(m.read).not.toHaveBeenCalled();expect(m.save).not.toHaveBeenCalled();
});
it('reads and saves explicit language or automatic without invoking models',async()=>{
 const route=await import('./route');expect(await (await route.GET(new Request('http://localhost'),context)).json()).toEqual({language:null});
 expect(await (await route.PUT(request('en'),context)).json()).toEqual({language:'en'});
 expect(m.save).toHaveBeenCalledWith(seniorId,'en');
 expect((await route.PUT(request(null),context)).status).toBe(200);
});
it('rejects unsupported preferences and malformed senior IDs',async()=>{
 const route=await import('./route');expect((await route.PUT(request('auto'),context)).status).toBe(400);
 expect((await route.GET(new Request('http://localhost'),{params:Promise.resolve({seniorId:'bad'})})).status).toBe(400);
 expect(m.save).not.toHaveBeenCalled();expect(m.read).not.toHaveBeenCalled();
});
it('returns bounded errors without private storage details',async()=>{
 const route=await import('./route');m.save.mockRejectedValue(new Error('SECRET data'));
 const r=await route.PUT(request('ms'),context);expect(r.status).toBe(503);expect(JSON.stringify(await r.json())).not.toContain('SECRET');
});
