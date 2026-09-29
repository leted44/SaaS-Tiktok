/**
 * Stamp a JPEG with a capture date (EXIF DateTimeOriginal).
 *
 * Saving slides to a phone gives them all the same "added" second — the
 * share sheet saves every file at once — and a gallery breaks that tie in any
 * order, so Instagram's and TikTok's pickers showed slide 3 before slide 2.
 * A capture date one second apart per slide gives each its own place: galleries
 * sort photos by when they were taken, and the date written in the file wins
 * over the moment it was saved.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** EXIF's own format: "YYYY:MM:DD HH:MM:SS", in the phone's local time. */
function exifDate(d: Date): string {
  return `${d.getFullYear()}:${pad(d.getMonth() + 1)}:${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** "+02:00" — so a reader that honours offsets does not shift the date by the time zone. */
function exifOffset(d: Date): string {
  const minutes = -d.getTimezoneOffset();
  const sign = minutes >= 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/**
 * The APP1 segment: a little-endian TIFF block with IFD0 (DateTime and the
 * pointer to the Exif IFD) and the Exif IFD (DateTimeOriginal,
 * DateTimeDigitized, OffsetTimeOriginal).
 */
function exifSegment(date: Date): Uint8Array {
  const stamp = `${exifDate(date)}\0`; // 20 bytes
  const offset = `${exifOffset(date)}\0`; // 7 bytes
  const IFD0 = 8;
  const IFD0_SIZE = 2 + 2 * 12 + 4;
  const DATETIME = IFD0 + IFD0_SIZE; // 38
  const EXIF_IFD = DATETIME + 20; // 58
  const EXIF_IFD_SIZE = 2 + 3 * 12 + 4;
  const ORIGINAL = EXIF_IFD + EXIF_IFD_SIZE; // 100
  const DIGITIZED = ORIGINAL + 20;
  const OFFSET = DIGITIZED + 20;
  const tiffSize = OFFSET + 8;

  const tiff = new Uint8Array(tiffSize);
  const view = new DataView(tiff.buffer);
  const ascii = (at: number, text: string) => [...text].forEach((c, i) => (tiff[at + i] = c.charCodeAt(0)));
  const entry = (at: number, tag: number, type: number, count: number, value: number) => {
    view.setUint16(at, tag, true);
    view.setUint16(at + 2, type, true);
    view.setUint32(at + 4, count, true);
    view.setUint32(at + 8, value, true);
  };

  ascii(0, "II");
  view.setUint16(2, 42, true);
  view.setUint32(4, IFD0, true);

  view.setUint16(IFD0, 2, true);
  entry(IFD0 + 2, 0x0132, 2, 20, DATETIME); // DateTime
  entry(IFD0 + 14, 0x8769, 4, 1, EXIF_IFD); // Exif IFD pointer
  view.setUint32(IFD0 + 26, 0, true);
  ascii(DATETIME, stamp);

  view.setUint16(EXIF_IFD, 3, true);
  entry(EXIF_IFD + 2, 0x9003, 2, 20, ORIGINAL); // DateTimeOriginal
  entry(EXIF_IFD + 14, 0x9004, 2, 20, DIGITIZED); // DateTimeDigitized
  entry(EXIF_IFD + 26, 0x9011, 2, 7, OFFSET); // OffsetTimeOriginal
  view.setUint32(EXIF_IFD + 38, 0, true);
  ascii(ORIGINAL, stamp);
  ascii(DIGITIZED, stamp);
  ascii(OFFSET, offset);

  const header = [0x45, 0x78, 0x69, 0x66, 0, 0]; // "Exif\0\0"
  const length = 2 + header.length + tiff.length;
  const segment = new Uint8Array(2 + length);
  segment.set([0xff, 0xe1, length >> 8, length & 0xff, ...header]);
  segment.set(tiff, 4 + header.length);
  return segment;
}

/** The same JPEG with the EXIF segment inserted after its JFIF header (or right after the start marker when there is none). */
export function withCaptureDate(jpeg: Uint8Array, date: Date): Uint8Array {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error("Not a JPEG");
  let at = 2;
  if (jpeg[2] === 0xff && jpeg[3] === 0xe0) at = 4 + ((jpeg[4] << 8) | jpeg[5]);
  const segment = exifSegment(date);
  const out = new Uint8Array(jpeg.length + segment.length);
  out.set(jpeg.subarray(0, at), 0);
  out.set(segment, at);
  out.set(jpeg.subarray(at), at + segment.length);
  return out;
}
