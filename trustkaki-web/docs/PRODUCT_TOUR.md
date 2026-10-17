# TrustKaki in action

[Project overview](../../README.md) · [Try TrustKaki](https://trustkaki.vercel.app) · [Judge access and scenarios](JUDGE_GUIDE.md)

**Everyday conversations → changes across days → informed human follow-up.** These screenshots show how an AAC team can review a senior's situation and inspect the AI behind it.

All people and care records shown are fictional. Captured **18 October 2026 (SGT)**; screenshots preserve the displayed UI and outputs. Click each image for its full-resolution view.

## 1. A focused care desk

[![Care desk with a senior priority list, Mr Tan's follow-up and personal context](media/care-workspace.png)](media/care-workspace.png)

| Look here | What it explains |
| --- | --- |
| **Left · senior queue** | Different seniors have distinct attention levels; staff can choose whom to review. |
| **Centre · follow-up suggested** | The case explains mobility, appetite and routine changes across four days. |
| **Green action card** | A concrete human next step: call and ask how knee pain affects meals, movement or downstairs trips. |
| **Right · What we know** | Relevant personal context and confirmation dates support a more informed check-in. |

**Business value:** bring priority, evidence and next action into one staff view. Time savings remain a pilot hypothesis, not a measured result.

## 2. Connecting observations across days

[![Four-day fictional timeline: knee discomfort, skipped breakfast, fewer downstairs trips and a missed check-in](media/four-day-pattern.png)](media/four-day-pattern.png)

| 14 October | 15 October | 16 October | 17 October |
| --- | --- | --- | --- |
| Knee pain affects movement | Skips breakfast | Avoids downstairs trips | Misses a usual check-in and declines lunch |

**Why this matters:** each update alone may look minor. Pattern Watch connects structured observations across distinct days so staff can inspect the supporting evidence. This is prepared fictional history demonstrating the workflow; it is not a diagnosis or a longitudinal field trial.

[How Pattern Watch works](ARCHITECTURE_GUIDE.md#4-messaging-check-ins-and-multi-day-patterns)

## 3. Jev routes a payment concern

[![Live fictional payment concern with Jev requesting digital safety and the specialist actually executing](media/jev-safety-routing.png)](media/jev-safety-routing.png)

| Look here | Visible evidence |
| --- | --- |
| **Left · senior message** | Someone requests a $500 transfer to sign up for a class. |
| **Right · Jev Specialist Router** | Actual model shown: `typesafe/jev-1.14-20261014`, in active routing mode. |
| **Jev requested / Actually executed** | Both show **Digital safety**, making the routing decision and execution inspectable. |
| **Left · TrustKaki reply** | Advises pausing payment, protecting personal information and verifying through trusted sources. |

This is a successful observed routing run. The precaution does not establish that the payment request is fraudulent. Application policy retains final safety authority; model routing can still fail or be wrong.

[Agent responsibilities and guardrails](AGENT_SYSTEM.md)

## 4. RAG personalisation

[![A reply using Mr Tan's saved support preferences beside two retrieved facts with source and confirmation date](media/rag-personalisation.png)](media/rag-personalisation.png)

| Look here | Visible evidence |
| --- | --- |
| **Left · support question** | “What kind of support do I usually prefer when I'm not feeling up to going out?” |
| **Right · Personal memory retrieved** | Two saved preferences: low-pressure one-to-one check-ins with Mei Ling, and simple meal support framed as practical help. |
| **Source + Confirmed** | Attribution and confirmation date accompany the retrieved facts. The source ID belongs to a fictional demo caregiver. |
| **Left · personalised reply** | The answer uses both retrieved preferences rather than giving generic support advice. |

**Reading and writing are separate.** “0 accepted, 0 rejected, 0 failed” reports new memory-write outcomes for this turn. It does not mean retrieval failed: the two supplied facts are shown above it. This capture demonstrates use of existing memory, not a newly saved fact.

[RAG storage, evidence and retrieval lifecycle](PERSONAL_MEMORY_RAG_GUIDE.md)

## Explore it yourself

Open **Explore demo** for the no-login, browser-only care walkthrough. For live AI and recorded decisions, use **Judge workspace** with the shared fictional demo account described in the [judge guide](JUDGE_GUIDE.md). Live outputs and shared history can vary.
