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
  return /\b(?:(?:don['’]t|do not) (?:want to|feel like)|(?:stop|don['’]t|do not) (?:suggest(?:ing)?|recommend(?:ing)?|discuss(?:ing)?))\b.{0,40}\b(?:walk|walking|fishing|outdoor|outing|weather)|(?:不想|不愿|不願|别推荐|別推薦|不要推荐|不要推薦).{0,12}(?:散步|钓鱼|釣魚|户外|戶外|活动|活動)/iu.test(message) ||
    /\b(?:not going|won't go|will not go|don't want to go|do not want to go|staying (?:home|indoors)|stay indoors|cancel(?:l?ed|l?ing)? (?:my |the )?(?:walk|fishing trip|outing))\b|不(?:想|会|會|打算)?(?:出门|出門|外出|去散步)|待在家|留在家/iu.test(message);
}

export function hasOutdoorPlan(message: string): boolean {
  if (/^(?:the )?(?:(?:nice|lovely|good|hot|rainy) weather|weather is (?:nice|lovely|good|hot|rainy))(?: today)?(?:,? isn['’]t it)?[.!? ]*$/iu.test(message.trim())) return false;
  if (refusesOutdoor(message)) return false;
  return /\b(?:weather|forecast|air quality|haze|psi|pm\s?2\.?5|going (?:out|outside|for a walk)|go (?:out|outside|for a walk)|head(?:ing)? (?:out|outside)|outdoor|walk(?:ing)?|jogg?ing|picnic|cycling|fishing)\b|空气质量|空氣質量|天气|天氣|雾霾|霧霾|出门|出門|外出|散步|钓鱼|釣魚|户外|戶外/iu.test(message);
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
// Independent, narrow backstop for explicit current requests when semantic fields
// are omitted. History resolves a place only; it never initiates a check.
export function explicitOutdoorRequest(message: string, messages: Array<{ sender: string; text: string }>): string | null {
  if (refusesOutdoor(message) || /["“”「」]/u.test(message) ||
      /\b(?:yesterday|last week|used to|my friend|someone said|example|repeat|repeating|stop|indoors|indoor)\b|昨天|上周|例如|重复|重複/iu.test(message)) return null;
  const plan = /^(?:(?:i(?:['’]m| am|'ll| will)?|we(?:['’]re| are|'ll| will)?)\s+)?(?:going|heading|leaving|go)(?:\s+out)?\b.{0,160}\b(?:walk|jog|picnic|cycling|outdoors?)\b/iu.test(message) ||
    /^(?:我|我们|我們).{0,12}(?:去|出门|出門).{0,30}(?:散步|户外|戶外)/u.test(message);
  const question = /^(?:how(?:['’]s| is| about)|what(?:['’]s| is| about)|is (?:it|the)|any|check|can you check|please check)\b.{0,70}\b(?:weather|forecast|air(?: quality)?|hazy|haze|psi|pm2\.?5)\b/iu.test(message) ||
    /(?:天气|天氣|空气|空氣|烟霾|煙霾).{0,12}(?:怎样|怎樣|如何|吗|嗎|呢|\?)/u.test(message);
  const conditions = /\b(?:there|here|now|today|tomorrow|tonight|hazy|in|at)\b|那里|那裡|现在|現在|今天|明天/iu.test(message) &&
    /\b(?:weather|forecast|air quality|hazy|haze|psi|pm2\.?5)\b|\bair\s+(?:there|here)\b|天气|天氣|空气|空氣|烟霾|煙霾/iu.test(message);
  const explanatory = /\b(?:in general|measured|made|calculated|defined|definition|work|works|mean|means)\b|原理|定义|定義|计算|計算/iu.test(message);
  if (!plan && (!(question && conditions) || explanatory)) return null;
  if (!/\b(?:there|that area|same place)\b|那里|那裡/iu.test(message)) return message;
  for (const previous of [...messages].reverse()) {
    if (previous.sender !== "senior") continue;
    if (refusesOutdoor(previous.text)) return message;
    if (hasOutdoorPlan(previous.text) && !/["“”「」]/u.test(previous.text)) return `${message}\nPreviously stated destination and timing: ${previous.text}`;
  }
  return message;
}
function fresh(timestamp: string, now: number, hours: number): boolean {
  const age = now - Date.parse(timestamp);
  return age >= -300_000 && age <= hours * 3_600_000;
}
function covers(valid: z.infer<typeof period>, time: number): boolean {
  return Date.parse(valid.start) <= time && time < Date.parse(valid.end);
}
function chineseForecast(value: string): string {
  if (/thunder/i.test(value)) return "有雷阵雨";
  if (/rain|shower/i.test(value)) return "有雨";
  if (/partly cloudy/i.test(value)) return "局部多云";
  if (/cloudy/i.test(value)) return "多云";
  if (/hazy/i.test(value)) return "有烟霾";
  if (/fair/i.test(value)) return "晴朗";
  if (/windy/i.test(value)) return "有风";
  if (/mist/i.test(value)) return "有薄雾";
  return value;
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
  const readingsRequested = /\b(?:psi|pm\s?2\.?5|readings?|numbers?|values?)\b|读数|讀數|指数|指數|数值|數值/iu.test(message);
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
        parts.push(chinese ? `${area.name} 的最新短期预报是${chineseForecast(forecast)}。`
          : `The latest forecast for ${area.name} is ${forecast.toLowerCase()}.`);
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
      parts.push(chinese ? `明天的全国预报是${chineseForecast(record.general.forecast.text)}，不过可能只涵盖部分时段。`
        : `Tomorrow's national outlook is ${record.general.forecast.text.toLowerCase()}, though it may cover only part of the day.`);
      if (target.departure === null) parts.push(chinese ? "还不能确认您出门时的天气。" : "I can't confirm the weather for your exact departure time yet.");
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
        if (readingsRequested) parts.push(chinese ? `${region} 区域的${description}，记录时间是 ${stamp(reading.timestamp)}。`
          : `The wider ${region} area's ${description}, recorded at ${stamp(reading.timestamp)}.`);
        if (key === "pm25_one_hourly" && !future && value > 55) parts.push(value > 150
          ? chinese ? "附近大区域的空气读数偏高，接下来一小时请先留在室内，避免户外活动。" : "The air reading for the wider area is high, so please avoid all outdoor activities for the next hour."
          : chinese ? "附近大区域的空气读数偏高，接下来一小时请避免剧烈户外活动，出门前再查一下。" : "The air reading for the wider area is elevated, so please avoid strenuous outdoor activities for the next hour and check again before heading out.");
        if (key === "pm25_one_hourly" && !future && value <= 55) parts.push(chinese
          ? "附近大区域最新的短期空气读数在 NEA 的正常范围内。如果晚点出门，请再查一下，情况可能会变化。"
          : "The latest short-term air reading for the wider area is in NEA's normal range. Check again if you head out later, as conditions can change.");
      } else missing.push(kind);
    }
    if (future && !missing.some(value => /forecast/.test(value))) parts.push(chinese ? "现在的空气读数不能预测您出门时的情况，出门前请再查一下。" : "Today's air readings don't tell us what it will be like when you leave, so check again before heading out.");
    if (missing.some(value => /forecast/.test(value))) parts.push(chinese ? "我暂时查不到适合您出门时间的最新预报，请出门前再核对一下。" : "I can't confirm the weather or air conditions for your departure time yet. Please check again before you go.");
    if (missing.some(value => /PSI|PM2.5/.test(value))) parts.push(chinese ? "部分空气读数暂时查不到或已过期，请出门前查看 NEA 的最新消息。" : "Some air readings are unavailable or out of date. Please check NEA's latest update before you go.");
  }
  const reply = parts.join(" ");
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
