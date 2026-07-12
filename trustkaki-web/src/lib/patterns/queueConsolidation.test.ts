import { describe, expect, it } from "vitest";
import {
  buildConsolidatedQueueEpisode,
  type QueuePatternInput,
} from "./queueConsolidation";

function pattern(
  id: string,
  type: QueuePatternInput["type"],
  firstObservedAt = "2026-07-07T08:00:00.000Z",
  latestObservedAt = "2026-07-10T08:00:00.000Z"
): QueuePatternInput {
  return {
    id,
    type,
    status: "active",
    severity: "medium",
    firstObservedAt,
    latestObservedAt,
    conciseSummary: `${type} summary`,
    recommendedAction: `${type} action`,
  };
}

describe("buildConsolidatedQueueEpisode", () => {
  it("consolidates related active patterns into one queue episode", () => {
    const episode = buildConsolidatedQueueEpisode("senior-1", [
      pattern("pattern-1", "mobility_and_frailty"),
      pattern("pattern-2", "combined_wellbeing_decline"),
    ]);

    expect(episode).toEqual(
      expect.objectContaining({
        episodeKey: "senior-1:active_pattern_episode",
        primaryPattern: expect.objectContaining({
          id: "pattern-2",
          type: "combined_wellbeing_decline",
        }),
        reason: "Mobility, appetite and routine changes across 4 days.",
        recommendedAction: "combined_wellbeing_decline action",
      })
    );
  });

  it("uses context-backed comparison when a pattern supplies one", () => {
    const episode = buildConsolidatedQueueEpisode("senior-1", [
      {
        ...pattern("pattern-1", "combined_wellbeing_decline"),
        comparison:
          "Different from known routine: Morning check-in: Usually replies before 9am.",
      },
    ]);

    expect(episode?.changeFromUsual).toBe(
      "Different from known routine: Morning check-in: Usually replies before 9am."
    );
  });

  it("keeps all related pattern ids and types linked", () => {
    const episode = buildConsolidatedQueueEpisode("senior-1", [
      pattern("pattern-1", "mobility_and_frailty"),
      pattern("pattern-2", "social_withdrawal"),
    ]);

    expect(episode?.relatedPatternIds).toEqual(["pattern-1", "pattern-2"]);
    expect(episode?.relatedPatternTypes).toEqual([
      "social_withdrawal",
      "mobility_and_frailty",
    ]);
  });

  it("does not create a queue result without open pattern inputs", () => {
    const episode = buildConsolidatedQueueEpisode("senior-1", [
      {
        ...pattern("pattern-1", "combined_wellbeing_decline"),
        status: "resolved",
      },
    ]);

    expect(episode).toBeNull();
  });
});
