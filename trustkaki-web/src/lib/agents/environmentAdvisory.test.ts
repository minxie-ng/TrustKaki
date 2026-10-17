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
function mockApi(pm = 160, timestamp = issued) {
  const bodies = payloads(pm, timestamp);
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
  expect(result.reply).toContain("Bedok: Thundery Showers");
  expect(result.reply).toContain("avoid all outdoor activities for the next hour");
  expect(result.reply).toContain("approximate, not street-level");
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
  expect(home.reply).toContain("Bedok:");
});
it("rejects old readings and invalid forecast periods without reassuring the senior", async () => {
  mockApi(160, "2026-10-15T10:00:00Z");
  const { environmentAdvisory } = await import("./environmentAdvisory");
  const result = await environmentAdvisory("Weather in Bedok", null, now);
  expect(JSON.parse(result.trace.output).evidence).toHaveLength(0);
  expect(result.reply).toContain("Unavailable or out of date");
  expect(result.reply).not.toContain("Thundery Showers");
});
it("uses the national outlook for tomorrow and never applies current air advice to tomorrow", async () => {
  mockApi();
  const { environmentAdvisory } = await import("./environmentAdvisory");
  const result = await environmentAdvisory("Walk in Bedok tomorrow", null, now);
  expect(result.reply).toContain("Available national outlook for tomorrow (may cover only part of the day): Cloudy");
  expect(result.reply).toContain("do not predict conditions later or tomorrow");
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
  expect(result.reply).toContain("Bedok 的两小时");
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
  expect(result.reply).not.toContain("Bedok: Thundery Showers");
  expect(result.reply).not.toContain("avoid all outdoor activities");
  expect(result.reply).toContain("forecast for the intended departure time");
});
it("rejects tomorrow's outlook when it ends before the requested departure", async () => {
  mockApi();
  const { environmentAdvisory } = await import("./environmentAdvisory");
  const result = await environmentAdvisory("Walking in Bedok tomorrow at 8pm", null, now);
  expect(result.reply).not.toContain("Cloudy");
  expect(result.reply).toContain("forecast for the intended departure time");
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
