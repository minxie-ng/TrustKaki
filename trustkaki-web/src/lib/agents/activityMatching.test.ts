import { describe, expect, it } from "vitest";
import { ACTIVITY_CATALOGUE, type ActivityListing } from "./activityCatalogue";
import { matchActivities, type ActivityRequest } from "./activityMatching";

const now = new Date("2026-10-21T15:00:00+08:00");
const request: ActivityRequest = {
  area: "toa_payoh", format: "any", topics: [], earliestDate: null, latestDate: null,
  maxFeeSGD: null, requiredLanguage: null, wheelchairRequired: false, constraintsComplete: true,
};
const match = (overrides: Partial<ActivityRequest> = {}, records = ACTIVITY_CATALOGUE, date = now) =>
  matchActivities({ ...request, ...overrides }, { age: 76, chinese: false, now: date }, records);

describe("source-backed activity matching", () => {
  it("offers at most two traceable options with explicit uncertainty", () => {
    const result = match();
    expect(result.ids).toEqual(["tp-east-ageing-20261114", "care-corner-befriending-enquiry"]);
    expect(result.text).toContain("14 Nov 2026");
    expect(result.text).toContain("10:00 am–1:00 pm");
    expect(result.text).toContain("Fee and places: check with organiser");
    expect(result.text).toContain("21 Oct 2026");
    expect(result.text).toContain("https://www.onepa.gov.sg/events/");
    expect(result.text).toContain("Enquiry only");
    expect(result.text).not.toMatch(/I (?:have |have already )?booked|reserved for you|free event/i);
  });
  it("asks for a chosen area and never guesses from a home address", () => {
    expect(match({ area: null }).status).toBe("clarify_area");
    expect(match({ area: null }).ids).toEqual([]);
  });
  it("does not suggest a Toa Payoh listing for another area", () => {
    expect(match({ area: "other" }).ids).toEqual([]);
    expect(match({ area: "other" }).text).toContain("https://www.onepa.gov.sg/events");
  });
  it.each([
    { format: "small_group" }, { format: "one_to_one" }, { maxFeeSGD: 0 },
    { requiredLanguage: "en" }, { wheelchairRequired: true }, { topics: ["games"] },
    { topics: ["other"] }, { constraintsComplete: false },
  ] as Partial<ActivityRequest>[])("does not treat unknown attributes as satisfying %j", constraint => {
    expect(match(constraint).ids).toEqual([]);
  });
  it("distinguishes a general befriending enquiry from a booked session", () => {
    const result = match({ topics: ["befriending"] });
    expect(result.ids).toEqual(["care-corner-befriending-enquiry"]);
    expect(result.text).toContain("eligibility");
    expect(result.text).toContain("https://www.carecorner.org.sg/services/active-ageing/");
  });
  it("filters dates without assigning an unscheduled service a date", () => {
    expect(match({ latestDate: "2026-10-22" }).ids).toEqual([]);
    expect(match({ earliestDate: "2026-11-14", latestDate: "2026-11-14" }).ids).toEqual(["tp-east-ageing-20261114"]);
  });
  it("rejects invalid and reversed date ranges", () => {
    expect(match({ earliestDate: "2026-02-31" }).ids).toEqual([]);
    expect(match({ earliestDate: "2026-11-20", latestDate: "2026-11-14" }).ids).toEqual([]);
  });
  it("does not bypass service age eligibility", () => {
    expect(matchActivities({ ...request, topics: ["befriending"] }, { age: 59, chinese: false, now }).ids).toEqual([]);
  });
  it("excludes stale, future-checked, conflicted, expired and untrusted records", () => {
    for (const patch of [
      { checkedAt: "2026-10-13T00:00:00+08:00" }, { checkedAt: "2026-10-22T00:00:00+08:00" },
      { status: "conflicted" }, { endsAt: "2026-10-20T13:00:00+08:00" },
      { sourceUrl: "https://www.onepa.gov.sg.evil.test/event" },
      { sourceUrl: "http://www.onepa.gov.sg/event" },
      { sourceUrl: "https://user:password@www.onepa.gov.sg/event" },
    ] as Partial<ActivityListing>[]) {
      const records = [{ ...ACTIVITY_CATALOGUE[0], ...patch }];
      expect(matchActivities(request, { age: 76, chinese: false, now }, records).ids).toEqual([]);
    }
  });
  it("expires seven days after review and respects event end in Singapore time", () => {
    expect(match({}, ACTIVITY_CATALOGUE, new Date("2026-10-29T00:00:00+08:00")).ids).toEqual([]);
    const fresh = ACTIVITY_CATALOGUE.map(r => ({ ...r, checkedAt: "2026-11-14T09:00:00+08:00" }));
    expect(match({}, fresh, new Date("2026-11-14T13:00:00+08:00")).ids).not.toContain("tp-east-ageing-20261114");
  });
  it("formats a Mandarin explanation without inventing language availability", () => {
    const result = matchActivities(request, { age: 76, chinese: true, now });
    expect(result.text).toContain("来源");
    expect(result.text).toContain("https://www.onepa.gov.sg/events/");
    expect(result.text).not.toContain("中文活动");
  });
  it("limits results even if the catalogue grows", () => {
    expect(match({}, [...ACTIVITY_CATALOGUE, ...ACTIVITY_CATALOGUE]).ids).toHaveLength(2);
  });
});
