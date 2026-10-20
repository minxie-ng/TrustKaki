import type { Message } from "@/lib/types";

const PREFIX = "trustkaki:pending-web:v1:";
const TTL = 24 * 60 * 60 * 1000;
interface Receipt { id: string; fingerprint: string; timestamp: string; expiresAt: number }
let generation = 0;
const memory = new Map<string, { receipt: Receipt; message: Message }>();
const keyFor = (owner: string, senior: string) => `${PREFIX}${JSON.stringify([owner, senior])}`;
function storage(): Storage | null {
  try { return typeof window === "undefined" ? null : window.sessionStorage; } catch { return null; }
}
export async function messageFingerprint(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}
export function readPendingWebRequest(owner: string, senior: string) {
  const key = keyFor(owner, senior);
  const store = storage();
  let raw: string | null = null;
  try { raw = store?.getItem(key) ?? null; } catch { /* Use the in-memory receipt when storage reads are blocked. */ }
  try {
    const receipt: Receipt | undefined = raw ? JSON.parse(raw) : memory.get(key)?.receipt;
    if (!receipt) return null;
    if (typeof receipt.id !== "string" || receipt.id.length > 200 || !receipt.id ||
      !/^[a-f0-9]{64}$/.test(receipt.fingerprint) || !Number.isFinite(receipt.expiresAt) ||
      receipt.expiresAt <= Date.now() || receipt.expiresAt > Date.now() + TTL ||
      typeof receipt.timestamp !== "string" || !Number.isFinite(Date.parse(receipt.timestamp))) {
      forgetPendingWebRequest(owner, senior); return null;
    }
    const cached = memory.get(key);
    return { receipt, message: cached?.receipt.id === receipt.id ? cached.message : undefined };
  } catch { forgetPendingWebRequest(owner, senior); return null; }
}
export async function rememberPendingWebRequest(owner: string, senior: string, message: Message) {
  const startedGeneration = generation;
  const fingerprint = await messageFingerprint(message.text);
  if (generation !== startedGeneration) return;
  const receipt: Receipt = { id: message.id, timestamp: message.timestamp, fingerprint, expiresAt: Date.now() + TTL };
  const key = keyFor(owner, senior);
  memory.set(key, { receipt, message });
  try { storage()?.setItem(key, JSON.stringify(receipt)); } catch { /* In-memory retry remains available. */ }
}
export function forgetPendingWebRequest(owner: string, senior: string) {
  const key = keyFor(owner, senior);
  memory.delete(key);
  try { storage()?.removeItem(key); } catch { /* Storage may be disabled. */ }
}
export function clearPendingWebRequests() {
  generation++;
  memory.clear();
  try {
    const store = storage();
    if (store) for (let i = store.length - 1; i >= 0; i--) {
      const key = store.key(i);
      if (key?.startsWith(PREFIX)) store.removeItem(key);
    }
  } catch { /* No credentials or message text are stored here. */ }
}
