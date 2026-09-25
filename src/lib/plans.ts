import type { Plan } from "@prisma/client";

export type BillingInterval = "month" | "year";

export interface PlanDefinition {
  id: Plan;
  name: string;
  tagline: string;
  monthlyCredits: number;
  priceMonthly: number; // cents
  priceYearly: number;  // cents per year
  maxProjects: number;  // -1 = unlimited
  maxWorkspaces: number;
  maxSocialAccounts: number;
  watermark: boolean;
  maxResolution: "720p" | "1080p" | "4K";
  premiumVoices: boolean;
  voiceCloning: boolean;
  scheduling: boolean;
  priorityRendering: boolean;
  /** How many autopilot videos may wait in the queue at once; 0 = no autopilot. */
  autopilotQueue: number;
  features: string[];
  highlight?: boolean;
}

export const PLANS: Record<Plan, PlanDefinition> = {
  FREE: {
    id: "FREE",
    name: "Découverte",
    tagline: "Testez le studio avec des exports filigranés.",
    monthlyCredits: 30,
    priceMonthly: 0,
    priceYearly: 0,
    maxProjects: 5,
    maxWorkspaces: 1,
    maxSocialAccounts: 1,
    watermark: true,
    maxResolution: "720p",
    premiumVoices: false,
    voiceCloning: false,
    scheduling: false,
    priorityRendering: false,
    autopilotQueue: 0,
    features: [
      "30 crédits offerts à l'inscription (~2 vidéos d'essai)",
      "Générateur de script IA",
      "Voix IA standard",
      "Sous-titres dynamiques",
      "Exports 720p avec filigrane",
      "5 projets",
    ],
  },
  STARTER: {
    id: "STARTER",
    name: "Starter",
    tagline: "Pour débuter sérieusement, trois vidéos par semaine.",
    monthlyCredits: 210,
    priceMonthly: 1200,
    priceYearly: 11500,
    maxProjects: -1,
    maxWorkspaces: 1,
    maxSocialAccounts: 1,
    watermark: false,
    maxResolution: "1080p",
    premiumVoices: false,
    voiceCloning: false,
    scheduling: false,
    priorityRendering: false,
    autopilotQueue: 0,
    features: [
      "210 crédits / mois (~12 vidéos)",
      "Sans filigrane, exports 1080p",
      "Générateur de script IA, descriptions et hashtags",
      "Voix IA standard",
      "Sous-titres dynamiques",
      "Projets illimités",
    ],
  },
  CREATOR: {
    id: "CREATOR",
    name: "Créateur",
    tagline: "Pour les créateurs solo qui publient chaque jour.",
    monthlyCredits: 510,
    priceMonthly: 2900,
    priceYearly: 27800,
    maxProjects: -1,
    maxWorkspaces: 1,
    maxSocialAccounts: 3,
    watermark: false,
    maxResolution: "1080p",
    premiumVoices: true,
    voiceCloning: false,
    scheduling: true,
    priorityRendering: false,
    autopilotQueue: 0,
    features: [
      "510 crédits / mois (~30 vidéos)",
      "Sans filigrane, exports 1080p",
      "Voix IA premium",
      "Tous les styles de sous-titres",
      "Publication sur TikTok, Reels & Shorts",
      "Programmation des publications",
    ],
    highlight: true,
  },
  PRO: {
    id: "PRO",
    name: "Pro",
    tagline: "Pour les créateurs confirmés et petites équipes.",
    monthlyCredits: 1700,
    priceMonthly: 7900,
    priceYearly: 75800,
    maxProjects: -1,
    maxWorkspaces: 3,
    maxSocialAccounts: 10,
    watermark: false,
    maxResolution: "4K",
    premiumVoices: true,
    voiceCloning: true,
    scheduling: true,
    priorityRendering: true,
    autopilotQueue: 30,
    features: [
      "1 700 crédits / mois (~100 vidéos en 1080p)",
      "Tout ce qui est inclus dans Créateur",
      "Clonez votre propre voix (IA)",
      "3 espaces de marque",
      "Exports 4K",
      "Pilote automatique : vidéos écrites, montées et livrées à l'heure choisie",
      "File de rendu prioritaire",
      "10 comptes sociaux connectés",
    ],
  },
  AGENCY: {
    id: "AGENCY",
    name: "Agence",
    tagline: "Pour les agences qui gèrent plusieurs marques.",
    monthlyCredits: 4000,
    priceMonthly: 19900,
    priceYearly: 191000,
    maxProjects: -1,
    maxWorkspaces: -1,
    maxSocialAccounts: -1,
    watermark: false,
    maxResolution: "4K",
    premiumVoices: true,
    voiceCloning: true,
    scheduling: true,
    priorityRendering: true,
    autopilotQueue: 200,
    features: [
      "4 000 crédits / mois (~235 vidéos en 1080p)",
      "Tout ce qui est inclus dans Pro",
      "Pilote automatique étendu (200 vidéos en file)",
      "Clonage vocal illimité",
      "Espaces de marque illimités",
      "Comptes sociaux illimités",
      "File de rendu la plus rapide",
      "Support prioritaire",
    ],
  },
};

export const PLAN_ORDER: Plan[] = ["FREE", "STARTER", "CREATOR", "PRO", "AGENCY"];

/** FREE's credits are a one-off welcome grant, never refilled — unlike every paid plan's. */
export function creditAllowanceLabel(plan: PlanDefinition): string {
  return plan.priceMonthly === 0 ? `${plan.monthlyCredits} crédits offerts à l'inscription` : `${plan.monthlyCredits.toLocaleString("fr-FR")} crédits / mois`;
}

/** Credit cost of each billable operation. */
export const CREDIT_COSTS = {
  SCRIPT_GENERATION: 1,
  SOCIAL_COPY: 1,
  VOICEOVER_PER_30S: 2,
  RENDER_720P: 8,
  RENDER_1080P: 12,
  RENDER_4K: 24,
  VOICE_CLONE: 50,
  // No voice and no video render: a few still images, so a fraction of a video's price.
  CAROUSEL: 2,
} as const;

export interface CreditPack {
  id: "credits_100" | "credits_500" | "credits_2000";
  credits: number;
  price: number; // cents
  label: string;
  bonus?: string;
}

export const CREDIT_PACKS: CreditPack[] = [
  { id: "credits_100", credits: 100, price: 1200, label: "100 crédits" },
  { id: "credits_500", credits: 500, price: 4900, label: "500 crédits", bonus: "-18%" },
  { id: "credits_2000", credits: 2000, price: 14900, label: "2 000 crédits", bonus: "-38%" },
];

export function voiceoverCost(durationMs: number): number {
  return Math.max(CREDIT_COSTS.VOICEOVER_PER_30S, Math.ceil(durationMs / 30_000) * CREDIT_COSTS.VOICEOVER_PER_30S);
}

/** Price of a resolution on its own terms — never clamped to the caller's plan, so the pricing table always shows the real cost of every tier. */
export function renderCost(resolution: "720p" | "1080p" | "4K"): number {
  if (resolution === "4K") return CREDIT_COSTS.RENDER_4K;
  if (resolution === "1080p") return CREDIT_COSTS.RENDER_1080P;
  return CREDIT_COSTS.RENDER_720P;
}

const RES_RANK = { "720p": 0, "1080p": 1, "4K": 2 } as const;
export function clampResolution(requested: "720p" | "1080p" | "4K", max: "720p" | "1080p" | "4K") {
  return RES_RANK[requested] > RES_RANK[max] ? max : requested;
}

/** ADMIN accounts bypass plan limits entirely — for internal testing, never exposed to real users. */
export function isAdmin(role: string): boolean {
  return role === "ADMIN";
}

export function effectivePlanDef(user: { plan: Plan; role: string }): PlanDefinition {
  if (!isAdmin(user.role)) return PLANS[user.plan];
  return { ...PLANS[user.plan], watermark: false, maxResolution: "4K", premiumVoices: true, voiceCloning: true, scheduling: true, priorityRendering: true, maxProjects: -1, maxSocialAccounts: -1, autopilotQueue: Math.max(PLANS[user.plan].autopilotQueue, 200) };
}

export function planFromPriceId(priceId: string | null | undefined, prices: Record<string, { month: string; year: string }>): Plan | null {
  if (!priceId) return null;
  for (const [plan, p] of Object.entries(prices)) {
    if (p.month === priceId || p.year === priceId) return plan as Plan;
  }
  return null;
}
