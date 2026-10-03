import type { APIError } from "@anthropic-ai/sdk";

/**
 * What a creator reads when a call to Claude fails, shared by every writer
 * (scripts, carousels, captions, topics, series).
 *
 * The raw API message used to be shown as is. When the account's prepaid
 * balance runs out — a state only the owner can fix, at
 * console.anthropic.com → Plans & Billing — that meant a customer reading
 * billing details of the app's own provider account. The cause is now logged
 * loudly for the owner, and the creator is told the plain truth: the service
 * is unavailable for the moment and nothing was lost (every generation
 * refunds its credits when it fails).
 */
export function anthropicErrorMessage(err: APIError): string {
  const text = `${err.message}`.toLowerCase();
  const creditsOut = err.status === 400 && text.includes("credit balance is too low");
  const authBroken = err.status === 401 || err.status === 403;

  if (creditsOut || authBroken) {
    console.error(
      creditsOut
        ? "[anthropic] PREPAID BALANCE EMPTY — every AI writing request fails until credits are added at console.anthropic.com → Plans & Billing."
        : `[anthropic] API key rejected (${err.status}) — check ANTHROPIC_API_KEY in Vercel.`,
    );
    return "Le service d'écriture IA est momentanément indisponible. Réessaie dans quelques minutes : tes crédits ont été remboursés.";
  }
  if (err.status === 529 || err.status === 503) return "L'IA est surchargée en ce moment. Réessaie dans une minute : tes crédits ont été remboursés.";
  return err.status ? `La requête IA a échoué (${err.status}). Réessaie dans un instant : tes crédits ont été remboursés.` : "L'IA est injoignable pour le moment. Réessaie dans un instant : tes crédits ont été remboursés.";
}
