import sharp from "sharp";

/**
 * A slide photo cut to the band box of a content slide, before the renderer
 * draws it.
 *
 * The renderer can only centre a photo it crops, and a centred cut of a tall
 * photo loses its top: the AI images of a full-bleed carousel keep their
 * subject in the upper half and fill the lower half with plain background for
 * the headline, so after a switch from Immersive to a band template the band
 * showed chins without faces and that empty filler. The window here sits on
 * the upper part of a tall photo — where the subject of an AI image is by
 * construction, and where faces usually are in a stock photo or an upload.
 * Wider photos are cut in the centre as before.
 */
const TALL_FOCUS = 0.31;

export async function cropForBand(dataUrl: string | null, box: { width: number; height: number }): Promise<string | null> {
  if (!dataUrl) return dataUrl;
  const match = /^data:(image\/[a-z]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return dataUrl;
  try {
    const input = Buffer.from(match[2], "base64");
    const { width, height } = await sharp(input).metadata();
    if (!width || !height) return dataUrl;
    const target = box.width / box.height;
    // Already as wide as the box, or wider: the renderer's centred cut is the right one.
    if (width / height >= target) return dataUrl;
    const cropHeight = Math.round(width / target);
    const top = Math.max(0, Math.min(height - cropHeight, Math.round(height * TALL_FOCUS - cropHeight / 2)));
    const out = await sharp(input).extract({ left: 0, top, width, height: cropHeight }).jpeg({ quality: 90 }).toBuffer();
    return `data:image/jpeg;base64,${out.toString("base64")}`;
  } catch (err) {
    console.error("[band-crop] could not crop the slide photo, drawing it centred:", err instanceof Error ? err.message : err);
    return dataUrl;
  }
}
