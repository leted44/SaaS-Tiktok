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

/**
 * The account's character sheet in words (lib/ai/cast-reader). The image
 * model draws from the sheet itself; the writer's visualMotif and image
 * briefs must say the same thing, or the image model gets two descriptions.
 */
export function characterSheetLine(text: string | null | undefined): string | null {
  const t = text?.trim();
  return t
    ? `Character sheet of this account — the image every picture of it is drawn from, described:\n${t}\nWhenever the series bible (visualMotif) or an image brief shows one of these characters, describe it exactly like this — same shape, colours, face, limbs and accessories, never a variant of your own. Give them the names the brief or the account concept gives them.`
    : null;
}

/**
 * A setting inside the body, named by what the camera sees there. «Intérieur
 * du crâne» came back as bone and a row of molars around a brain: image models
 * draw the container they are given. Shared by the video and carousel writers,
 * for the image briefs and the series bible.
 */
/**
 * One place per image, never the same one twice in a row. The series bible
 * used to name ONE shared place, and every scene of a body video came back on
 * the same glowing neurons or stomach folds, one post after another. Shared by
 * the video and carousel writers, for the image briefs and the series bible.
 */
export const SETTING_VARIETY =
  "Each image has its own setting, chosen for what its line says, never the same place as the image before it: travel through the topic's world (for the body: a blood vessel, the stomach lining, the neurons, the lungs' alveoli, a single cell up close…) and step out into the everyday place the line is about when it speaks of daily life (the kitchen, the bed at night, the gym, the doctor's office), the recurring characters then in that real place.";

export const INNER_SETTING =
  "Inside the body, name the tissue and structures the camera sees there (neurons, blood vessels, alveoli, muscle fibres, the stomach lining), never the bone or cavity that encloses them (a skull, a rib cage, a mouth, a jaw): image models draw the container itself, bone and teeth, instead of what is inside it.";
