import { createHash } from "node:crypto";
import { classifySocialIntentByRules, scoreSocialIntent, socialIntentCases } from "../src/lib/agents/evaluation/socialIntent";

// Offline only: no environment file, provider, database or production imports.
console.log(JSON.stringify({
  mode: "offline_rules_only",
  datasetSha256: createHash("sha256").update(JSON.stringify(socialIntentCases)).digest("hex"),
  splits: ["development", "held_out"].map(split => {
    const cases = socialIntentCases.filter(c => c.split === split);
    return { split, ...scoreSocialIntent(cases, cases.map(c => classifySocialIntentByRules(c.message))) };
  }),
}, null, 2));
