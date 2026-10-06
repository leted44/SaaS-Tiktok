/**
 * The app's own image prompt, made ready to paste in the Gemini app.
 *
 * Generating there is free for the owner; importing the result back is one
 * tap. The text is exactly what the image model would get here — scene, art
 * direction, fil conducteur, framing — plus the two things the app sends
 * outside the text: the frame's shape, and the character sheet, which the
 * person attaches themselves.
 */

/** Read with the character sheet attached first — shared with the app's own image calls (lib/ai/image-generator). */
export const CAST_NOTE =
  "The first attached image is a character sheet: this account's recurring characters, on a plain background. Whenever one of them appears in the new image, draw them exactly as on the sheet — same shape, proportions, colours, face, eyes, mouth, limbs and accessories — in the pose, action and framing the description asks for. Never copy the sheet itself: not its plain background, its side-by-side lineup or its front-facing pose. Never add a character from the sheet that the description does not mention.";

const SHAPE: Record<string, string> = {
  "9:16": "vertical",
  "4:5": "vertical",
  "1:1": "square",
  "16:9": "horizontal",
  "5:4": "horizontal",
  "21:9": "wide horizontal",
};

export function geminiPrompt(prompt: string, opts: { aspect: string; cast: boolean }): string {
  return [opts.cast ? CAST_NOTE : null, prompt, `Image format: ${SHAPE[opts.aspect] ?? "vertical"}, aspect ratio ${opts.aspect}.`]
    .filter(Boolean)
    .join("\n\n");
}
