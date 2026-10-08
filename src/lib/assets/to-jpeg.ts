/**
 * Downscale and re-encode a phone photo as JPEG before upload.
 *
 * The slide renderer draws JPEG and PNG only, and phones hand over HEIC,
 * WebP and 12-megapixel files. Going through a canvas fixes all three: the
 * browser decodes whatever it can display, and the result is a sensible size.
 */
export async function toJpeg(file: File): Promise<File> {
  const src = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Ton navigateur ne sait pas lire ce format de photo. Essaie une photo JPEG ou PNG."));
      el.src = src;
    });
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Conversion de la photo impossible.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    if (!blob) throw new Error("Conversion de la photo impossible.");
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`, { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(src);
  }
}
