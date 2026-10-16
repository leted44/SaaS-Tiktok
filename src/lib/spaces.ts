import { z } from "zod";
import { TONES } from "@/lib/autopilot/template-shared";

/**
 * A brand or theme, for accounts running more than one — different
 * Instagram pages with nothing in common (different audience, tone, even
 * voice). Purely organisational: it never gates a plan or changes billing,
 * unlike the Workspace it lives under.
 */

export const SPACE_COLORS = ["#7C3AED", "#DB2777", "#F59E0B", "#10B981", "#0EA5E9", "#EF4444", "#8B5CF6", "#64748B"] as const;

export const spaceInputSchema = z.object({
  name: z.string().trim().min(1, "Donne un nom à l'espace.").max(40, "Nom trop long (40 caractères maximum)."),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  language: z.string().min(2).max(8).nullable(),
  tone: z.enum(TONES).nullable(),
  voiceId: z.string().min(1).nullable(),
  /** What the account talks about — the autopilot invents topics from it. Blank = none. */
  brief: z
    .string()
    .trim()
    .max(600, "Thématique trop longue (600 caractères maximum).")
    .nullable()
    .transform((v) => v || null),
  /** The space's Fil conducteur: its cast in words and its usual places, used by every new post. Blank = none. */
  motif: z
    .string()
    .trim()
    .max(800, "Fil conducteur trop long (800 caractères maximum).")
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null)),
  /** The character images ("Images de référence"), stored image URLs in order — one per character or group, 4 at most. Empty = none. */
  characterImages: z.array(z.string().trim().min(1).max(2000)).max(4, "4 images de référence au maximum.").optional(),
});
export type SpaceInput = z.input<typeof spaceInputSchema>;

export interface SpaceOption {
  id: string;
  name: string;
  color: string;
  language: string | null;
  tone: string | null;
  voiceId: string | null;
  brief: string | null;
  /** The space's Fil conducteur (see spaceInputSchema). */
  motif: string | null;
  /** While the space has none: its latest post's, offered to start from. */
  suggestedMotif: string | null;
  /** The sheet the AI images get (several images joined side by side). */
  characterImage: string | null;
  /** The images it was built from, shown and edited one by one. */
  characterImages: string[];
  /** Projects currently tagged with it, so deleting says what it affects. */
  projectCount: number;
}
