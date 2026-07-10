"use client";

import { useState, useEffect, useRef } from "react";
import type { Message, AgentId } from "@/lib/types";

interface ChatSimulationProps {
  messages: Message[];
}

const agentConfig: Record<
  AgentId,
  { name: string; color: string; bg: string; border: string; icon: string }
> = {
  triage: {
    name: "Triage",
    color: "text-blue-600",
    bg: "bg-blue-50",
    border: "border-blue-200",
    icon: "🔀",
  },
  daily_living: {
    name: "Daily Living",
    color: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200",
    icon: "🍽️",
  },
  health_frailty: {
    name: "Health & Frailty",
    color: "text-rose-600",
    bg: "bg-rose-50",
    border: "border-rose-200",
    icon: "🏥",
  },
  aac_nudge: {
    name: "AAC Nudge",
    color: "text-violet-600",
    bg: "bg-violet-50",
    border: "border-violet-200",
    icon: "👥",
  },
  digital_safety: {
    name: "Digital Safety",
    color: "text-red-600",
    bg: "bg-red-50",
    border: "border-red-200",
    icon: "🛡️",
  },
  briefing: {
    name: "Briefing",
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    icon: "📋",
  },
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-SG", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export default function ChatSimulation({ messages }: ChatSimulationProps) {
  const [visibleCount, setVisibleCount] = useState(0);
  const [isReplaying, setIsReplaying] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const allVisible = visibleCount >= messages.length;

  // Auto-scroll to bottom when new messages appear
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [visibleCount]);

  // Replay animation
  useEffect(() => {
    if (isReplaying && visibleCount < messages.length) {
      const timer = setTimeout(() => {
        setVisibleCount((c) => {
          const nextCount = c + 1;
          if (nextCount >= messages.length) {
            setIsReplaying(false);
          }
          return nextCount;
        });
      }, 900);
      return () => clearTimeout(timer);
    }
  }, [isReplaying, visibleCount, messages.length]);

  const startReplay = () => {
    setVisibleCount(0);
    setIsReplaying(true);
  };

  const showAll = () => {
    setVisibleCount(messages.length);
    setIsReplaying(false);
  };

  return (
    <div className="flex h-full flex-col rounded-2xl border border-zinc-200 bg-white">
      {/* Chat header */}
      <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 text-lg shadow-sm">
            🤖
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">
              TrustKaki Check-in
            </h3>
            <p className="text-xs text-zinc-400">
              {allVisible ? "Session completed" : "In progress..."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={startReplay}
            disabled={isReplaying}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-50"
          >
            <span>▶</span> Replay
          </button>
          {!allVisible && (
            <button
              onClick={showAll}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
            >
              Skip ⏭
            </button>
          )}
        </div>
      </div>

      {/* Chat messages */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-4 overflow-y-auto bg-zinc-50/50 p-5"
        style={{ minHeight: "400px", maxHeight: "600px" }}
      >
        {visibleCount === 0 && !isReplaying && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="text-4xl">💬</div>
            <p className="text-sm text-zinc-400">
              Press Replay to watch the check-in session unfold
            </p>
            <button
              onClick={startReplay}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700"
            >
              ▶ Start Replay
            </button>
          </div>
        )}

        {messages.slice(0, visibleCount).map((msg) => (
          <ChatBubble key={msg.id} message={msg} />
        ))}

        {/* Typing indicator */}
        {isReplaying && visibleCount < messages.length && (
          <div className="flex items-center gap-2 pl-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 text-sm shadow-sm">
              🤖
            </div>
            <div className="flex gap-1 rounded-2xl rounded-tl-sm bg-white px-4 py-3 shadow-sm">
              <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-300 [animation-delay:-0.3s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-300 [animation-delay:-0.15s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-300" />
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-zinc-100 px-5 py-3">
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <span className="flex h-2 w-2 rounded-full bg-emerald-400" />
          <span>
            {visibleCount} of {messages.length} messages shown
          </span>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({ message }: { message: Message }) {
  const isSenior = message.sender === "senior";
  const isSystem = message.sender === "system";
  const agent = message.agentId ? agentConfig[message.agentId] : null;

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <div className="rounded-full bg-zinc-800 px-4 py-2 text-center text-xs font-medium text-white shadow-sm">
          {message.text}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isSenior ? "justify-start" : "justify-end"}`}>
      <div className={`flex max-w-[80%] flex-col gap-1 ${isSenior ? "items-start" : "items-end"}`}>
        {/* Agent badge */}
        {agent && (
          <div
            className={`flex items-center gap-1 rounded-full ${agent.bg} ${agent.border} border px-2 py-0.5 text-[10px] font-semibold ${agent.color}`}
          >
            <span>{agent.icon}</span>
            {agent.name} Agent
          </div>
        )}

        {/* Bubble */}
        <div
          className={`flex items-start gap-2 rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
            isSenior
              ? "rounded-tl-sm bg-white text-zinc-700"
              : "rounded-tr-sm bg-teal-600 text-white"
          }`}
        >
          {isSenior && (
            <span className="mt-0.5 text-base">👴</span>
          )}
          <p className="leading-relaxed">{message.text}</p>
        </div>

        {/* Timestamp */}
        <span className="px-1 text-[10px] text-zinc-400">
          {formatTime(message.timestamp)}
        </span>
      </div>
    </div>
  );
}
