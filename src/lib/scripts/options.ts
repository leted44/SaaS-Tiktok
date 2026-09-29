/**
 * The settings a script is written with, shared by every entry point that
 * writes one — the dashboard's quick create and the script generator page —
 * so both offer the same choices and send the AI the same brief.
 */

/** "general" lets the AI read the niche from the topic, rather than forcing one that does not fit it. */
export const AUTO_NICHE = "general";
export const NICHES = ["Finance", "Fitness", "Santé", "Nutrition", "Tech", "Business", "Marketing", "Motivation", "Développement personnel", "Éducation", "Beauté", "Cuisine", "Voyage", "Gaming", "Immobilier", "Parentalité", "Psychologie"];

export const HOOK_STYLES = [
  { id: "auto", label: "Laisser l'IA décider" },
  { id: "question", label: "Question" },
  { id: "bold-claim", label: "Affirmation forte" },
  { id: "curiosity-gap", label: "Vide de curiosité" },
  { id: "story", label: "Ouverture narrative" },
  { id: "statistic", label: "Statistique choc" },
] as const;
export type HookStyle = (typeof HOOK_STYLES)[number]["id"];

export const CTA_GOALS = [
  { id: "follow", label: "Inciter à suivre" },
  { id: "comment", label: "Inciter à commenter" },
  { id: "share", label: "Inciter à partager" },
  { id: "link", label: "Lien en bio" },
  { id: "none", label: "Aucun CTA" },
] as const;
export type CtaGoal = (typeof CTA_GOALS)[number]["id"];

export const LANGUAGES: [string, string][] = [["fr", "Français"], ["en", "Anglais"], ["es", "Espagnol"], ["de", "Allemand"], ["pt", "Portugais"], ["it", "Italien"], ["nl", "Néerlandais"], ["ja", "Japonais"]];
