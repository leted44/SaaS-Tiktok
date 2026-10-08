"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Download, Loader2, ScanFace, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { uploadAsset } from "@/lib/assets/upload-client";
import { toJpeg } from "@/lib/assets/to-jpeg";
import { clearCloneAction, refreshCloneAction, startCloneAction } from "@/server/actions/clone";
import { CLONE_MAX_PHOTOS, CLONE_MIN_PHOTOS } from "@/lib/ai/clone-limits";

export interface CloneView {
  status: "training" | "ready" | "failed";
  photos: number;
  photoUrl: string;
  error: string | null;
  startedAt: string;
  readyAt: string | null;
  /** The word the model learned the person as. */
  trigger: string;
  /** The trained file is also kept in the app's storage. */
  backedUp: boolean;
}

/**
 * « Mon clone » (admin test, lib/ai/clone): the creator's photos train a model
 * of their face, then every AI image of the space shows them. The status is
 * read from fal while the page is open; nothing has to stay open for the
 * training itself to finish.
 */
export function CloneBlock({ spaceId, clone }: { spaceId: string; clone: CloneView | null }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState<{ done: number; total: number } | null>(null);
  const [state, setState] = useState(clone);

  // A clone finished but not yet copied to our storage (the copy failed or the page was closed): copy it now.
  useEffect(() => {
    if (state?.status !== "ready" || state.backedUp) return;
    let stopped = false;
    void refreshCloneAction(spaceId).then((res) => {
      if (!stopped && res.ok && res.data.clone?.loraBackupUrl) setState((s) => (s ? { ...s, backedUp: true } : s));
    });
    return () => { stopped = true; };
  }, [state?.status, state?.backedUp, spaceId]);

  // While a training runs, ask fal where it stands every 30 seconds.
  useEffect(() => {
    if (state?.status !== "training") return;
    let stopped = false;
    const check = async () => {
      const res = await refreshCloneAction(spaceId);
      if (stopped || !res.ok || !res.data.clone) return;
      const next = res.data.clone;
      if (next.status !== "training") {
        setState({ status: next.status, photos: next.photos, photoUrl: next.photoUrl, error: next.error, startedAt: next.startedAt, readyAt: next.readyAt, trigger: next.trigger, backedUp: Boolean(next.loraBackupUrl) });
        if (next.status === "ready") toast.success("Ton clone est prêt : les prochaines images IA de cet espace auront ton visage.");
        else toast.error(next.error ?? "L'entraînement a échoué.");
        router.refresh();
      }
    };
    void check();
    const t = setInterval(check, 30_000);
    return () => { stopped = true; clearInterval(t); };
  }, [state?.status, spaceId, router]);

  async function train(files: FileList) {
    const list = Array.from(files).slice(0, CLONE_MAX_PHOTOS);
    if (fileRef.current) fileRef.current.value = "";
    if (list.length < CLONE_MIN_PHOTOS) return toast.error(`Choisis au moins ${CLONE_MIN_PHOTOS} photos de toi (${list.length} choisies).`);
    if (!window.confirm(`Entraîner ton clone sur ${list.length} photos ? Environ 2 $ sur le compte fal.ai, une dizaine de minutes.`)) return;
    const urls: string[] = [];
    for (const [i, file] of list.entries()) {
      setSending({ done: i, total: list.length });
      try {
        urls.push((await uploadAsset(await toJpeg(file))).url);
      } catch (err) {
        toast.error(`${file.name} : ${err instanceof Error ? err.message : "envoi impossible"}`);
      }
    }
    setSending(null);
    const res = await startCloneAction(spaceId, urls);
    if (!res.ok) return toast.error(res.error);
    const c = res.data.clone;
    setState({ status: c.status, photos: c.photos, photoUrl: c.photoUrl, error: null, startedAt: c.startedAt, readyAt: null, trigger: c.trigger, backedUp: false });
    toast.success("Entraînement lancé. Tu peux quitter la page : il continue sans toi.");
  }

  async function clear() {
    if (!window.confirm("Supprimer ton clone ? Les images de cet espace reviendront à la fiche personnages (ou à aucune).")) return;
    const res = await clearCloneAction(spaceId);
    if (!res.ok) return toast.error(res.error);
    setState(null);
    router.refresh();
  }

  const busy = sending !== null;
  return (
    <div className="rounded-xl border border-amber-300/25 bg-amber-300/[0.06] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-200"><ScanFace className="h-3.5 w-3.5" /> Mon clone · test admin</p>
        {state && state.status !== "training" && (
          <button type="button" onClick={clear} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"><Trash2 className="h-3 w-3" /> Supprimer</button>
        )}
      </div>

      {state?.status === "training" ? (
        <p className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground"><Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> Entraînement en cours sur {state.photos} photos (une dizaine de minutes). Tu peux quitter la page.</p>
      ) : state?.status === "ready" ? (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2">
            {state.photoUrl && <img src={state.photoUrl} alt="" className="h-10 w-10 rounded-full object-cover" />}
            <p className="text-[11px] text-muted-foreground">Prêt depuis le {new Date(state.readyAt ?? state.startedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} · {state.photos} photos. Pour l&apos;utiliser : dans Visuels, test admin → « Mon clone », puis refais une scène. Les autres modèles prennent ta photo comme référence. Garde-le pour les poses simples (debout, assis, à table) ; pour les mouvements au sol, de vraies photos de toi rendent mieux.</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-2.5">
            <p className="text-[11px] font-semibold">Le récupérer pour l&apos;utiliser ailleurs</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Fichier LoRA pour FLUX.1 (fal.ai, ComfyUI, Replicate…). Il ne marche ni dans ChatGPT, ni dans Gemini, ni dans Midjourney. Mot-clé à mettre au début de chaque description :
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-white/[0.06] px-2 py-1 text-[12px]">{state.trigger}</code>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => { void navigator.clipboard?.writeText(state.trigger).then(() => toast.success("Mot-clé copié.")); }}><Copy /> Copier</Button>
            </div>
            <Button asChild size="sm" variant="secondary" className="mt-2 w-full">
              <a href={`/api/clone/${spaceId}/download`} download><Download /> Télécharger le modèle</a>
            </Button>
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              {state.backedUp ? "Une copie est gardée dans ton stockage : le clone ne disparaît pas si le lien de fal.ai expire." : "Copie dans ton stockage en cours… tant qu'elle n'est pas faite, le fichier ne vient que de fal.ai."} Le fichier contient ton visage : garde-le privé. Licence FLUX.1 [dev] : usage commercial du modèle non autorisé, images produites autorisées (à vérifier sur le site de Black Forest Labs).
            </p>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {state?.status === "failed" ? <span className="text-red-300">{state.error ?? "L'entraînement a échoué."} </span> : null}
            Envoie {CLONE_MIN_PHOTOS} à {CLONE_MAX_PHOTOS} photos de toi, seul : de face, de trois quarts, de profil, en pied, avec des expressions et des lumières variées, sans lunettes de soleil. Environ 2 $, une dizaine de minutes. Une fois prêt, il remplace la fiche personnages de cet espace pour toutes ses images IA : à faire dans un espace où tu apparais, pas dans un espace à mascottes.
          </p>
          <Button size="sm" variant="secondary" className="mt-2 w-full" loading={busy} onClick={() => fileRef.current?.click()}>
            {!busy && <Upload />} {sending ? `Envoi ${sending.done + 1}/${sending.total}…` : state?.status === "failed" ? "Réessayer avec d'autres photos" : "Choisir mes photos et entraîner"}
          </Button>
          <input ref={fileRef} type="file" multiple accept="image/*" className="hidden" onChange={(e) => e.target.files && train(e.target.files)} />
        </>
      )}
    </div>
  );
}
