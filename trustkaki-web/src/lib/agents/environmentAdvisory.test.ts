import { afterEach, beforeEach, expect, it, vi } from "vitest";

const now = Date.parse("2026-10-17T10:30:00Z");
const issued = "2026-10-17T10:00:00Z";
const location = { latitude: 1.32, longitude: 103.92 };
function payloads(pm = 160, timestamp = issued) {
  return {
    "two-hr-forecast": { code: 0, data: { area_metadata: [{ name: "Bedok", label_location: location }, { name: "Bishan", label_location: { latitude: 1.35, longitude: 103.84 } }],
      items: [{ timestamp, valid_period: { start: issued, end: "2026-10-17T12:00:00Z" }, forecasts: [{ area: "Bedok", forecast: "Thundery Showers" }] }] } },
    "twenty-four-hr-forecast": { code: 0, data: { records: [{ timestamp, general: { validPeriod: { start: issued, end: "2026-10-18T10:00:00Z" }, forecast: { text: "Cloudy" } } }] } },
    psi: { code: 0, data: { regionMetadata: [{ name: "east", labelLocation: location }], items: [{ timestamp, readings: { psi_twenty_four_hourly: { east: 120 } } }] } },
    pm25: { code: 0, data: { regionMetadata: [{ name: "east", labelLocation: location }], items: [{ timestamp, readings: { pm25_one_hourly: { east: pm } } }] } },
  };
}
function mockApi(pm = 160, timestamp = issued, forecast = "Thundery Showers") {
  const bodies = payloads(pm, timestamp);
  bodies["two-hr-forecast"].data.items[0].forecasts[0].forecast = forecast;
  const request = vi.fn(async (url: string) => Response.json(bodies[url.split("/").at(-1) as keyof typeof bodies]));
  vi.stubGlobal("fetch", request);
  return request;
}
beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

it("resolves a destination, uses regional guidance and records real source evidence without sending personal data", async () => {
  const request = mockApi();
  const { environmentAdvisory } = await import("./environmentAdvisory");
  const result = await environmentAdvisory("Going for a walk in Bedok", "Private address in Bishan", now);
  expect(result.reply).toContain("forecast for Bedok is thundery showers");
  expect(result.reply).toContain("avoid all outdoor activities for the next hour");
  expect(result.reply).toContain("wider area");
  const evidence = JSON.parse(result.trace.output).evidence;
  expect(evidence).toHaveLength(3);
  expect(evidence[0].validUntil).toBe("2026-10-17T12:00:00Z");
  expect(request.mock.calls.every(([url]) => /^https:\/\/api-open.data.gov.sg\/v2\/real-time\/api\/[a-z0-9-]+$/.test(url))).toBe(true);
  expect(JSON.stringify(result.trace)).not.toContain("Private address");
});
it.each([[55, false, false], [56, true, false], [150, true, false], [151, false, true]])("applies the NEA boundary for PM2.5 %s", async (value, strenuous, all) => {
  mockApi(value);
  const { environmentAdvisory } = await import("./environmentAdvisory");
  const { reply } = await environmentAdvisory("Weather in Bedok", null, now);
  expect(reply.includes("avoid strenuous outdoor")).toBe(strenuous);
  expect(reply.includes("avoid all outdoor")).toBe(all);
});
it("asks for an area rather than silently assuming the home address", async () => {
  mockApi();
  const { environmentAdvisory } = await import("./environmentAdvisory");
  const result = await environmentAdvisory("Going for a walk", "Bedok", now);
  expect(result.reply).toContain("Which area");
  expect(JSON.parse(result.trace.output).evidence).toEqual([]);
  const home = await environmentAdvisory("Going for a walk near my home", "Bedok", now);
  expect(home.reply).toContain("forecast for Bedok");
});
it("rejects old readings and invalid forecast periods without reassuring the senior", async () => {
  mockApi(160, "2026-10-15T10:00:00Z");
  const { environmentAdvisory } = await import("./environmentAdvisory");
  const result = await environmentAdvisory("Weather in Bedok", null, now);
  expect(JSON.parse(result.trace.output).evidence).toHaveLength(0);
  expect(result.reply).toContain("unavailable or out of date");
  expect(result.reply).not.toContain("Thundery Showers");
});
it("uses the national outlook for tomorrow and never applies current air advice to tomorrow", async () => {
  mockApi();
  const { environmentAdvisory } = await import("./environmentAdvisory");
  const result = await environmentAdvisory("Walk in Bedok tomorrow", null, now);
  expect(result.reply).toContain("Tomorrow's national outlook is cloudy, though it may cover only part of the day");
  expect(result.reply).toContain("don't tell us what it will be like when you leave");
  expect(result.reply).not.toContain("avoid all outdoor activities");
});
it("handles invalid API data without exposing upstream content", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ secret: "upstream content" })));
  const { environmentAdvisory } = await import("./environmentAdvisory");
  const result = await environmentAdvisory("Weather in Bedok", null, now);
  expect(result.reply).toContain("currently unavailable");
  expect(JSON.stringify(result)).not.toContain("upstream content");
});
it("handles Mandarin areas and shared public caching", async () => {
  const request = mockApi();
  const { environmentAdvisory } = await import("./environmentAdvisory");
  const result = await environmentAdvisory("我要去勿洛散步", null, now);
  expect(result.reply).toContain("Bedok 的最新短期预报是有雷阵雨");
  await environmentAdvisory("Weather in Bedok", null, now);
  expect(request).toHaveBeenCalledTimes(4);
});
it("routes short location answers, preserves future timing, and respects refusal", async () => {
  const { hasOutdoorPlan, outdoorRequest } = await import("./environmentAdvisory");
  expect(hasOutdoorPlan("I am not going outside")).toBe(false);
  expect(hasOutdoorPlan("我不想出门")).toBe(false);
  const messages = [{ sender: "senior", text: "Going for a walk tomorrow" }, { sender: "trustkaki", text: "Which area will you be in, and when are you heading out?" }];
  expect(outdoorRequest("Bedok", messages)).toContain("tomorrow: Bedok");
  expect(outdoorRequest("No, staying home", messages)).toBeNull();
});

it("does not use immediate conditions for an unsupported future time", async () => {
  mockApi();
  const { environmentAdvisory } = await import("./environmentAdvisory");
  const result = await environmentAdvisory("Walking in Bedok in three hours", null, now);
  expect(result.reply).not.toContain("forecast for Bedok is thundery showers");
  expect(result.reply).not.toContain("avoid all outdoor activities");
  expect(result.reply).toContain("conditions for your departure time");
});
it("rejects tomorrow's outlook when it ends before the requested departure", async () => {
  mockApi();
  const { environmentAdvisory } = await import("./environmentAdvisory");
  const result = await environmentAdvisory("Walking in Bedok tomorrow at 8pm", null, now);
  expect(result.reply).not.toContain("cloudy");
  expect(result.reply).toContain("conditions for your departure time");
});
it.each(["I don't want to walk in Bedok", "I don’t feel like walking in Bedok", "Stop suggesting outdoor activities", "我不想散步"])('respects refusal: %s', async message => {
  const { hasOutdoorPlan } = await import("./environmentAdvisory");
  expect(hasOutdoorPlan(message)).toBe(false);
});

it("does not reinterpret refusal as a destination after asking for an area", async () => {
  const { outdoorRequest } = await import("./environmentAdvisory");
  const messages = [{ sender: "senior", text: "Going for a walk" }, { sender: "trustkaki", text: "Which area will you be in, and when are you heading out?" }];
  expect(outdoorRequest("I don’t feel like walking in Bedok", messages)).toBeNull();
  expect(outdoorRequest("I don't want to walk in Bedok", messages)).toBeNull();
});

it("gives concise advice for the reported cloudy/elevated-air example and keeps readings in the trail", async () => {
  mockApi(139, issued, "Cloudy");
  const { environmentAdvisory } = await import("./environmentAdvisory");
  const result = await environmentAdvisory("I want to go Bedok for a walk today", null, now);
  expect(result.reply).toContain("forecast for Bedok is cloudy");
  expect(result.reply).toContain("avoid strenuous outdoor activities for the next hour");
  expect(result.reply).not.toMatch(/PSI|PM2.5|µg|SGT|street-level|NEA advises/);
  expect(result.reply).not.toContain("\n\n");
  expect(result.reply.split(/\s+/).length).toBeLessThan(65);
  const evidence = JSON.parse(result.trace.output).evidence;
  expect(evidence).toEqual(expect.arrayContaining([expect.objectContaining({ value: "1-hour PM2.5: 139 µg/m³", area: "east", issuedAt: issued })]));
});
it("still provides exact air readings when the senior asks for them", async () => {
  mockApi(139, issued, "Cloudy");
  const { environmentAdvisory } = await import("./environmentAdvisory");
  const result = await environmentAdvisory("What are the PSI and PM2.5 readings in Bedok?", null, now);
  expect(result.reply).toContain("24-hour PSI: 120");
  expect(result.reply).toContain("1-hour PM2.5: 139 µg/m³");
});

it("answers an explicit air-quality question even below the advisory threshold", async () => {
  mockApi(30, issued, "Cloudy");
  const { environmentAdvisory, hasOutdoorPlan } = await import("./environmentAdvisory");
  const question = "How is the air quality in Bedok?";
  expect(hasOutdoorPlan(question)).toBe(true);
  const result = await environmentAdvisory(question, null, now);
  expect(result.reply).toContain("NEA's normal range");
  expect(result.reply).not.toContain("µg");
  expect(result.reply).not.toMatch(/safe to|perfect|nothing to worry/);
});


it("recognises the park fishing plan and respects fishing refusals", async () => {
  const { outdoorRequest } = await import("./environmentAdvisory");
  const plan = "i want go pasir ris park do fishing today";
  expect(outdoorRequest(plan, [])).toBe(plan);
  expect(outdoorRequest("I don't want to go fishing", [])).toBeNull();
  expect(outdoorRequest("Stop suggesting fishing", [])).toBeNull();
  expect(outdoorRequest("我想去钓鱼", [])).not.toBeNull();
  expect(outdoorRequest("我不想钓鱼", [])).toBeNull();
});

// Every current outing checks air quality, even when the semantic routing query
// is a plain outing statement rather than the senior's original haze question.
it.each(["Going for a short walk in Bedok now", "Is it hazy in Bedok?"])("reports checked normal air quality for %s", async query => {
  mockApi(20, issued, "Cloudy");
  const { environmentAdvisory } = await import("./environmentAdvisory");
  const result = await environmentAdvisory(query, null, now);
  expect(result.reply).toContain("forecast for Bedok is cloudy");
  expect(result.reply).toContain("short-term air reading for the wider area is in NEA's normal range");
  expect(result.reply).not.toMatch(/no haze|safe to go/i);
  expect(JSON.parse(result.trace.output).evidence.some((entry: { source: string }) => entry.source.endsWith("/pm25"))).toBe(true);
});
