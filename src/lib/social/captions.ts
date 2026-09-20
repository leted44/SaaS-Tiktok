import { z } from "zod";

export type Platform = "tiktok" | "instagram";

export const socialCopySchema = z.object({
  /** Caption text only — hashtags live in their own list so copying both never duplicates them. */
  tiktok: z.string(),
  instagram: z.string(),
  // Added after the first captions shipped: rows written before this parse into
  // empty lists and fall back to the script's shared hashtags.
  hashtagsTiktok: z.array(z.string()).default([]),
  hashtagsInstagram: z.array(z.string()).default([]),
});

export type SocialCopy = z.infer<typeof socialCopySchema>;

interface FallbackInput {
  hook: string;
  callToAction: string;
  hashtags: string[];
}

/**
 * Captions for scripts written before the AI started producing them. Assembled
 * from material the script already has so every project has something to paste,
 * without spending another AI call on work the user may never look at.
 */
export function fallbackSocialCopy({ hook, callToAction, hashtags }: FallbackInput): SocialCopy {
  return {
    tiktok: hook.trim(),
    instagram: [hook.trim(), callToAction.trim()].filter(Boolean).join("\n\n"),
    hashtagsTiktok: hashtags.slice(0, 5),
    hashtagsInstagram: hashtags.slice(0, 15),
  };
}

/** Per-platform tags, falling back to the script's shared list for captions generated before the split. */
export function platformHashtags(copy: SocialCopy, platform: Platform, fallback: string[]): string[] {
  const own = platform === "tiktok" ? copy.hashtagsTiktok : copy.hashtagsInstagram;
  if (own.length) return own;
  return platform === "tiktok" ? fallback.slice(0, 5) : fallback;
}

/** Caption plus hashtags as a single block, ready to paste into the app in one go. */
export function formatForPaste(caption: string, hashtags: string[]): string {
  const tags = hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ");
  return tags ? `${caption.trim()}\n\n${tags}` : caption.trim();
}
