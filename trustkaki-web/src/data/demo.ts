import type {
    SeniorProfile,
    CheckInSession,
    DashboardData,
    AgentTrace,
    Message,
    AlertItem,
  } from "@/lib/types";
  
  export const uncleTan: SeniorProfile = {
    name: "Mr Tan Ah Hock",
    age: 76,
    gender: "Male",
    livingSituation: "Lives alone in 3-room HDB, Toa Payoh",
    caregiver: "Rachel (daughter)",
    aacVolunteer: "Mei Ling",
    riskLevel: "green",
    lastCheckIn: "2026-01-13T08:00:00",
  };
  
  export const demoTraces: AgentTrace[] = [
    {
      id: "t1",
      agentId: "triage",
      agentName: "Triage Agent",
      timestamp: "2026-01-14T08:01:30",
      input: 'Senior replied: "Not hungry today. Knee pain."',
      reasoning:
        "Keyword detection triggered: 'not hungry' → daily_living concern. 'knee pain' → health_frailty_signal. Combined signals suggest mild withdrawal + physical discomfort. Risk elevated from Green → Yellow.",
      output:
        "ROUTE: daily_living + health_frailty. Risk: Green → Yellow. Escalate to AAC nudge for social withdrawal check.",
      tags: ["daily_living", "health_frailty_signal", "risk_change"],
    },
    {
      id: "t2",
      agentId: "daily_living",
      agentName: "Daily Living Agent",
      timestamp: "2026-01-14T08:01:45",
      input: "Senior skipped breakfast. Reported 'not hungry today'.",
      reasoning:
        "Meal skipping is a soft signal. One instance is not critical, but combined with knee pain suggests reduced mobility may be affecting meal preparation. Flag for follow-up.",
      output:
        "Gentle nudge: ask if he'd like a simple breakfast suggestion. Note meal skip for caregiver briefing.",
      tags: ["meal_skip", "mobility_impact"],
    },
    {
      id: "t3",
      agentId: "health_frailty",
      agentName: "Health & Frailty Agent",
      timestamp: "2026-01-14T08:02:00",
      input: "Senior reported knee pain.",
      reasoning:
        "Knee pain is a frailty signal. Could affect mobility, fall risk, and daily activities. Previous check-ins did not mention pain. New symptom worth monitoring.",
      output:
        "Suggest gentle movement or rest. Flag for caregiver awareness. If pain persists 3+ days, recommend GP visit.",
      tags: ["knee_pain", "frailty_signal", "fall_risk"],
    },
    {
      id: "t4",
      agentId: "aac_nudge",
      agentName: "AAC Nudge Agent",
      timestamp: "2026-01-14T08:03:00",
      input: 'AAC volunteer Mei Ling invited Uncle Tan to community breakfast. Senior replied: "Don\'t want. Paiseh."',
      reasoning:
        "'Paiseh' (Singlish: shy/embarrassed) is a common social withdrawal signal among Singapore seniors. They may feel like a burden or uncomfortable in group settings. Needs gentle, shame-free encouragement.",
      output:
        "Nudge: reframe invitation as 'helping others' or 'we miss your coffee.' Suggest Mei Ling offer 1-on-1 walk over instead of group setting.",
      tags: ["social_withdrawal", "paiseh", "aac_engagement"],
    },
    {
      id: "t5",
      agentId: "digital_safety",
      agentName: "Digital Safety Agent",
      timestamp: "2026-01-14T08:04:00",
      input: 'Senior forwarded suspicious SMS: "SingPost: Your parcel is held. Click link to reschedule delivery: bit.ly/sp-post-fake"',
      reasoning:
        "High-risk phishing pattern: urgency + fake delivery + shortened URL. Do not make absolute claims; advise senior to pause and verify through official SingPost channels. Human-in-the-loop notification recommended.",
      output:
        "PAUSE + VERIFY: Advise Uncle Tan not to click yet. Suggest checking official SingPost app/website or asking Rachel. Offer to help report to ScamShield.",
      tags: ["phishing", "scam_alert", "singpost_impersonation"],
    },
    {
      id: "t6",
      agentId: "briefing",
      agentName: "Briefing Agent",
      timestamp: "2026-01-14T08:05:00",
      input: "Check-in session complete. All agent outputs collected.",
      reasoning:
        "Synthesise findings: 1) Meal skip + knee pain = potential mobility/frailty concern. 2) Social withdrawal ('paiseh') detected. 3) Phishing SMS intercepted. Risk level: Yellow. Rachel should be briefed on knee pain and scam attempt. Mei Ling should try 1-on-1 outreach.",
      output: "Briefing generated for Rachel (caregiver) and Mei Ling (AAC volunteer).",
      tags: ["caregiver_briefing", "aac_briefing", "session_summary"],
    },
  ];
  
  export const demoMessages: Message[] = [
    {
      id: "m1",
      sender: "trustkaki",
      text: "☀️ Good morning Uncle Tan! How are you feeling today? Have you eaten breakfast?",
      timestamp: "2026-01-14T08:00:00",
    },
    {
      id: "m2",
      sender: "senior",
      text: "Not hungry today. Knee pain.",
      timestamp: "2026-01-14T08:01:00",
    },
    {
      id: "m3",
      sender: "trustkaki",
      text: "Oh dear, your knee is hurting? 💛 Let me check in on that. Have you taken any pain relief? Would you like me to let Rachel know?",
      timestamp: "2026-01-14T08:01:45",
      agentId: "health_frailty",
    },
    {
      id: "m4",
      sender: "trustkaki",
      text: "Uncle Tan, Mei Ling from the Active Ageing Centre is hosting a community breakfast this Saturday. Would you like to join? There'll be kopi and kaya toast! ☕",
      timestamp: "2026-01-14T08:02:30",
      agentId: "aac_nudge",
    },
    {
      id: "m5",
      sender: "senior",
      text: "Don't want. Paiseh.",
      timestamp: "2026-01-14T08:03:00",
    },
    {
      id: "m6",
      sender: "trustkaki",
      text: "I understand, Uncle Tan. No pressure at all. But Mei Ling was saying she misses your stories about old Singapore. Maybe just a quick kopi, just the two of you? No need to join the big group. 😊",
      timestamp: "2026-01-14T08:03:30",
      agentId: "aac_nudge",
    },
    {
      id: "m7",
      sender: "senior",
      text: "[Forwarded SMS] SingPost: Your parcel is held at our warehouse. Click to reschedule delivery: bit.ly/sp-post-fake",
      timestamp: "2026-01-14T08:04:00",
    },
    {
      id: "m8",
      sender: "trustkaki",
      text: "⚠️ Uncle Tan, this looks risky. Please do not click the link yet. Open the official SingPost app or website to check, or ask Rachel first. I can help tell Rachel and guide you to report it to ScamShield. 🛡️",
      timestamp: "2026-01-14T08:04:15",
      agentId: "digital_safety",
    },
    {
      id: "m9",
      sender: "system",
      text: "📋 CHECK-IN COMPLETE | Risk: Yellow 🟡 | Briefing sent to Rachel & Mei Ling",
      timestamp: "2026-01-14T08:05:00",
    },
  ];
  
  export const demoAlerts: AlertItem[] = [
    {
      id: "a1",
      type: "health",
      message: "Uncle Tan reported knee pain — new symptom",
      timestamp: "2026-01-14T08:02:00",
      acknowledged: false,
    },
    {
      id: "a2",
      type: "daily_living",
      message: "Uncle Tan skipped breakfast today",
      timestamp: "2026-01-14T08:01:45",
      acknowledged: false,
    },
    {
      id: "a3",
      type: "digital_safety",
      message: "Phishing SMS detected — SingPost impersonation scam",
      timestamp: "2026-01-14T08:04:15",
      acknowledged: false,
    },
    {
      id: "a4",
      type: "social",
      message: "Social withdrawal signal — declined AAC invitation with 'paiseh'",
      timestamp: "2026-01-14T08:03:30",
      acknowledged: false,
    },
  ];
  
  export const demoSession: CheckInSession = {
    id: "session-2026-01-14-08",
    startedAt: "2026-01-14T08:00:00",
    status: "completed",
    messages: demoMessages,
    traces: demoTraces,
    riskBefore: "green",
    riskAfter: "yellow",
    summary:
      "Uncle Tan's morning check-in revealed three concerns: (1) skipped breakfast with knee pain — possible mobility affecting meal prep, (2) social withdrawal signal ('paiseh') to AAC invitation, (3) phishing SMS intercepted. Risk elevated to Yellow. Rachel notified about knee pain and scam. Mei Ling advised to try 1-on-1 outreach.",
  };
  
  export const dashboardData: DashboardData = {
    senior: { ...uncleTan, riskLevel: "yellow", lastCheckIn: "2026-01-14T08:05:00" },
    activeSessions: [demoSession],
    recentAlerts: demoAlerts,
    followUpQueue: [],
  };
  
