import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AgentTrace } from "@/lib/types";

const ROOT = "https://api-open.data.gov.sg/v2/real-time/api/";
const SOURCES = {
  short: `${ROOT}two-hr-forecast`, long: `${ROOT}twenty-four-hr-forecast`,
  psi: `${ROOT}psi`, pm25: `${ROOT}pm25`,
};
const date = z.string().refine(value => Number.isFinite(Date.parse(value)));
const text = z.string().min(1).max(150);
const point = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) });
const period = z.object({ start: date, end: date });
const shortSchema = z.object({ code: z.literal(0), data: z.object({
  area_metadata: z.array(z.object({ name: text, label_location: point })),
  items: z.array(z.object({ timestamp: date, valid_period: period,
    forecasts: z.array(z.object({ area: text, forecast: text })) })).min(1),
}) });
const longSchema = z.object({ code: z.literal(0), data: z.object({ records: z.array(z.object({
  timestamp: date, general: z.object({ validPeriod: period, forecast: z.object({ text }) }),
})).min(1) }) });
const values = z.record(z.string(), z.number().finite().min(0).max(10000));
const airSchema = z.object({ code: z.literal(0), data: z.object({
  regionMetadata: z.array(z.object({ name: z.enum(["north", "south", "east", "west", "central"]), labelLocation: point })),
  items: z.array(z.object({ timestamp: date, readings: z.object({
    psi_twenty_four_hourly: values.optional(), pm25_one_hourly: values.optional(),
  }) })).min(1),
}) });

// Public responses only: cache is shared across seniors and contains no chat/address data.
const cache = new Map<string, { until: number; value: unknown }>();
const pending = new Map<string, Promise<unknown>>();
async function get<T>(url: string, schema: z.ZodType<T>): Promise<T | null> {
  try {
    const existing = cache.get(url);
    if (existing && existing.until > Date.now()) return schema.parse(existing.value);
    let request = pending.get(url);
    if (!request) {
      request = (async () => {
        const response = await fetch(url, { headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(2500), redirect: "error", cache: "no-store" });
        if (!response.ok) { await response.body?.cancel(); throw new Error("unavailable"); }
        const value: unknown = await response.json();
        schema.parse(value);
        cache.set(url, { until: Date.now() + 300_000, value });
        return value;
      })();
      pending.set(url, request);
    }
    try { return schema.parse(await request); } finally { pending.delete(url); }
  } catch { return null; }
}

function refusesOutdoor(message: string): boolean {
  return /\b(?:(?:don['’]t|do not) (?:want to|feel like)|(?:stop|don['’]t|do not) (?:suggest(?:ing)?|recommend(?:ing)?|discuss(?:ing)?))\b.{0,40}\b(?:walk|walking|outdoor|outing|weather)|(?:不想|不愿|不願|别推荐|別推薦|不要推荐|不要推薦).{0,12}(?:散步|户外|戶外|活动|活動)/iu.test(message) ||
    /\b(?:not going|won't go|will not go|don't want to go|do not want to go|staying (?:home|indoors)|stay indoors|cancel(?:l?ed|l?ing)? (?:my |the )?(?:walk|outing))\b|不(?:想|会|會|打算)?(?:出门|出門|外出|去散步)|待在家|留在家/iu.test(message);
}

export function hasOutdoorPlan(message: string): boolean {
  if (/^(?:the )?(?:(?:nice|lovely|good|hot|rainy) weather|weather is (?:nice|lovely|good|hot|rainy))(?: today)?(?:,? isn['’]t it)?[.!? ]*$/iu.test(message.trim())) return false;
  if (refusesOutdoor(message)) return false;
  return /\b(?:weather|forecast|haze|psi|pm\s?2\.?5|going (?:out|outside|for a walk)|go (?:out|outside|for a walk)|head(?:ing)? (?:out|outside)|outdoor|walk(?:ing)?|jogg?ing|picnic|cycling)\b|天气|天氣|雾霾|霧霾|出门|出門|外出|散步|户外|戶外/iu.test(message);
}
function isFuturePlan(message: string): boolean {
  return /\b(?:tomorrow|next|later|tonight|this (?:morning|afternoon|evening)|on (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|at \d|in (?:\d+|an?|one|two|three|four|five|six|half)(?: a)? (?:minutes?|hours?|days?)|\d{1,2}(?::\d{2})?\s*(?:am|pm))\b|明天|后天|後天|下周|下週|今晚|早上|上午|下午|晚上|点|點|小时后|小時後|分钟后|分鐘後|\d{1,2}[:：]\d{2}|\d{4}-\d{2}-\d{2}/iu.test(message);
}
function tomorrowTarget(message: string, now: number): { start: number; end: number; departure: number | null } {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now + 86_400_000));
  const start = Date.parse(`${day}T00:00:00+08:00`);
  const clock = message.match(/\b(?:at\s+)?(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b/i) ?? message.match(/\bat\s+(\d{1,2})(?::([0-5]\d))?\b/i);
  let departure: number | null = null;
  if (clock) {
    let hour = Number(clock[1]);
    const suffix = clock[3]?.toLowerCase();
    if (suffix && hour >= 1 && hour <= 12) hour = hour % 12 + (suffix === "pm" ? 12 : 0);
    else if (suffix) hour = -1;
    if (hour >= 0 && hour < 24) departure = start + (hour * 60 + Number(clock[2] ?? 0)) * 60_000;
  }
  return { start, end: start + 86_400_000, departure };
}
export function outdoorRequest(message: string, messages: Array<{ sender: string; text: string }>): string | null {
  if (refusesOutdoor(message)) return null;
  if (hasOutdoorPlan(message)) return message;
  const previousIndex = messages.findLastIndex(item => item.sender === "trustkaki");
  const previous = messages[previousIndex]?.text ?? "";
  const original = messages.slice(0, previousIndex).findLast(item => item.sender === "senior")?.text ?? "";
  if (/^(?:Which area will you be in|您打算在哪个地区)/u.test(previous) &&
      message.length < 100 && !/\b(?:no|cancel|not going|stay(?:ing)? home)\b|不去|不出|算了|取消/iu.test(message)) {
    const timing = /\btomorrow\b|明天/iu.test(original) ? "tomorrow" :
      isFuturePlan(original) ? "later" : "";
    return `${/\p{Script=Han}/u.test(original) ? "天气" : "Weather"} ${timing}: ${message}`;
  }
  return null;
}
function fresh(timestamp: string, now: number, hours: number): boolean {
  const age = now - Date.parse(timestamp);
  return age >= -300_000 && age <= hours * 3_600_000;
}
function covers(valid: z.infer<typeof period>, time: number): boolean {
  return Date.parse(valid.start) <= time && time < Date.parse(valid.end);
}
function stamp(value: string): string {
  return new Date(value).toLocaleString("en-SG", { timeZone: "Asia/Singapore", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) + " SGT";
}
function latest<T extends { timestamp: string }>(items: T[]): T {
  return [...items].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0];
}
function namedAreas(message: string, areas: z.infer<typeof shortSchema>["data"]["area_metadata"]) {
  const aliases: Record<string, string> = { "勿洛": "Bedok", "碧山": "Bishan", "大巴窑": "Toa Payoh", "淡滨尼": "Tampines", "后港": "Hougang", "宏茂桥": "Ang Mo Kio", "榜鹅": "Punggol", "盛港": "Sengkang", "义顺": "Yishun", "兀兰": "Woodlands", "裕廊东": "Jurong East", "裕廊西": "Jurong West" };
  const normalized = Object.entries(aliases).reduce((value, [alias, name]) => value.replaceAll(alias, ` ${name} `), message);
  return areas.filter(area => new RegExp(`\\b${area.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(normalized));
}

export interface EnvironmentAdvice { reply: string; trace: AgentTrace }
export async function environmentAdvisory(message: string, homeAddress?: string | null, now = Date.now()): Promise<EnvironmentAdvice> {
  const started = performance.now();
  const chinese = /\p{Script=Han}/u.test(message);
  const [short, long, psi, pm25] = await Promise.all([
    get(SOURCES.short, shortSchema), get(SOURCES.long, longSchema),
    get(SOURCES.psi, airSchema), get(SOURCES.pm25, airSchema),
  ]);
  const areas = short?.data.area_metadata ?? [];
  let matches = namedAreas(message, areas);
  let locationSource = "message";
  if (matches.length === 0 && /\b(?:near (?:my )?home|around (?:my )?home|my neighbou?rhood)\b|家附近|住家附近/iu.test(message)) {
    matches = namedAreas(homeAddress ?? "", areas);
    locationSource = "home area explicitly requested";
  }
  const area = matches.length === 1 ? matches[0] : null;
  const tomorrow = /\btomorrow\b|明天/iu.test(message);
  const future = isFuturePlan(message);
  const evidence: Array<{ source: string; area: string; issuedAt: string; validFrom?: string; validUntil?: string; value: string }> = [];
  const parts: string[] = [];
  const missing: string[] = [];
  if (!area) {
    parts.push(chinese ? "您打算在哪个地区、什么时候外出？请提供地区名（例如 Bedok、勿洛或碧山），我才能核对当地天气与空气质量。"
      : "Which area will you be in, and when are you heading out? For example, Bedok or Bishan. I need that before giving local weather or air-quality advice.");
    if (!short) {
      missing.push("weather area lookup unavailable");
      parts.push(chinese ? "地区查询服务暂时不可用；我无法核对当地情况。" : "The weather area lookup is currently unavailable, so I couldn't check local conditions.");
    }
  } else {
    const item = short ? latest(short.data.items) : null;
    if (!future && item && fresh(item.timestamp, now, 3) && covers(item.valid_period, now)) {
      const forecast = item.forecasts.find(value => value.area === area.name)?.forecast;
      if (forecast) {
        evidence.push({ source: SOURCES.short, area: area.name, issuedAt: item.timestamp,
          validFrom: item.valid_period.start, validUntil: item.valid_period.end, value: forecast });
        parts.push(chinese ? `${area.name} 的两小时天气预报：${forecast}（有效至 ${stamp(item.valid_period.end)}）。`
          : `${area.name}: ${forecast} in the 2-hour forecast, valid until ${stamp(item.valid_period.end)}.`);
        if (/thunder/i.test(forecast)) parts.push(chinese ? "预报有雷阵雨；请考虑推迟户外活动并留在室内。" : "Thunderstorms are forecast; consider postponing outdoor activity and staying indoors.");
        else if (/rain|shower/i.test(forecast)) parts.push(chinese ? "可能下雨；请带伞并小心湿滑路面。" : "Rain is forecast; take an umbrella and watch for slippery paths.");
      } else missing.push("2-hour forecast");
    } else if (!future) missing.push("current 2-hour forecast");
    const record = long ? latest(long.data.records) : null;
    const target = tomorrowTarget(message, now);
    const longCovers = record && (target.departure !== null
      ? covers(record.general.validPeriod, target.departure)
      : Date.parse(record.general.validPeriod.start) < target.end && Date.parse(record.general.validPeriod.end) > target.start);
    if (tomorrow && record && fresh(record.timestamp, now, 24) && longCovers) {
      evidence.push({ source: SOURCES.long, area: "Singapore", issuedAt: record.timestamp,
        validFrom: record.general.validPeriod.start, validUntil: record.general.validPeriod.end, value: record.general.forecast.text });
      parts.push(chinese ? `可用的明天全国概况（可能仅涵盖部分时段）：${record.general.forecast.text}（${stamp(record.general.validPeriod.start)} 至 ${stamp(record.general.validPeriod.end)}）。这不是当地实时天气；出门前请再核对短期预报。`
        : `Available national outlook for tomorrow (may cover only part of the day): ${record.general.forecast.text}, covering ${stamp(record.general.validPeriod.start)} to ${stamp(record.general.validPeriod.end)}. This is not local live weather; check the short-term forecast before leaving.`);
      if (target.departure === null) parts.push(chinese ? "尚未确认您出门的具体时间是否在预报范围内。" : "Coverage for your exact departure time is not established.");
    } else if (future) missing.push("forecast for the intended departure time");

    // Approximate regional air reading using the nearest published region label, not street-level exposure.
    const regions = pm25?.data.regionMetadata ?? psi?.data.regionMetadata ?? [];
    const region = [...regions].sort((a, b) => {
      const distance = (p: typeof a) => (p.labelLocation.latitude - area.label_location.latitude) ** 2 + (p.labelLocation.longitude - area.label_location.longitude) ** 2;
      return distance(a) - distance(b);
    })[0]?.name;
    for (const [kind, payload, key, url] of [
      ["24-hour PSI", psi, "psi_twenty_four_hourly", SOURCES.psi],
      ["1-hour PM2.5", pm25, "pm25_one_hourly", SOURCES.pm25],
    ] as const) {
      const reading = payload ? latest(payload.data.items) : null;
      const value = region && reading?.readings[key]?.[region];
      if (reading && typeof value === "number" && fresh(reading.timestamp, now, 2)) {
        const description = `${kind}: ${value}${kind === "1-hour PM2.5" ? " µg/m³" : ""}`;
        evidence.push({ source: url, area: region!, issuedAt: reading.timestamp, value: description });
        parts.push(chinese ? `当前 ${region} 区域参考读数（非街道级）：${description}，时间 ${stamp(reading.timestamp)}。`
          : `Current ${region} regional reading (approximate, not street-level): ${description}, as of ${stamp(reading.timestamp)}.`);
        if (key === "pm25_one_hourly" && !future && value > 55) parts.push(value > 150
          ? chinese ? "按 NEA 对长者等易受影响人群的建议：未来一小时避免所有户外活动。" : "NEA advises older adults and other vulnerable people to avoid all outdoor activities for the next hour at this PM2.5 level."
          : chinese ? "按 NEA 对长者等易受影响人群的建议：未来一小时避免剧烈户外活动。" : "NEA advises older adults and other vulnerable people to avoid strenuous outdoor activities for the next hour at this PM2.5 level.");
      } else missing.push(kind);
    }
    if (future) parts.push(chinese ? "当前空气读数不能预测您稍后或明天出门时的情况；出门前请再查。" : "Current air readings do not predict conditions later or tomorrow; check again before leaving.");
    if (missing.length) parts.push(chinese ? "部分预报或空气数据暂不可用或已过期，我无法确认外出条件。" : `Unavailable or out of date: ${missing.join(", ")}. I can't confirm outdoor conditions from those data.`);
    if (evidence.length) parts.push(chinese ? "来源：data.gov.sg / NEA；空气建议：www.haze.gov.sg。" : "Source: data.gov.sg / NEA. Air-quality guidance: www.haze.gov.sg.");
  }
  const reply = parts.join("\n\n");
  return { reply, trace: {
    id: `trace_environment_${randomUUID()}`, agentId: "aac_nudge", agentName: "Outdoor Conditions Tool",
    timestamp: new Date(now).toISOString(), input: JSON.stringify({ area: area?.name ?? null, locationSource, timing: tomorrow ? "tomorrow" : future ? "future_unspecified" : "now" }),
    reasoning: "Deterministic government-data tool; no model inference, care-risk change, booking or notification.",
    output: JSON.stringify({ evidence, missing, guidance: "https://www.haze.gov.sg/", summary: reply }),
    tags: ["environment_advisory", "deterministic", "reply_selected"], durationMs: performance.now() - started,
    modelUsed: "none (government API tool)", fallback: !area || missing.length > 0,
    inputSummary: area ? `Outdoor conditions for ${area.name}; location from ${locationSource}.` : "Outdoor question; destination not established.",
    outputSummary: reply, stateChanges: [], errorMessage: null,
  } };
}
