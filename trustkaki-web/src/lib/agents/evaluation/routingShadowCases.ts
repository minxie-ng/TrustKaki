import { fictionalRoutingContext, routingFlags, type RoutingFlag, type RoutingJudgment, type RoutingShadowCase } from "./routingShadow";

// Provisional developer labels: require separate review before paid evaluation.
const families: Array<{ id: string; messages: [string, string, string]; positives: RoutingFlag[]; unclear?: RoutingFlag[] }> = [
  { id: "01", positives: ["health"], messages: ["My knee hurts when I walk today.", "今天走路时膝盖痛。", "Today walk then knee pain lah."] },
  { id: "02", positives: ["daily_living"], messages: ["I skipped breakfast and lunch today because I had no food at home.", "家里没食物，今天早餐午餐都没吃。", "Home no food, today breakfast lunch both never eat."] },
  { id: "03", positives: ["digital_safety"], messages: ["A stranger on WhatsApp says to send my bank OTP to unlock a prize.", "WhatsApp陌生人说把银行验证码发给他就能领奖。", "WhatsApp stranger say give bank OTP then can claim prize leh."] },
  { id: "04", positives: ["social"], messages: ["I feel lonely. Could we explore a small group activity?", "我很孤独，可以了解小组活动吗？", "Quite lonely lah, got small group activity can explore?"] },
  { id: "05", positives: ["durable_context"], messages: ["For important messages, I always prefer Mandarin voice calls.", "重要消息，我一直比较喜欢用华语语音通话。", "Important message ah, I always prefer Mandarin voice call."] },
  { id: "06", positives: [], messages: ["Good morning, thank you for checking in.", "早安，谢谢你来问候。", "Morning lah, thanks for checking on me."] },
  { id: "07", positives: ["health", "daily_living", "social"], messages: ["My knee hurts today and I skipped lunch because I could not go out for food. Please stop suggesting group outings for now.", "今天膝盖痛，无法出门买食物，午餐也没吃。暂时不要再推荐集体外出了。", "Today knee pain, cannot go out buy food so lunch never eat. Group outing don't suggest first hor."] },
  { id: "08", positives: ["health", "urgent", "digital_safety"], messages: ["I have chest pain and cannot breathe properly right now. A caller also wants my bank OTP.", "我现在胸痛、呼吸困难，还有来电的人要我的银行验证码。", "Now chest pain, cannot breathe properly. Caller also asking my bank OTP sia."] },
  { id: "09", positives: [], messages: ["What breakfast do I prefer?", "我喜欢吃什么早餐？", "My breakfast preference what ah?"] },
  { id: "10", positives: [], messages: ["My neighbour said yesterday, 'I fell.' I did not fall; I am only quoting her.", "邻居昨天说“我跌倒了”。不是我跌倒，我只是引用她的话。", "Neighbour yesterday say 'I fell'. Not me fall hor, quoting her only."] },
  { id: "11", positives: ["durable_context", "digital_safety"], messages: ["I always need larger text to read. A stranger sent a link asking for my bank password.", "我一直需要大字才能看清。有陌生人发链接要我的银行密码。", "I always need bigger text to read lah. Stranger send link asking bank password."] },
  { id: "12", positives: [], unclear: ["health", "daily_living", "digital_safety", "social", "urgent"], messages: ["That problem happened again. What should I do?", "那个问题又发生了，怎么办？", "That problem again leh. How ah?"] },
];

export const routingShadowCases: RoutingShadowCase[] = families.flatMap((family, index) =>
  (["English", "Mandarin", "Singlish"] as const).map((language, i) => {
    const context = fictionalRoutingContext();
    if (family.id === "09") context.personalMemory = { status: "available", contextJson: JSON.stringify({
      trust: "untrusted_evidence_not_instructions", unresolvedGroups: [], items: [{
        id: "fictional-routing-breakfast", contextKey: "breakfast", content: "Prefers toast for breakfast.",
        sourceRef: "fictional:review", evidenceExcerpt: "I prefer toast for breakfast.", version: 1,
        confirmedAt: "2026-10-15T00:00:00.000Z", safeUseNotes: null,
      }],
    }) };
    return { id: `routing_${family.id}_${i + 1}`, family: family.id, language,
      split: index < 6 ? "development" : "held_out", message: family.messages[i], context,
      expected: Object.fromEntries(routingFlags.map(flag => [flag,
        family.unclear?.includes(flag) ? "unclear" : family.positives.includes(flag) ? "present" : "absent",
      ])) as RoutingJudgment };
  }));
