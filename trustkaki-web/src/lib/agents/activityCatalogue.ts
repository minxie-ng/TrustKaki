// Manually reviewed public facts, not a live availability feed. See docs/ACTIVITY_CATALOGUE.md.
export interface ActivityListing {
  id: string;
  kind: "event" | "service_enquiry";
  title: string;
  area: "toa_payoh";
  sourceUrl: string;
  checkedAt: string;
  status: "reviewed" | "conflicted";
  topics: readonly string[];
  format: "group" | "small_group" | "one_to_one" | null;
  startsAt: string | null;
  endsAt: string | null;
  venue: string | null;
  feeSGD: number | null;
  language: "en" | "ms" | "zh" | "ta" | null;
  wheelchairAccessible: boolean | null;
  minimumAge: number | null;
}

export const ACTIVITY_CATALOGUE: readonly ActivityListing[] = [
  {
    id: "tp-east-ageing-20261114", kind: "event", title: "Toa Payoh East Active Ageing Day",
    area: "toa_payoh", sourceUrl: "https://www.onepa.gov.sg/events/toa-payoh-east-active-ageing-day-14-november-2026-s1-91948859",
    checkedAt: "2026-10-21T14:10:00+08:00", status: "reviewed", topics: ["community"],
    format: "group", startsAt: "2026-11-14T10:00:00+08:00", endsAt: "2026-11-14T13:00:00+08:00",
    venue: "Toa Payoh East CC, Multi-Purpose Hall, Level 1", feeSGD: null,
    language: null, wheelchairAccessible: null, minimumAge: null,
  },
  {
    id: "care-corner-befriending-enquiry", kind: "service_enquiry", title: "Care Corner befriending enquiry",
    area: "toa_payoh", sourceUrl: "https://www.carecorner.org.sg/services/active-ageing/",
    checkedAt: "2026-10-21T14:10:00+08:00", status: "reviewed", topics: ["befriending"],
    format: null, startsAt: null, endsAt: null, venue: null, feeSGD: null,
    language: null, wheelchairAccessible: null, minimumAge: 60,
  },
];
