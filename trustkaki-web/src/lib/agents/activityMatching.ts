import { isOfficialActivitySource } from "@/lib/activities/sourceLinks";
import { z } from "zod";
import { ACTIVITY_CATALOGUE, type ActivityListing } from "./activityCatalogue";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
export const activityRequestSchema = z.object({
  area: z.enum(["toa_payoh", "other"]).nullable(),
  format: z.enum(["any", "group", "small_group", "one_to_one"]),
  topics: z.array(z.enum(["community", "befriending", "games", "crafts", "exercise", "other"])).max(6),
  earliestDate: day.nullable(), latestDate: day.nullable(),
  maxFeeSGD: z.number().finite().min(0).max(10000).nullable(),
  requiredLanguage: z.enum(["en", "ms", "zh", "ta"]).nullable(),
  wheelchairRequired: z.boolean(), constraintsComplete: z.boolean(),
}).strict().refine(r => !r.earliestDate || !r.latestDate || r.earliestDate <= r.latestDate);
export type ActivityRequest = z.infer<typeof activityRequestSchema>;
export interface ActivityMatch {
  status: "matched" | "clarify_area" | "clarify_constraints" | "no_match";
  ids: string[];
  text: string;
}
export const ACTIVITY_QUESTIONS = {
  areaEnglish: "Which area would you like activity suggestions for? My current catalogue covers only a few Toa Payoh options.",
  areaChinese: "您想在哪个地区寻找活动？目前我只有少量大巴窑资料。",
  constraintsEnglish: "What kind of activity would you like? Please include any date, budget, language or access needs; my current catalogue covers only a few Toa Payoh options.",
  constraintsChinese: "您想找什么类型的活动？如果有日期、费用、语言或无障碍需求，也请告诉我；目前我只能查阅少量大巴窑资料。",
} as const;
export type ActivityQuestion = typeof ACTIVITY_QUESTIONS[keyof typeof ACTIVITY_QUESTIONS];
const DISCOVERY = "https://www.onepa.gov.sg/events";
const LOCATOR = "https://www.aic.sg/Care-Services/Active-Ageing-Centres";
const WEEK = 7 * 24 * 60 * 60 * 1000;
function reviewed(listing: ActivityListing, now: Date): boolean {
  const age = now.getTime() - Date.parse(listing.checkedAt);
  return listing.status === "reviewed" && Number.isFinite(age) && age >= 0 && age <= WEEK && isOfficialActivitySource(listing.sourceUrl);
}
const dateText = (value: string, chinese: boolean) => new Date(value).toLocaleDateString(chinese ? "zh-SG" : "en-SG", {
  day: "numeric", month: chinese ? "long" : "short", year: "numeric", timeZone: "Asia/Singapore",
});
function matches(listing: ActivityListing, request: ActivityRequest, age: number, now: Date): boolean {
  if (!reviewed(listing, now) || listing.area !== request.area) return false;
  if (listing.minimumAge !== null && (!Number.isFinite(age) || age < listing.minimumAge)) return false;
  if (request.topics.length && !request.topics.some(topic => listing.topics.includes(topic))) return false;
  if (request.format !== "any" && listing.format !== request.format) return false;
  if (request.maxFeeSGD !== null && (listing.feeSGD === null || listing.feeSGD > request.maxFeeSGD)) return false;
  if (request.requiredLanguage && listing.language !== request.requiredLanguage) return false;
  if (request.wheelchairRequired && listing.wheelchairAccessible !== true) return false;
  if (listing.kind === "event") {
    if (!listing.startsAt || !listing.endsAt || !listing.venue) return false;
    const start = Date.parse(listing.startsAt), end = Date.parse(listing.endsAt);
    // Never offer an event already underway, or an invalid/reversed interval.
    if (!Number.isFinite(start) || !Number.isFinite(end) || start <= now.getTime() || end <= start) return false;
    const localDay = new Date(start + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (request.earliestDate && localDay < request.earliestDate || request.latestDate && localDay > request.latestDate) return false;
  } else if (request.earliestDate || request.latestDate) return false;
  return true;
}
function formatListing(listing: ActivityListing, chinese: boolean): string {
  const checked = dateText(listing.checkedAt, chinese);
  if (listing.kind === "service_enquiry") return chinese
    ? `${listing.title} — 仅供咨询。Care Corner 提供电话关怀及家访服务；请向中心确认服务范围、资格、费用、语言及安排。\n来源：${listing.sourceUrl}（页面查阅：${checked}）`
    : `${listing.title} — Enquiry only. Care Corner describes telephone befriending and home visits; ask the centre about catchment, eligibility, fees, language and arrangements.\nSource: ${listing.sourceUrl} (page checked ${checked})`;
  const start = new Date(listing.startsAt!), end = new Date(listing.endsAt!);
  const time = (date: Date) => date.toLocaleTimeString(chinese ? "zh-SG" : "en-SG", {
    hour: "numeric", minute: "2-digit", hour12: !chinese, timeZone: "Asia/Singapore",
  }).replace(/\s+/g, " ").toLowerCase();
  return chinese
    ? `${listing.title} — ${dateText(listing.startsAt!, true)}，${time(start)}–${time(end)}（新加坡时间）；${listing.venue}。符合您希望在大巴窑了解社区活动的要求。费用与名额请向主办方确认；语言、无障碍设施及小组人数尚未确认。\n来源：${listing.sourceUrl}（页面查阅：${checked}）`
    : `${listing.title} — ${dateText(listing.startsAt!, false)}, ${time(start)}–${time(end)} SGT; ${listing.venue}. Fits your request to explore community activities in Toa Payoh. Fee and places: check with organiser; language, accessibility and small-group size are unconfirmed.\nSource: ${listing.sourceUrl} (page checked ${checked})`;
}
export function matchActivities(
  input: unknown,
  options: { age: number; chinese: boolean; now?: Date },
  catalogue: readonly ActivityListing[] = ACTIVITY_CATALOGUE,
): ActivityMatch {
  const { chinese, age } = options, now = options.now ?? new Date();
  const parsed = activityRequestSchema.safeParse(input);
  if (!parsed.success || !parsed.data.constraintsComplete) return { status: "clarify_constraints", ids: [], text: chinese ? ACTIVITY_QUESTIONS.constraintsChinese : ACTIVITY_QUESTIONS.constraintsEnglish };
  const request = parsed.data;
  if (!request.area) return { status: "clarify_area", ids: [], text: chinese ? ACTIVITY_QUESTIONS.areaChinese : ACTIVITY_QUESTIONS.areaEnglish };
  const seen = new Set<string>();
  const selected = catalogue.filter(listing => {
    if (seen.has(listing.id) || !matches(listing, request, age, now)) return false;
    seen.add(listing.id); return true;
  }).slice(0, 2);
  if (!selected.length) return { status: "no_match", ids: [], text: chinese
    ? `目前没有足够新、且已确认符合您要求的资料；这不代表当地没有活动。可查阅 onePA：${DISCOVERY}，或向附近活跃乐龄中心咨询：${LOCATOR}。我没有代您报名或联系任何人。`
    : `I don't have a recently checked option with confirmed details matching your requirements. This doesn't mean none exist. Explore onePA: ${DISCOVERY}, or ask a nearby AAC: ${LOCATOR}. I haven't booked anything or contacted anyone.` };
  return { status: "matched", ids: selected.map(listing => listing.id), text: (chinese
    ? "这里有可供了解的资料，并非实时名额查询：\n\n"
    : "Here are options to explore from a small curated catalogue, not a live availability search:\n\n") +
    selected.map(listing => formatListing(listing, chinese)).join("\n\n") + (chinese
      ? "\n\n页面资料并非主办方确认；请先确认是否适合您。我没有代您报名或联系任何人。"
      : "\n\nPage information isn't organiser confirmation; check suitability before attending. I haven't booked anything or contacted anyone.") };
}
