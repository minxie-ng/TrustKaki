import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { getClient } from "./persistenceSupport";

function key() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Request receipt encryption unavailable");
  return Buffer.from(hkdfSync("sha256", secret, "trustkaki-web-receipts-v1", "retry-payload", 32));
}
export function sealReceipt(value: unknown, identity: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(identity));
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1",iv.toString("base64"),cipher.getAuthTag().toString("base64"),body.toString("base64")].join(".");
}
export function openReceipt(value: string, identity: string): unknown {
  const [version,iv,tag,body,...extra] = value.split(".");
  if (version !== "v1" || !iv || !tag || !body || extra.length) throw new Error("Invalid receipt");
  const cipher = createDecipheriv("aes-256-gcm",key(),Buffer.from(iv,"base64"));
  cipher.setAAD(Buffer.from(identity));
  cipher.setAuthTag(Buffer.from(tag,"base64"));
  return JSON.parse(Buffer.concat([cipher.update(Buffer.from(body,"base64")),cipher.final()]).toString("utf8"));
}
export interface WebRequestIdentity {
  clientMessageId: string;
  userId: string;
  seniorId: string;
  message: string;
  token: string;
}
export function receiptIdentity(value: WebRequestIdentity) {
  return JSON.stringify([value.userId,value.seniorId,value.clientMessageId]);
}
type ReceiptStatus = "run" | "resume" | "replay" | "busy" | "conflict" | "expired" | "saved";
export async function webRequestReceipt(
  identity: WebRequestIdentity,
  action: "claim" | "snapshot" | "complete" | "release" | "cancel",
  payload?: unknown,
): Promise<{status: ReceiptStatus; payload?: unknown}> {
  const client = getClient();
  if (!client) throw new Error("Durable request receipts unavailable");
  const {data,error} = await client.rpc("web_orchestration_request", {
    p_action:action,p_client_message_id:identity.clientMessageId,p_user_id:identity.userId,
    p_senior_id:identity.seniorId,p_message:identity.message,p_token:identity.token,
    p_payload:payload === undefined ? null : sealReceipt(payload,receiptIdentity(identity)),
  });
  if (error) throw new Error("Request receipt operation failed");
  const result = data as {status?: string; payload?: string} | null;
  if (!result || !["run","resume","replay","busy","conflict","expired","saved"].includes(result.status ?? "")) throw new Error("Invalid request receipt response");
  if (action !== "claim" && result.status !== "saved") throw new Error("Request receipt transition refused");
  if ((result.status === "replay" || result.status === "resume") && typeof result.payload !== "string") throw new Error("Request receipt payload unavailable");
  return {status:result.status as ReceiptStatus, ...(result.payload ? {payload:openReceipt(result.payload,receiptIdentity(identity))} : {})};
}
