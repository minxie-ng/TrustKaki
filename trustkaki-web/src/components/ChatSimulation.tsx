"use client";

import { useState, useEffect, useRef, type FormEvent } from "react";
import { authHeader } from "@/lib/auth/client";
import type { Message } from "@/lib/types";
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
  useEffect(() => () => requestRef.current?.abort(), []);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (sendingRef.current || busy || !seniorId || !authToken || isSeniorLoading || !draft.trim()) return;
    const unresolved = pendingRef.current;
    if (unresolved?.seniorId === seniorId && unresolved.owner === (userId ?? authToken) && unresolved.message.text !== draft.trim()) {
      setDraft(unresolved.message.text);
      setError("Check or resume your previous message first. Its text has been restored; send it again to retry safely.");
      return;
    }
    sendingRef.current = true;
    const controller = new AbortController();
    requestRef.current = controller;
    const pending = pendingRef.current;
    const retry = pending?.seniorId === seniorId && pending.owner === (userId ?? authToken) && pending.message.text === draft.trim();
    const inbound: Message = retry ? pending.message : { id: crypto.randomUUID(), sender: "senior", text: draft.trim(), timestamp: new Date().toISOString() };
    pendingRef.current = {seniorId,owner:userId ?? authToken,message:inbound};
    if (!retry) setConversation((current) => [...current, inbound]);
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/agents/orchestrate", {
        method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json", ...authHeader(authToken) },
        body: JSON.stringify({ seniorId, message: inbound.text, clientMessageId: inbound.id }),
      });
      if (response.status === 401) onUnauthorized?.();
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        if (body.code === "request_in_progress") throw new Error("request_in_progress");
        if (body.code === "request_expired") throw new Error("request_expired");
        throw new Error("request_failed");
      }
      const result = judgeRunSchema.parse(await response.json());
      if (controller.signal.aborted) return;
      setConversation((current) => [...current, ...result.messages.map((message, index) => ({ ...message, id: `${inbound.id}:reply:${index}`, sender: "trustkaki" as const, timestamp: new Date().toISOString() }))]);
      pendingRef.current = null;
      setDraft("");
      onResult?.(result);
      onComplete();
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error && failure.message === "request_in_progress"
        ? "This message is still processing or awaiting review. Retry this same message later; check Activity before starting a new one."
        : failure instanceof Error && failure.message === "request_expired"
          ? "This message can no longer be replayed. Check Activity for its saved outcome."
          : "The request did not complete successfully; a server-side save may have occurred. Retry this same message to check or resume its result.");
    } finally {
      sendingRef.current = false;
      if (!controller.signal.aborted) setBusy(false);
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
          <p className="mt-2 whitespace-pre-wrap break-words text-base leading-7">{message.text}</p>
          </div>
        </article>)}
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
