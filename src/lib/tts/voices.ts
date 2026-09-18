export interface VoiceDefinition {
  id: string;             // internal id
  providerVoiceId: string; // ElevenLabs voice id
  name: string;
  gender: "female" | "male" | "neutral";
  accent: string;
  language: string;
  style: string;
  description: string;
  premium: boolean;
  tags: string[];
}

/**
 * Curated voice catalog. providerVoiceId values are ElevenLabs' public premade voices.
 */
export const VOICES: VoiceDefinition[] = [
  { id: "rachel", providerVoiceId: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", gender: "female", accent: "American", language: "en", style: "Calm & clear", description: "Warm narration, ideal for educational content.", premium: false, tags: ["narration", "educational"] },
  { id: "adam", providerVoiceId: "pNInz6obpgDQGcFmaJgB", name: "Adam", gender: "male", accent: "American", language: "en", style: "Deep & confident", description: "Authoritative delivery for bold claims and finance.", premium: false, tags: ["finance", "motivation"] },
  { id: "antoni", providerVoiceId: "ErXwobaYiN019PkySvjV", name: "Antoni", gender: "male", accent: "American", language: "en", style: "Friendly", description: "Conversational tone, great for storytelling.", premium: false, tags: ["story", "lifestyle"] },
  { id: "bella", providerVoiceId: "EXAVITQu4vr4xnSDxMaL", name: "Bella", gender: "female", accent: "American", language: "en", style: "Soft & youthful", description: "Gentle, relatable voice for beauty and wellness.", premium: false, tags: ["beauty", "wellness"] },
  { id: "josh", providerVoiceId: "TxGEqnHWrfWFTfGW9XjX", name: "Josh", gender: "male", accent: "American", language: "en", style: "Energetic", description: "High energy for hype and product launches.", premium: true, tags: ["hype", "product"] },
  { id: "domi", providerVoiceId: "AZnzlk1XvdvUeBnXmlld", name: "Domi", gender: "female", accent: "American", language: "en", style: "Strong & punchy", description: "Cuts through the feed. Perfect for hot takes.", premium: true, tags: ["controversial", "hot-take"] },
  { id: "arnold", providerVoiceId: "VR6AewLTigWG4xSOukaG", name: "Arnold", gender: "male", accent: "American", language: "en", style: "Crisp & fast", description: "Fast-paced delivery for listicles and facts.", premium: true, tags: ["facts", "listicle"] },
  { id: "elli", providerVoiceId: "MF3mGyEYCl7XYWbV9V6O", name: "Elli", gender: "female", accent: "American", language: "en", style: "Emotional", description: "Expressive range for emotional storytelling.", premium: true, tags: ["story", "emotional"] },
  { id: "charlotte", providerVoiceId: "XB0fDUnXU5powFXDhCwa", name: "Charlotte", gender: "female", accent: "British", language: "en", style: "Elegant", description: "Refined British accent for luxury and lifestyle.", premium: true, tags: ["luxury", "lifestyle"] },
  { id: "daniel", providerVoiceId: "onwK4e9ZLuTAKqWW03F9", name: "Daniel", gender: "male", accent: "British", language: "en", style: "Documentary", description: "Broadcast-quality narration for documentaries.", premium: true, tags: ["documentary", "history"] },
  { id: "matilda", providerVoiceId: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", gender: "female", accent: "American", language: "en", style: "Warm & upbeat", description: "Upbeat, approachable voice for tutorials.", premium: false, tags: ["tutorial", "tech"] },
  { id: "liam", providerVoiceId: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam", gender: "male", accent: "American", language: "en", style: "Young & natural", description: "Native creator voice for Gen-Z audiences.", premium: true, tags: ["genz", "trends"] },
];

export const VOICE_BY_ID = Object.fromEntries(VOICES.map((v) => [v.id, v])) as Record<string, VoiceDefinition>;

export function getVoice(id: string | null | undefined): VoiceDefinition {
  return (id && VOICE_BY_ID[id]) || VOICES[0];
}

export const VOICE_PREVIEW_TEXT = "Stop scrolling. In the next 30 seconds I'll show you the one habit that changed everything.";
