import { z } from "zod";

export const socialCopySchema = z.object({
  tiktok: z.string(),
  instagram: z.string(),
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
  const tags = hashtags.map((h) => `#${h}`);
  return {
    tiktok: [hook.trim(), tags.slice(0, 5).join(" ")].filter(Boolean).join(" "),
    instagram: [hook.trim(), callToAction.trim(), tags.join(" ")].filter(Boolean).join("\n\n"),
  };
}
