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
  scheduling: boolean;
  priorityRendering: boolean;
  features: string[];
  highlight?: boolean;
}

export const PLANS: Record<Plan, PlanDefinition> = {
  FREE: {
    id: "FREE",
    name: "Starter",
    tagline: "Test the studio with watermarked exports.",
    monthlyCredits: 30,
    priceMonthly: 0,
    priceYearly: 0,
    maxProjects: 5,
    maxWorkspaces: 1,
    maxSocialAccounts: 1,
    watermark: true,
    maxResolution: "720p",
    premiumVoices: false,
    scheduling: false,
    priorityRendering: false,
    features: [
      "30 credits / month",
      "AI script generator",
      "Standard AI voices",
      "Kinetic captions",
      "720p exports with watermark",
      "5 projects",
    ],
  },
  CREATOR: {
    id: "CREATOR",
    name: "Creator",
    tagline: "For solo creators posting daily.",
    monthlyCredits: 400,
    priceMonthly: 2900,
    priceYearly: 27800,
    maxProjects: -1,
    maxWorkspaces: 1,
    maxSocialAccounts: 3,
    watermark: false,
    maxResolution: "1080p",
    premiumVoices: true,
    scheduling: true,
    priorityRendering: false,
    features: [
      "400 credits / month (~30 videos)",
      "No watermark, 1080p exports",
      "Premium AI voices",
      "All caption presets",
      "Publish to TikTok, Reels & Shorts",
      "Post scheduling",
    ],
    highlight: true,
  },
  PRO: {
    id: "PRO",
    name: "Pro",
    tagline: "For serious creators & small teams.",
    monthlyCredits: 1200,
    priceMonthly: 7900,
    priceYearly: 75800,
    maxProjects: -1,
    maxWorkspaces: 3,
    maxSocialAccounts: 10,
    watermark: false,
    maxResolution: "4K",
    premiumVoices: true,
    scheduling: true,
    priorityRendering: true,
    features: [
      "1,200 credits / month (~100 videos)",
      "Everything in Creator",
      "3 brand workspaces",
      "4K exports",
      "Priority render queue",
      "10 connected social accounts",
    ],
  },
  AGENCY: {
    id: "AGENCY",
    name: "Agency",
    tagline: "For agencies managing many brands.",
    monthlyCredits: 4000,
    priceMonthly: 19900,
    priceYearly: 191000,
    maxProjects: -1,
    maxWorkspaces: -1,
    maxSocialAccounts: -1,
    watermark: false,
    maxResolution: "4K",
    premiumVoices: true,
    scheduling: true,
    priorityRendering: true,
    features: [
      "4,000 credits / month",
      "Everything in Pro",
      "Unlimited brand workspaces",
      "Unlimited social accounts",
      "Fastest render queue",
      "Priority support",
    ],
  },
};

export const PLAN_ORDER: Plan[] = ["FREE", "CREATOR", "PRO", "AGENCY"];

/** Credit cost of each billable operation. */
export const CREDIT_COSTS = {
  SCRIPT_GENERATION: 1,
  VOICEOVER_PER_30S: 2,
  RENDER_720P: 8,
  RENDER_1080P: 12,
  RENDER_4K: 24,
} as const;

export interface CreditPack {
  id: "credits_100" | "credits_500" | "credits_2000";
  credits: number;
  price: number; // cents
  label: string;
  bonus?: string;
}

export const CREDIT_PACKS: CreditPack[] = [
  { id: "credits_100", credits: 100, price: 1200, label: "100 credits" },
  { id: "credits_500", credits: 500, price: 4900, label: "500 credits", bonus: "18% off" },
  { id: "credits_2000", credits: 2000, price: 14900, label: "2,000 credits", bonus: "38% off" },
];

export function voiceoverCost(durationMs: number): number {
  return Math.max(CREDIT_COSTS.VOICEOVER_PER_30S, Math.ceil(durationMs / 30_000) * CREDIT_COSTS.VOICEOVER_PER_30S);
}

export function renderCost(plan: Plan, resolution: "720p" | "1080p" | "4K"): number {
  const allowed = PLANS[plan].maxResolution;
  const effective = clampResolution(resolution, allowed);
  if (effective === "4K") return CREDIT_COSTS.RENDER_4K;
  if (effective === "1080p") return CREDIT_COSTS.RENDER_1080P;
  return CREDIT_COSTS.RENDER_720P;
}

const RES_RANK = { "720p": 0, "1080p": 1, "4K": 2 } as const;
export function clampResolution(requested: "720p" | "1080p" | "4K", max: "720p" | "1080p" | "4K") {
  return RES_RANK[requested] > RES_RANK[max] ? max : requested;
}

export function planFromPriceId(priceId: string | null | undefined, prices: Record<string, { month: string; year: string }>): Plan | null {
  if (!priceId) return null;
  for (const [plan, p] of Object.entries(prices)) {
    if (p.month === priceId || p.year === priceId) return plan as Plan;
  }
  return null;
}
