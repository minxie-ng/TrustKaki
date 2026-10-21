"use client";

import OfficialSourceText from "./OfficialSourceText";

import { useState, useEffect, useRef, type FormEvent } from "react";
import { authHeader } from "@/lib/auth/client";
import type { Message } from "@/lib/types";
import { readPendingWebRequest, rememberPendingWebRequest, forgetPendingWebRequest, messageFingerprint } from "@/lib/pendingWebRequest";
import { judgeRunSchema, type JudgeRun } from "./judgeRunViewModel";

export interface ChatSimulationProps {
  messages: Message[];
  seniorId: string | null;
  isSeniorLoading?: boolean;
  onComplete: () => void;
  authToken: string | null;
  userId?: string;
  onUnauthorized?: () => void;
  onResult?: (result: JudgeRun) => void;
}

export default function ChatSimulation({ messages, seniorId, isSeniorLoading = false, onComplete, authToken, userId, onUnauthorized, onResult }: ChatSimulationProps) {
  const [conversation, setConversation] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sendingRef = useRef(false);
  const pendingRef = useRef<{seniorId:string;owner:string;message:Message} | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const [recovering, setRecovering] = useState(false);
  useEffect(() => {
    pendingRef.current = null;
    // Synchronize the conversation with the external receipt store when its identity changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConversation([]);
    setDraft("");
    setError(null);
    setBusy(false);
    sendingRef.current = false;
    const saved = userId && seniorId ? readPendingWebRequest(userId, seniorId) : null;
    setRecovering(Boolean(saved));
    if (saved?.message && userId && seniorId) {
      pendingRef.current = { owner: userId, seniorId, message: saved.message };
      setDraft(saved.message.text);
      setConversation([saved.message]);
    }
    return () => requestRef.current?.abort();
  }, [userId, seniorId]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (sendingRef.current || busy || !seniorId || !authToken || isSeniorLoading || !draft.trim()) return;
    const owner = userId ?? authToken;
    const unresolved = pendingRef.current;
    if (userId && unresolved?.seniorId === seniorId && unresolved.owner === owner && !readPendingWebRequest(userId, seniorId)) {
      pendingRef.current = null;
      setRecovering(false);
      setError("This message can no longer be replayed. Check Activity for its saved outcome.");
      return;
    }
    if (unresolved?.seniorId === seniorId && unresolved.owner === owner && unresolved.message.text !== draft.trim()) {
      setDraft(unresolved.message.text);
      setError("Check or resume your previous message first. Its text has been restored; send it again to retry safely.");
      return;
    }
    sendingRef.current = true;
    const controller = new AbortController();
    requestRef.current = controller;
    setBusy(true);
    setError(null);
    try {
      const saved = userId ? readPendingWebRequest(userId, seniorId) : null;
      if (saved && await messageFingerprint(draft.trim()) !== saved.receipt.fingerprint) throw new Error("request_text_mismatch");
      if (controller.signal.aborted) return;
      const retry = unresolved?.seniorId === seniorId && unresolved.owner === owner;
      const inbound: Message = retry ? unresolved.message : {
        id: saved?.receipt.id ?? crypto.randomUUID(), sender: "senior", text: draft.trim(),
        timestamp: saved?.receipt.timestamp ?? new Date().toISOString(),
      };
      pendingRef.current = {seniorId, owner, message: inbound};
      if (userId && !saved) await rememberPendingWebRequest(userId, seniorId, inbound);
      if (controller.signal.aborted) return;
      setConversation(current => current.some(item => item.id === inbound.id) ? current : [...current, inbound]);
      const response = await fetch("/api/agents/orchestrate", {
        method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json", ...authHeader(authToken) },
        body: JSON.stringify({ seniorId, message: inbound.text, clientMessageId: inbound.id }),
      });
      if (controller.signal.aborted) return;
      if (response.status === 401) onUnauthorized?.();
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        if (controller.signal.aborted) return;
        if (body.code === "request_in_progress") throw new Error("request_in_progress");
        if (body.code === "request_expired") {
          if (userId) forgetPendingWebRequest(userId, seniorId);
          pendingRef.current = null;
          setRecovering(false);
          throw new Error("request_expired");
        }
        throw new Error("request_failed");
      }
      const result = judgeRunSchema.parse(await response.json());
      if (controller.signal.aborted) return;
      setConversation((current) => [...current, ...result.messages.map((message, index) => ({ ...message, id: `${inbound.id}:reply:${index}`, sender: "trustkaki" as const, timestamp: new Date().toISOString() }))]);
      if (userId) forgetPendingWebRequest(userId, seniorId);
      pendingRef.current = null;
      setRecovering(false);
      setDraft("");
      onResult?.(result);
      onComplete();
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error && failure.message === "request_text_mismatch"
        ? "An earlier message is unfinished. Enter its original wording to check or resume it; no new message was sent."
        : failure instanceof Error && failure.message === "request_in_progress"
          ? "This message is still processing or awaiting review. Retry this same message later; check Activity before starting a new one."
          : failure instanceof Error && failure.message === "request_expired"
            ? "This message can no longer be replayed. Check Activity for its saved outcome."
            : "The request did not complete successfully; a server-side save may have occurred. Retry this same message to check or resume its result.");
    } finally {
      if (requestRef.current === controller) {
        sendingRef.current = false;
        if (!controller.signal.aborted) setBusy(false);
      }
    }
  }

  return (
    <section aria-label="Fictional demo conversation" className="flex h-full min-h-0 flex-col bg-white">
      <div className="shrink-0 border-b border-[var(--care-line)] px-5 py-4">
        <h2 className="text-base font-semibold">Try a fictional conversation</h2>
        <p className="mt-1 text-sm text-gray-600">Send as the selected senior. This runs the live system and saves the result.</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--care-surface-muted)] px-4 py-5 sm:px-5" role="log" aria-label="Demo messages" aria-live="polite" aria-busy={busy}>
        {conversation.length === 0 && <p className="py-6 text-base leading-7 text-gray-600">Try a preference, a suspicious message, or an invitation. Compare the selected specialists with the final reply.</p>}
        {conversation.map((message) => <article key={message.id} className={`mb-5 flex ${message.sender === "senior" ? "justify-end" : "justify-start"}`}>
          <div className={`min-w-0 max-w-[90%] rounded-2xl border border-[var(--care-line)] px-4 py-3 sm:max-w-[85%] ${message.sender === "senior" ? "rounded-br-md bg-[var(--care-sage)]" : "rounded-bl-md bg-white"}`}>
          <h3 className="text-sm font-semibold text-[var(--care-brand)]">{message.sender === "senior" ? "Senior" : "TrustKaki"}</h3>
          <p className="mt-2 whitespace-pre-wrap break-words text-base leading-7">{message.sender === "trustkaki" ? <OfficialSourceText text={message.text} /> : message.text}</p>
          </div>
        </article>)}
        {recovering && <p role="status" className="py-4 text-sm text-gray-600">An earlier message may be unfinished. Use its original wording and send to check or resume it. Nothing is sent automatically.</p>}
        {busy && <p role="status" className="py-4 text-sm text-gray-600">Reviewing context and preparing one reply…</p>}
        {error && <p role="alert" className="my-4 border-l-2 border-[var(--care-coral)] pl-3 text-sm leading-6">{error}</p>}
      </div>
      <form onSubmit={send} className="shrink-0 border-t border-[var(--care-line)] p-5">
        <label htmlFor="judge-message" className="text-sm font-semibold">Senior’s message</label>
        <textarea id="judge-message" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={5000} rows={3} disabled={busy || isSeniorLoading} className="mt-2 w-full resize-y border border-[var(--care-line)] p-3 text-base disabled:opacity-50" placeholder="Type a fictional message…" />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <button type="button" disabled={busy} onClick={() => setDraft(messages.find((message) => message.sender === "senior")?.text ?? "I prefer quiet one-to-one chats. Please do not suggest group activities today.")} className="min-h-11 text-sm font-semibold text-[var(--care-brand)] hover:underline">Use a check-in example</button>
          <button type="submit" disabled={busy || !seniorId || !authToken || isSeniorLoading || !draft.trim()} className="care-primary-button text-sm">{busy ? "Running…" : isSeniorLoading ? "Loading senior…" : "Send fictional message"}</button>
        </div>
      </form>
    </section>
  );
}
