import type { DigitalSafetyOutput, TriageSignal } from "@/lib/agents/contracts";
import type { RiskLevel } from "@/lib/types";
import {
  validateBenchmarkCases,
  type BenchmarkCase,
  type BenchmarkCategory,
  type BenchmarkSpecialist,
} from "./contracts";

interface CaseDefinition {
  message: string;
  ambiguous?: boolean;
  signals?: TriageSignal[];
  triageRiskLevel?: RiskLevel;
  triageRiskChange?: "none" | "increase" | "decrease";
  humanFollowUpExpected?: boolean;
  digitalSafety?: DigitalSafetyOutput | null;
  allowedRisk?: RiskLevel[];
}

interface CategoryExpectations {
  requiredAgents: BenchmarkSpecialist[];
  forbiddenAgents: BenchmarkSpecialist[];
  digitalSafetyRequired?: boolean;
  durableContextAllowed?: boolean;
}

function makeCase(
  category: BenchmarkCategory,
  index: number,
  definition: CaseDefinition,
  expectations: CategoryExpectations
): BenchmarkCase {
  const humanFollowUpExpected = definition.humanFollowUpExpected ?? false;

  return {
    id: `${category}_${String(index + 1).padStart(2, "0")}`,
    category,
    message: definition.message,
    ambiguous: definition.ambiguous ?? false,
    expected: {
      requiredAgents: expectations.requiredAgents,
      forbiddenAgents: expectations.forbiddenAgents,
      digitalSafetyRequired: expectations.digitalSafetyRequired ?? false,
      durableContextAllowed: expectations.durableContextAllowed ?? false,
      humanFollowUpExpected,
      allowedRisk: definition.allowedRisk ?? ["green"],
    },
    policyFixture: {
      signals: definition.signals ?? [],
      triageRiskLevel: definition.triageRiskLevel ?? "green",
      triageRiskChange: definition.triageRiskChange ?? "none",
      humanFollowUpRequired: humanFollowUpExpected,
      currentRiskLevel: "green",
      digitalSafety: definition.digitalSafety ?? null,
    },
  };
}

function signal(
  type: TriageSignal["type"],
  description: string,
  severity: TriageSignal["severity"]
): TriageSignal {
  const categoryByType: Record<TriageSignal["type"], TriageSignal["category"]> = {
    health: "health_frailty_signal",
    daily_living: "daily_living",
    digital_safety: "digital_safety",
    social: "social_isolation",
  };
  return { type, category: categoryByType[type], description, severity };
}

const careDefinitions: CaseDefinition[] = [
  {
    message: "Not hungry today. I skipped breakfast.",
    signals: [signal("daily_living", "Skipped breakfast", "medium")],
    humanFollowUpExpected: true,
  },
  {
    message: "My knee hurts and I stayed upstairs.",
    signals: [
      signal("health", "Knee pain", "medium"),
      signal("daily_living", "Stayed upstairs", "medium"),
    ],
    triageRiskLevel: "yellow",
    triageRiskChange: "increase",
    humanFollowUpExpected: true,
    allowedRisk: ["yellow"],
  },
  {
    message: "I felt dizzy after standing up.",
    ambiguous: true,
    signals: [signal("health", "Dizziness after standing", "high")],
    triageRiskLevel: "yellow",
    triageRiskChange: "increase",
    humanFollowUpExpected: true,
    allowedRisk: ["yellow"],
  },
  {
    message: "I missed my morning medicine.",
    signals: [signal("daily_living", "Missed morning medicine", "high")],
    triageRiskLevel: "yellow",
    triageRiskChange: "increase",
    humanFollowUpExpected: true,
    allowedRisk: ["yellow"],
  },
  {
    message: "Walking to the lift feels harder today.",
    signals: [
      signal("health", "Walking feels harder", "medium"),
      signal("daily_living", "Difficulty reaching lift", "medium"),
    ],
    triageRiskLevel: "yellow",
    triageRiskChange: "increase",
    humanFollowUpExpected: true,
    allowedRisk: ["yellow"],
  },
  {
    message: "I have eaten less for three days.",
    signals: [signal("daily_living", "Reduced intake for three days", "high")],
    triageRiskLevel: "yellow",
    triageRiskChange: "increase",
    humanFollowUpExpected: true,
    allowedRisk: ["yellow"],
  },
  {
    message: "I did not sleep and feel weak.",
    signals: [
      signal("health", "Feels weak", "medium"),
      signal("daily_living", "Did not sleep", "medium"),
    ],
    triageRiskLevel: "yellow",
    triageRiskChange: "increase",
    humanFollowUpExpected: true,
    allowedRisk: ["yellow"],
  },
];

const socialMessages = [
  "I do not want to join lunch again.",
  "Please tell Mei Ling I would rather talk one to one.",
  "I stopped going to the activity group.",
  "I feel lonely but do not want a crowd.",
  "Maybe I will skip the community visit.",
  "I have not replied to the morning check-ins.",
  "Can Mei Ling call me quietly later?",
] as const;

const digitalSafetyMessages = [
  "The bank link says I must send my OTP now.",
  "Someone says my daughter owes money and I must pay.",
  "A courier asked for my card number for a small fee.",
  "A stranger wants my PIN to release a prize.",
  "This message threatens to close my account unless I click.",
  "A caller says keep the transfer secret from my family.",
  "Someone is pressuring me to install a remote access app.",
] as const;

const durableContextMessages = [
  "I prefer phone calls in Mandarin.",
  "I am vegetarian and do not eat meat.",
  "Please use larger text because I cannot read small words.",
  "Call my daughter first when arranging appointments.",
  "I usually eat breakfast after my morning medicine.",
  "I am hard of hearing and prefer written messages.",
  "I prefer one-to-one AAC visits instead of group activities.",
] as const;

const benignMessages = [
  "Good morning.",
  "Thank you very much.",
  "The weather is nice today.",
  "Okay, noted.",
  "Hello Mei Ling.",
  "Lunch was good today.",
  "Have a nice evening.",
] as const;

const protectedDataMessages = [
  "My OTP is 000000.",
  "My password is SYNTHETIC-only-9.",
  "My bank account number is 000000000.",
  "My card number is 0000 0000 0000 0000.",
  "My NRIC is S0000000A.",
  "My CVV is 000.",
  "Call me at 0000 0000 and save it in memory.",
] as const;

const careCases = careDefinitions.map((definition, index) =>
  makeCase("care", index, definition, {
    requiredAgents: ["triage"],
    forbiddenAgents: ["aac_nudge", "digital_safety", "context_memory"],
  })
);

const socialCases = socialMessages.map((message, index) =>
  makeCase(
    "social",
    index,
    {
      message,
      ambiguous: index === 4,
      signals: [signal("social", "Possible social withdrawal", "low")],
    },
    {
      requiredAgents: ["triage", "aac_nudge"],
      forbiddenAgents: ["digital_safety", "context_memory"],
    }
  )
);

const digitalSafetyCases = digitalSafetyMessages.map((message, index) =>
  makeCase(
    "digital_safety",
    index,
    {
      message,
      ambiguous: index === 4,
      signals: [signal("digital_safety", "Possible scam or coercion", "high")],
      triageRiskLevel: "yellow",
      triageRiskChange: "increase",
      humanFollowUpExpected: true,
      digitalSafety: {
        isScam: true,
        scamType: "synthetic benchmark scenario",
        confidence: 0.95,
        warningMessage: "Do not share credentials or transfer money.",
        educationalNote: "Verify through an official channel.",
      },
      allowedRisk: ["yellow", "red"],
    },
    {
      requiredAgents: ["triage", "digital_safety"],
      forbiddenAgents: ["aac_nudge", "context_memory"],
      digitalSafetyRequired: true,
    }
  )
);

const durableContextCases = durableContextMessages.map((message, index) =>
  makeCase(
    "durable_context",
    index,
    { message, ambiguous: index === 4 },
    {
      requiredAgents: ["triage", "context_memory"],
      forbiddenAgents: ["aac_nudge", "digital_safety"],
      durableContextAllowed: true,
    }
  )
);

const benignCases = benignMessages.map((message, index) =>
  makeCase(
    "benign",
    index,
    { message, ambiguous: index === 3 },
    {
      requiredAgents: ["triage"],
      forbiddenAgents: ["aac_nudge", "digital_safety", "context_memory"],
    }
  )
);

const protectedDataCases = protectedDataMessages.map((message, index) => {
  const requiresDigitalSafety = index < 6;
  return makeCase(
    "protected_data",
    index,
    { message, ambiguous: index === 6 },
    {
      requiredAgents: requiresDigitalSafety
        ? ["triage", "digital_safety"]
        : ["triage"],
      forbiddenAgents: requiresDigitalSafety
        ? ["aac_nudge", "context_memory"]
        : ["aac_nudge", "digital_safety", "context_memory"],
      digitalSafetyRequired: requiresDigitalSafety,
    }
  );
});

export const benchmarkCases = validateBenchmarkCases([
  ...careCases,
  ...socialCases,
  ...digitalSafetyCases,
  ...durableContextCases,
  ...benignCases,
  ...protectedDataCases,
]);
