"use client";

import { useState, useEffect, useRef } from "react";
import { authHeader } from "@/lib/auth/client";
import type { Message, RiskLevel } from "@/lib/types";

interface ChatSimulationProps {
  messages: Message[];
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
    const seniorMessage =
      seedMessages.find((message) => message.sender === "senior") ??
      messages.find((message) => message.sender === "senior");
    if (!seniorMessage) return;

    const response = await fetch("/api/agents/orchestrate", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(authToken) },
      body: JSON.stringify({
        message: seniorMessage.text,
        context: {
          senior: {
            name: "Uncle Tan",
            age: 76,
            livingSituation: "Lives alone in 3-room HDB, Toa Payoh",
            caregiver: "Rachel Tan",
            aacVolunteer: "Mei Ling",
          },
          messages: seedMessages,
          currentRiskLevel: "green",
        },
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
    <div className="flex flex-col h-full">
      <div className="bg-emerald-600 text-white px-4 py-3 flex items-center gap-3 shrink-0">
        <div className="w-10 h-10 rounded-full bg-emerald-300 flex items-center justify-center text-lg font-bold text-emerald-800">
          👴
        </div>
        <div>
          <div className="font-semibold">Uncle Tan</div>
          <div className="text-xs text-emerald-200">TrustKaki Check-in</div>
        </div>
        <div className="ml-auto text-xs bg-emerald-500 px-2 py-1 rounded-full">
          {isComplete ? "Complete ✅" : isRunning ? "Live 🔴" : "Ready"}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-[#e5ddd5]">
        {!isRunning && visibleMessages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <button
              onClick={handleStart}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl text-lg font-semibold shadow-lg transition-all hover:scale-105"
            >
              ▶ Run Morning Check-in
            </button>
          </div>
        )}

        {visibleMessages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.sender === "senior" ? "justify-end" : "justify-start"}`}
          >
            {msg.sender === "system" ? (
              <div className="w-full flex justify-center">
                <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 text-xs px-4 py-2 rounded-full font-medium">
                  {msg.text}
                </div>
              </div>
            ) : (
              <div
                className={`max-w-[80%] px-4 py-2 rounded-2xl text-sm leading-relaxed shadow-sm ${
                  msg.sender === "senior"
                    ? "bg-[#dcf8c6] rounded-tr-sm"
                    : "bg-white rounded-tl-sm"
                }`}
              >
                <div>{msg.text}</div>
                <div
                  className={`text-[10px] mt-1 ${
                    msg.sender === "senior" ? "text-emerald-700 text-right" : "text-gray-400"
                  }`}
                >
                  {formatTime(msg.timestamp)}
                  {msg.agentId && (
                    <span className="ml-2 bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded text-[9px]">
                      {msg.agentId}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {isRunning && currentIndex > 0 && (
        <div className="bg-gray-900 text-green-400 text-xs px-4 py-2 font-mono flex items-center gap-2 shrink-0">
          <span className="inline-block w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <span>
            Running Orchestrator → Triage → conditional specialist agents → policy → Pattern Watch
          </span>
        </div>
      )}
    </div>
  );
}
