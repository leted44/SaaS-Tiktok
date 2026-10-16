"use client";

import { toast } from "sonner";
import { findWrittenScriptAction } from "@/server/actions/scripts";

/**
 * After a script request lost its connection — most often the phone put the
 * browser in the background — the server usually finishes the script anyway.
 * Look for it every 5 s for up to 3 minutes (the time a request may run) and
 * open it when it lands; say plainly when nothing came, so the creator does
 * not pay for the same script twice.
 */
export async function recoverWrittenScript(request: { topic: string; projectId?: string; since: number }, open: (found: { projectId: string; version: number; viralityScore: number }) => void): Promise<void> {
  const id = toast.loading("Connexion coupée (page quittée ?) : je vérifie si le script a été écrit…");
  const deadline = request.since + 185_000;
  while (Date.now() < deadline) {
    const res = await findWrittenScriptAction(request).catch(() => null);
    if (res?.ok && res.data) {
      toast.success(`Script prêt — viralité ${res.data.viralityScore}/100`, { id, description: "Il s'est écrit pendant que tu étais ailleurs." });
      open(res.data);
      return;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  toast.error("Le script n'a pas été retrouvé : réessaie.", { id, duration: 12000 });
}
