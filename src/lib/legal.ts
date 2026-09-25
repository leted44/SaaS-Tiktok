/**
 * Identity of whoever operates this app, and the date its legal pages last
 * changed.
 *
 * French law requires a site to name its publisher, and TikTok, Meta and
 * Google all read these pages during app review — a placeholder left in one of
 * them is a rejection. Everything the three pages need sits here so it is
 * filled once, in one file, instead of hunted through three.
 *
 * Any field left empty surfaces a visible warning banner on the page itself,
 * so an unfinished page cannot quietly go live.
 */
export const legal = {
  appName: "VidiSprint",

  // ─── À COMPLÉTER AVANT LA MISE EN LIGNE ───────────────────────────────────
  /** Nom et prénom de l'éditeur (ou raison sociale une fois la société créée). */
  publisher: "Teddy Benjamin",
  /** "Entrepreneur individuel", "SASU", … */
  legalForm: "Entrepreneur individuel",
  /** SIRET, une fois le statut auto-entrepreneur créé. */
  siret: "",
  /** Adresse du siège — obligatoire dans les mentions légales. */
  address: "",
  /** Adresse e-mail de contact, publique. Utilisée aussi pour les demandes RGPD. */
  contactEmail: "vidisprint@gmail.com",
  /** Numéro de TVA intracommunautaire, si assujetti. Facultatif en franchise de TVA. */
  vatNumber: "",
  // ──────────────────────────────────────────────────────────────────────────

  /** Hébergeur — à mentionner obligatoirement en droit français. */
  host: {
    name: "Vercel Inc.",
    address: "340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis",
    url: "https://vercel.com",
  },

  /** Dernière révision des pages légales. */
  updatedAt: "2026-09-22",
} as const;

/** Champs sans lesquels les pages ne sont pas publiables en l'état. */
export const REQUIRED_LEGAL_FIELDS = ["publisher", "siret", "address", "contactEmail"] as const;

export function missingLegalFields(): string[] {
  const labels: Record<string, string> = {
    publisher: "nom de l'éditeur",
    siret: "SIRET",
    address: "adresse",
    contactEmail: "e-mail de contact",
  };
  return REQUIRED_LEGAL_FIELDS.filter((f) => !legal[f]).map((f) => labels[f]);
}

export const legalUpdatedLabel = new Date(legal.updatedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
