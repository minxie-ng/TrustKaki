"use client";

import { useState, useEffect, useRef } from "react";
import { authHeader } from "@/lib/auth/client";
import type { Message, RiskLevel } from "@/lib/types";

interface ChatSimulationProps {
  messages: Message[];
  seniorId: string | null;
  isSeniorLoading?: boolean;
  onComplete: () => void;
  authToken: string | null;
  onUnauthorized?: () => void;
}

interface OrchestrateResult {
  messages: Array<{ text: string; agentId?: Message["agentId"] }>;
  riskLevel: RiskLevel;
}

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString("en-SG", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ChatSimulation({
  messages,
  seniorId,
  isSeniorLoading = false,
  onComplete,
  authToken,
  onUnauthorized,
}: ChatSimulationProps) {
  const [visibleMessages, setVisibleMessages] = useState<Message[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const completionCalledRef = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleMessages]);

  useEffect(() => {
    if (!isRunning || currentIndex >= messages.length) return;

    const delay = messages[currentIndex].sender === "senior" ? 1200 : 1800;
    const timer = setTimeout(() => {
      setVisibleMessages((prev) => [...prev, messages[currentIndex]]);
      setCurrentIndex((i) => i + 1);
    }, delay);

    return () => clearTimeout(timer);
  }, [isRunning, currentIndex, messages]);

  async function runRealOrchestration(seedMessages: Message[]) {
    if (!seniorId || isSeniorLoading) return;
    const seniorMessage =
      seedMessages.find((message) => message.sender === "senior") ??
      messages.find((message) => message.sender === "senior");
    if (!seniorMessage) return;

    const response = await fetch("/api/agents/orchestrate", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(authToken) },
      body: JSON.stringify({
        seniorId,
        message: seniorMessage.text,
        clientMessageId: seniorMessage.id,
      }),
    });
    if (response.status === 401) {
      onUnauthorized?.();
      throw new Error("Unauthorized");
    }
    if (!response.ok) throw new Error("Orchestration request failed");
    const result = (await response.json()) as OrchestrateResult;
    const now = Date.now();
    const agentMessages: Message[] = result.messages.map((message, index) => ({
      id: `agent_${now}_${index}`,
      sender: "trustkaki",
      text: message.text,
      timestamp: new Date(now + index * 1000).toISOString(),
      agentId: message.agentId,
    }));
    setVisibleMessages((prev) => [...prev, ...agentMessages]);
  }

  const handleStart = () => {
    if (!seniorId || isSeniorLoading) return;
    completionCalledRef.current = false;
    setIsComplete(false);
    const seed = messages.slice(0, 2);
    setVisibleMessages(seed);
    setCurrentIndex(messages.length);
    setIsRunning(true);
    void runRealOrchestration(seed)
      .catch(() => {
        setVisibleMessages(messages);
      })
      .finally(() => {
        if (!completionCalledRef.current) {
          completionCalledRef.current = true;
          setIsComplete(true);
          setIsRunning(false);
          onComplete();
        }
      });
  };

  return (
    <div className="flex h-full flex-col bg-[var(--care-paper)] text-[var(--care-ink)]">
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--care-line)] px-4 py-3">
        <div>
          <div className="text-sm font-bold">Fictional demo conversation</div>
          <div className="mt-0.5 text-xs text-gray-500">Selected senior check-in</div>
        </div>
        <div className="pt-0.5 text-xs font-semibold text-gray-600" aria-live="polite">
          {isComplete ? "Complete" : isRunning ? "Running" : "Ready"}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!isRunning && visibleMessages.length === 0 && (
          <div className="flex h-full items-center justify-center px-4">
            <button
              type="button"
              onClick={handleStart}
              disabled={!seniorId || isSeniorLoading}
              className="min-h-11 border border-[var(--care-evergreen)] px-4 py-2 text-sm font-semibold text-[var(--care-evergreen)] hover:bg-[var(--care-mist)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--care-brand)] disabled:cursor-not-allowed disabled:border-gray-300 disabled:text-gray-400"
            >
              {isSeniorLoading
                ? "Loading senior..."
                : seniorId
                  ? "Run morning check-in"
                  : "Select a senior first"}
            </button>
          </div>
        )}

        <div className="divide-y divide-[var(--care-line)]">
        {visibleMessages.map((msg) => (
          <div
            key={msg.id}
            className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 px-4 py-3 text-sm"
          >
            <div className="text-xs font-semibold text-gray-500">
              {msg.sender === "senior"
                ? "Senior"
                : msg.sender === "system"
                  ? "Demo note"
                  : "TrustKaki"}
            </div>
            <div className="min-w-0">
              <div className="leading-relaxed text-gray-800">{msg.text}</div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-gray-500">
                <span>{formatTime(msg.timestamp)}</span>
                {msg.agentId && (
                  <code className="font-mono text-[10px] text-[var(--care-brand)]">
                    {msg.agentId}
                  </code>
                )}
              </div>
            </div>
          </div>
        ))}
        </div>
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
