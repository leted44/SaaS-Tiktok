/**
 * A response's JSON — or, when the server did not answer with JSON (a
 * platform timeout or crash page), an `error` naming the status and the start
 * of what came back, so the admin page shows the real cause instead of a
 * generic "could not read".
 */
// Typed like Response.json(): the caller knows the shape of its own endpoint.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readJson(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    const hint = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
    return { error: `HTTP ${res.status}${hint ? ` — ${hint}` : ""}` };
  }
}
