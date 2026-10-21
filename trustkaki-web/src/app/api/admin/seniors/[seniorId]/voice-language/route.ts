import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/lib/api/schemas";
import { authJsonError, canAdministerSenior, requireOrganisationAdmin } from "@/lib/auth/session";
import { readVoiceLanguage, saveVoiceLanguage } from "@/lib/persistence/voiceLanguageRepository";
import { voiceLanguageSchema } from "@/lib/voiceLanguage";

export const runtime = "nodejs";
type Context = { params: Promise<{ seniorId: string }> };
async function authorize(request: Request, context: Context) {
  const auth = await requireOrganisationAdmin(request);
  if (!auth.ok) return { response: authJsonError(auth) };
  const { seniorId } = await context.params;
  if (!z.uuid().safeParse(seniorId).success) return { response: NextResponse.json({error:"Invalid senior"},{status:400}) };
  if (!canAdministerSenior(auth.auth, seniorId)) return {response:NextResponse.json({error:"Forbidden"},{status:403})};
  return { seniorId };
}
export async function GET(request: Request, context: Context) {
  const scope = await authorize(request,context);
  if (scope.response) return scope.response;
  try { return NextResponse.json({language:await readVoiceLanguage(scope.seniorId!)}); }
  catch { return NextResponse.json({error:"Unable to load voice language"},{status:503}); }
}
export async function PUT(request: Request, context: Context) {
  const scope = await authorize(request,context);
  if (scope.response) return scope.response;
  const parsed = await parseJsonBody(request,z.object({language:voiceLanguageSchema}).strict());
  if (!parsed.ok) return NextResponse.json({error:parsed.error},{status:parsed.status});
  try { return NextResponse.json({language:await saveVoiceLanguage(scope.seniorId!,parsed.data.language)}); }
  catch { return NextResponse.json({error:"Unable to save voice language"},{status:503}); }
}
