/**
 * The writers know a topic, never the creator's life. An invented personal
 * episode («à 10 000 abonnés, on me payait encore en crèmes») reads as a
 * confession the creator has to answer for in the comments — a worse lie than
 * a wrong statistic, because it is theirs. Shared by every writer: scripts,
 * carousels, captions and topic ideas.
 */
export const NO_INVENTED_EXPERIENCE = `- Never invent the creator's own life. You do not know them: never write, in the first person or about them, a personal anecdote, a past episode, an earning, a result, a figure of their own or a client's story («on me payait en crèmes», «j'ai perdu 10 kilos», «mes clientes me disent») unless the brief states it. Opinions and advice in the first person are fine («je te conseille», «pour moi, c'est la base»). When a personal angle would help, use a direct "you" statement or a situation the viewer recognises instead.`;

/** A hook that announces a count is a promise the reader checks. */
export const ANNOUNCED_COUNT = `- A hook or headline that announces a number of items («5 preuves», «3 erreurs») delivers exactly that many, each one clearly there.`;

/**
 * The space's "Thématique", in the creator's own words: what the account is
 * about and, often, the look of its series («organes en 3D avec un visage»).
 * Without it the writer invented its own world for each post — a woman in a
 * kitchen for an account whose whole concept is cartoon organs — and every
 * image brief followed that invention.
 */
export function accountConceptLine(concept: string | null | undefined): string | null {
  const text = concept?.trim();
  return text
    ? `Account concept, set by the creator for every post of this account: «${text}». The post fits this concept; when it describes a recurring cast, characters or visual world, the series bible (visualMotif) and every image brief are built on it rather than on a cast of your own.`
    : null;
}
