"use client";

import { useState } from "react";
import type {
  DashboardData,
  AlertItem,
  RiskLevel,
} from "@/lib/types";

interface DashboardProps {
  data: DashboardData;
}

const riskConfig: Record<
  RiskLevel,
  { label: string; color: string; bg: string; border: string; emoji: string }
> = {
  green: {
    label: "Low Risk",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    emoji: "🟢",
  },
  yellow: {
    label: "Moderate Risk",
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
    emoji: "🟡",
  },
  red: {
    label: "High Risk",
    color: "text-red-700",
    bg: "bg-red-50",
    border: "border-red-200",
    emoji: "🔴",
  },
};

const alertTypeConfig: Record<
  AlertItem["type"],
  { icon: string; color: string; bg: string }
> = {
  health: { icon: "🏥", color: "text-rose-600", bg: "bg-rose-50" },
  daily_living: { icon: "🍽️", color: "text-amber-600", bg: "bg-amber-50" },
  digital_safety: { icon: "🛡️", color: "text-red-600", bg: "bg-red-50" },
  social: { icon: "👥", color: "text-violet-600", bg: "bg-violet-50" },
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-SG", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function Dashboard({ data }: DashboardProps) {
  const { senior, activeSessions, recentAlerts } = data;
  const [alerts, setAlerts] = useState(recentAlerts);
  const risk = riskConfig[senior.riskLevel];

  const acknowledgeAlert = (id: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)),
    );
  };

  const unacknowledgedCount = alerts.filter((a) => !a.acknowledged).length;
  const session = activeSessions[0];

  return (
    <div className="space-y-6">
      {/* Senior Profile Banner */}
      <div className={`rounded-2xl border ${risk.border} ${risk.bg} p-6`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-3xl shadow-sm">
              👴
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900">{senior.name}</h2>
              <p className="text-sm text-zinc-500">
                {senior.age} years old &middot; {senior.livingSituation}
              </p>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-zinc-400">
                <span>
                  <span className="font-medium text-zinc-500">Caregiver:</span>{" "}
                  {senior.caregiver}
                </span>
                <span>
                  <span className="font-medium text-zinc-500">AAC Volunteer:</span>{" "}
                  {senior.aacVolunteer}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <div className={`flex items-center gap-2 ${risk.color}`}>
              <span className="text-2xl">{risk.emoji}</span>
              <span className="text-lg font-bold">{risk.label}</span>
            </div>
            <span className="text-xs text-zinc-400">
              Last check-in:{" "}
              {senior.lastCheckIn ? formatDate(senior.lastCheckIn) : "—"}
            </span>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon="💬"
          label="Check-ins Today"
          value="1"
          sub="Completed"
          color="text-teal-600"
          bg="bg-teal-50"
        />
        <StatCard
          icon="⚠️"
          label="Active Alerts"
          value={String(unacknowledgedCount)}
          sub={unacknowledgedCount === 0 ? "All clear" : "Needs attention"}
          color="text-amber-600"
          bg="bg-amber-50"
        />
        <StatCard
          icon="🤖"
          label="Agents Active"
          value="6"
          sub="Multi-agent"
          color="text-violet-600"
          bg="bg-violet-50"
        />
        <StatCard
          icon="📅"
          label="Days Monitored"
          value="14"
          sub="Since Jan 1"
          color="text-cyan-600"
          bg="bg-cyan-50"
        />
      </div>

      {/* Two column: Alerts + Session Summary */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Alerts */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-base font-semibold text-zinc-900">
              <span>🔔</span> Recent Alerts
            </h3>
            {unacknowledgedCount > 0 && (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                {unacknowledgedCount} new
              </span>
            )}
          </div>
          <div className="space-y-2.5">
            {alerts.map((alert) => {
              const cfg = alertTypeConfig[alert.type];
              return (
                <div
                  key={alert.id}
                  className={`flex items-start gap-3 rounded-xl border p-3 transition-opacity ${
                    alert.acknowledged
                      ? "border-zinc-100 bg-zinc-50 opacity-60"
                      : "border-zinc-200 bg-white"
                  }`}
                >
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${cfg.bg} text-lg`}
                  >
                    {cfg.icon}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-zinc-700">
                      {alert.message}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {formatTime(alert.timestamp)}
                    </p>
                  </div>
                  {!alert.acknowledged ? (
                    <button
                      onClick={() => acknowledgeAlert(alert.id)}
                      className="shrink-0 rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-700"
                    >
                      Acknowledge
                    </button>
                  ) : (
                    <span className="shrink-0 text-xs font-medium text-emerald-500">
                      ✓ Done
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Session Summary */}
        {session && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-base font-semibold text-zinc-900">
                <span>📋</span> Latest Session Summary
              </h3>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                {session.status}
              </span>
            </div>

            {/* Risk change */}
            <div className="mb-4 flex items-center justify-center gap-3 rounded-xl bg-zinc-50 p-3">
              <span className={`text-sm font-semibold ${riskConfig[session.riskBefore].color}`}>
                {riskConfig[session.riskBefore].emoji} {riskConfig[session.riskBefore].label}
              </span>
              <span className="text-lg text-zinc-300">→</span>
              <span className={`text-sm font-semibold ${riskConfig[session.riskAfter].color}`}>
                {riskConfig[session.riskAfter].emoji} {riskConfig[session.riskAfter].label}
              </span>
            </div>

            {/* Summary text */}
            <p className="text-sm leading-relaxed text-zinc-600">
              {session.summary}
            </p>

            {/* Session meta */}
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-zinc-100 pt-3 text-xs text-zinc-400">
              <span>Started: {formatTime(session.startedAt)}</span>
              <span>Messages: {session.messages.length}</span>
              <span>Agent traces: {session.traces.length}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
  bg,
}: {
  icon: string;
  label: string;
  value: string;
  sub: string;
  color: string;
  bg: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${bg} text-base`}>
        {icon}
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs font-medium text-zinc-600">{label}</div>
      <div className="text-[10px] text-zinc-400">{sub}</div>
    </div>
  );
}
