export interface UploadedAsset {
  id: string;
  type: "IMAGE" | "VIDEO" | "AUDIO" | "LOGO";
  name: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
}

/** 0 → 1. Reported continuously while the bytes are in flight. */
export type ProgressFn = (fraction: number) => void;

/**
 * PUT with XMLHttpRequest rather than fetch: fetch cannot report how much of a
 * request body has been sent, and an upload with no progress is the difference
 * between "this is taking a while" and "this is broken" on a phone.
 */
function putWithProgress(url: string, file: File, contentType: string, onProgress?: ProgressFn): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`L'envoi a échoué (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("L'envoi a été interrompu. Vérifiez votre connexion."));
    xhr.onabort = () => reject(new Error("Envoi annulé"));
    xhr.send(file);
  });
}

async function errorFrom(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return body.error && body.error !== "NOT_CONFIGURED" ? body.error : fallback;
}

/** Upload through the app server. Only viable for small files — see the direct path below. */
async function uploadProxied(file: File, kind: string): Promise<UploadedAsset> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("kind", kind);
  const res = await fetch("/api/assets/upload", { method: "POST", body: fd });
  if (!res.ok) throw new Error(await errorFrom(res, "Échec de l'envoi"));
  return ((await res.json()) as { asset: UploadedAsset }).asset;
}

/**
 * Send a file to storage, straight from the browser when the bucket is
 * configured for it.
 *
 * Three round trips: ask for a signature, PUT the bytes to the bucket, then
 * tell the app the object is there. The bytes never touch the app server,
 * which is what lifts the 4.5 MB cap a proxied upload runs into on Vercel and
 * halves the distance they travel. Falls back to the proxied route when the
 * server says it cannot sign (local development), so nothing breaks there.
 */
export async function uploadAsset(file: File, opts: { kind?: string; onProgress?: ProgressFn } = {}): Promise<UploadedAsset> {
  const kind = opts.kind ?? "asset";

  const signed = await fetch("/api/assets/direct", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, contentType: file.type, size: file.size, kind }),
  });

  if (signed.status === 501) return uploadProxied(file, kind);
  if (!signed.ok) throw new Error(await errorFrom(signed, "Échec de la préparation de l'envoi"));

  const { uploadUrl, key, contentType } = (await signed.json()) as { uploadUrl: string; key: string; contentType: string };
  opts.onProgress?.(0);
  await putWithProgress(uploadUrl, file, contentType, opts.onProgress);

  const confirmed = await fetch("/api/assets/direct", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, name: file.name, contentType, kind }),
  });
  if (!confirmed.ok) throw new Error(await errorFrom(confirmed, "Le fichier a été envoyé mais n'a pas pu être enregistré."));
  opts.onProgress?.(1);
  return ((await confirmed.json()) as { asset: UploadedAsset }).asset;
}
