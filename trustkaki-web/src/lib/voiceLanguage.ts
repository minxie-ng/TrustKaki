import { z } from "zod";

export const voiceLanguageSchema = z.enum(["en", "ms", "zh", "ta"]).nullable();
export type VoiceLanguage = z.infer<typeof voiceLanguageSchema>;
export const voiceLanguageOptions = [
  { value: "", label: "Automatic detection" },
  { value: "en", label: "English" },
  { value: "ms", label: "Malay" },
  { value: "zh", label: "Mandarin" },
  { value: "ta", label: "Tamil" },
] as const;
