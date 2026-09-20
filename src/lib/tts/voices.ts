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
  { id: "rachel", providerVoiceId: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", gender: "female", accent: "Américain", language: "en", style: "Calme & claire", description: "Narration chaleureuse, idéale pour le contenu éducatif.", premium: false, tags: ["narration", "éducatif"] },
  { id: "adam", providerVoiceId: "pNInz6obpgDQGcFmaJgB", name: "Adam", gender: "male", accent: "Américain", language: "en", style: "Grave & assurée", description: "Ton autoritaire pour les affirmations fortes et la finance.", premium: false, tags: ["finance", "motivation"] },
  { id: "antoni", providerVoiceId: "ErXwobaYiN019PkySvjV", name: "Antoni", gender: "male", accent: "Américain", language: "en", style: "Amicale", description: "Ton conversationnel, parfait pour le storytelling.", premium: false, tags: ["histoire", "lifestyle"] },
  { id: "bella", providerVoiceId: "EXAVITQu4vr4xnSDxMaL", name: "Bella", gender: "female", accent: "Américain", language: "en", style: "Douce & juvénile", description: "Voix accessible et bienveillante pour la beauté et le bien-être.", premium: false, tags: ["beauté", "bien-être"] },
  { id: "josh", providerVoiceId: "TxGEqnHWrfWFTfGW9XjX", name: "Josh", gender: "male", accent: "Américain", language: "en", style: "Énergique", description: "Haute énergie pour le hype et les lancements produit.", premium: true, tags: ["hype", "produit"] },
  { id: "domi", providerVoiceId: "AZnzlk1XvdvUeBnXmlld", name: "Domi", gender: "female", accent: "Américain", language: "en", style: "Forte & percutante", description: "Capte l'attention dans le fil. Parfaite pour les coups de gueule.", premium: true, tags: ["polémique", "coup-de-gueule"] },
  { id: "arnold", providerVoiceId: "VR6AewLTigWG4xSOukaG", name: "Arnold", gender: "male", accent: "Américain", language: "en", style: "Nette & rapide", description: "Débit rapide pour les listes et les faits.", premium: true, tags: ["faits", "liste"] },
  { id: "elli", providerVoiceId: "MF3mGyEYCl7XYWbV9V6O", name: "Elli", gender: "female", accent: "Américain", language: "en", style: "Émotionnelle", description: "Registre expressif pour le storytelling émotionnel.", premium: true, tags: ["histoire", "émotion"] },
  { id: "charlotte", providerVoiceId: "XB0fDUnXU5powFXDhCwa", name: "Charlotte", gender: "female", accent: "Britannique", language: "en", style: "Élégante", description: "Accent britannique raffiné pour le luxe et le lifestyle.", premium: true, tags: ["luxe", "lifestyle"] },
  { id: "daniel", providerVoiceId: "onwK4e9ZLuTAKqWW03F9", name: "Daniel", gender: "male", accent: "Britannique", language: "en", style: "Documentaire", description: "Narration qualité broadcast pour les documentaires.", premium: true, tags: ["documentaire", "histoire"] },
  { id: "matilda", providerVoiceId: "NihRgaLj2HWAjvZ5XNxl", name: "Matilda", gender: "female", accent: "Américain", language: "en", style: "Chaleureuse & enjouée", description: "Voix enjouée et accessible pour les tutoriels.", premium: false, tags: ["tutoriel", "tech"] },
  { id: "liam", providerVoiceId: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam", gender: "male", accent: "Américain", language: "en", style: "Jeune & naturelle", description: "Voix de créateur native pour le public Gen-Z.", premium: true, tags: ["genz", "tendances"] },
  { id: "maxime", providerVoiceId: "5Qfm4RqcAer0xoyWtoHC", name: "Maxime", gender: "male", accent: "Français", language: "fr", style: "Jeune & décontractée", description: "Voix française naturelle pour du contenu quotidien et accessible.", premium: false, tags: ["lifestyle", "quotidien"] },
  { id: "tenko", providerVoiceId: "0bKGtCCpdKSI5NjGhU3z", name: "Tenko", gender: "male", accent: "Français (Paris)", language: "fr", style: "Jeune & narrative", description: "Voix parisienne pour la narration et les contenus de personnage.", premium: false, tags: ["narration", "histoire"] },
  { id: "jeanne", providerVoiceId: "txtf1EDouKke753vN8SL", name: "Jeanne", gender: "female", accent: "Français (Paris)", language: "fr", style: "Professionnelle & captivante", description: "Voix parisienne soignée, idéale pour du contenu à forte crédibilité.", premium: true, tags: ["professionnel", "lifestyle"] },
  { id: "victoire", providerVoiceId: "O31r762Gb3WFygrEOGh0", name: "Victoire", gender: "female", accent: "Français", language: "fr", style: "Fluide & captivante", description: "Voix naturelle pour la narration et les échanges du quotidien.", premium: true, tags: ["narration", "quotidien"] },
];

export const VOICE_BY_ID = Object.fromEntries(VOICES.map((v) => [v.id, v])) as Record<string, VoiceDefinition>;

export function getVoice(id: string | null | undefined): VoiceDefinition {
  return (id && VOICE_BY_ID[id]) || VOICES[0];
}

export const LANGUAGE_LABELS: Record<string, string> = { fr: "Français", en: "Anglais", es: "Espagnol", de: "Allemand", it: "Italien", pt: "Portugais", custom: "Votre voix" };

export function languageLabel(code: string): string {
  return LANGUAGE_LABELS[code] ?? code.toUpperCase();
}

const CATALOG_ORDER = new Map(VOICES.map((v, i) => [v.id, i]));

/**
 * Stable ordering for every voice list in the app: the language being written
 * first (an English-accented voice reading French is the wrong default), then
 * the voices the current plan can actually use, then the curated catalog order.
 */
export function sortVoices(voices: VoiceDefinition[], language?: string | null, premiumAllowed = true): VoiceDefinition[] {
  const lang = language?.slice(0, 2).toLowerCase();
  const rank = (v: VoiceDefinition) => [
    lang && v.language === lang ? 0 : 1,
    (v.premium && !premiumAllowed ? 1 : 0),
    v.premium ? 1 : 0,
    CATALOG_ORDER.get(v.id) ?? 0,
  ];
  return [...voices].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
    return 0;
  });
}

export const VOICE_PREVIEW_TEXT = "Arrête de scroller. Dans les 30 prochaines secondes, je vais te montrer l'habitude qui a tout changé.";
