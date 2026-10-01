"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Copy, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Links = { total: number; columns: { name: string; rows: number }[] };
type Status = { configured: false } | { configured: true; from: string; to: string; links: Links };
type Batch = { copied: number; skipped: number; bytes: number; failed: { key: string; error: string }[]; last: string | null; done: boolean };

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} Mo`;

/**
 * The two steps of the move to R2, run from the browser so each request stays
 * within a serverless function's time limit: copy batch after batch until the
 * old bucket is exhausted, then — only if nothing failed — rewrite the links.
 */
export function StorageMigration() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [progress, setProgress] = useState({ copied: 0, skipped: 0, bytes: 0, failed: [] as Batch["failed"], done: false });
  const [rewriting, setRewriting] = useState(false);

  async function refresh() {
    const res = await fetch("/api/admin/storage-migration", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? `HTTP ${res.status}`);
    setStatus(data);
  }

  useEffect(() => {
    refresh().catch(() => setError("Impossible de lire l'état du stockage."));
  }, []);

  async function copy() {
    setCopying(true);
    const total = { copied: 0, skipped: 0, bytes: 0, failed: [] as Batch["failed"], done: false };
    setProgress(total);
    let after: string | null = null;
    try {
      for (;;) {
        const res = await fetch("/api/admin/storage-migration", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "copy", after }) });
        const batch = await res.json();
        if (!res.ok) throw new Error(batch.error ?? `HTTP ${res.status}`);
        const b = batch as Batch;
        total.copied += b.copied;
        total.skipped += b.skipped;
        total.bytes += b.bytes;
        total.failed = [...total.failed, ...b.failed];
        total.done = b.done;
        setProgress({ ...total });
        if (b.done) break;
        after = b.last;
      }
      toast.success(total.failed.length === 0 ? "Tous les fichiers sont sur R2." : `${total.failed.length} fichier(s) n'ont pas pu être copiés.`);
    } catch (err) {
      toast.error(`Copie interrompue : ${err instanceof Error ? err.message : "erreur inconnue"}. Relance-la : les fichiers déjà copiés sont sautés.`);
    } finally {
      setCopying(false);
    }
  }

  async function rewrite() {
    if (!confirm("Faire pointer tous les liens vers R2 ? À faire seulement quand la copie est terminée sans erreur.")) return;
    setRewriting(true);
    try {
      const res = await fetch("/api/admin/storage-migration", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "rewrite" }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast.success(`${data.rows} ligne(s) mises à jour.`);
      await refresh();
    } catch (err) {
      toast.error(`Échec : ${err instanceof Error ? err.message : "erreur inconnue"}`);
    } finally {
      setRewriting(false);
    }
  }

  if (error) return <div className="surface p-5 text-sm text-red-300">{error}</div>;
  if (!status) return <div className="surface p-5 text-sm text-muted-foreground">Chargement…</div>;
  if (!status.configured)
    return (
      <div className="surface space-y-2 p-5 text-sm">
        <p className="font-semibold">R2 n'est pas encore actif.</p>
        <p className="text-muted-foreground">Ajoute dans Vercel les variables R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY et R2_PUBLIC_URL, puis redéploie. Les variables S3_* (Supabase) restent en place : elles servent à lire les anciens fichiers.</p>
      </div>
    );

  const copyClean = progress.done && progress.failed.length === 0;
  return (
    <div className="space-y-4">
      <div className="surface space-y-3 p-5 text-sm">
        <p>
          Les nouveaux fichiers vont déjà dans <span className="font-semibold">{status.to}</span> (R2). Les anciens sont encore dans <span className="font-semibold">{status.from}</span> (Supabase).
        </p>
        <p className="text-muted-foreground">
          Liens qui pointent encore vers Supabase : <span className="font-semibold text-foreground">{status.links.total}</span>
          {status.links.columns.length > 0 && ` (${status.links.columns.map((c) => `${c.name} ${c.rows}`).join(", ")})`}
        </p>
      </div>

      <div className="surface space-y-3 p-5 text-sm">
        <p className="font-semibold">1. Copier les fichiers vers R2</p>
        <p className="text-muted-foreground">Peut prendre plusieurs minutes : garde la page ouverte. Si elle s'interrompt, relance — les fichiers déjà copiés sont sautés.</p>
        <Button variant="gradient" className="w-full" onClick={copy} loading={copying} disabled={rewriting}>
          <Copy /> {progress.done ? "Relancer la copie" : "Copier les fichiers"}
        </Button>
        {(copying || progress.done) && (
          <p className="text-xs text-muted-foreground">
            {progress.copied} copiés ({mb(progress.bytes)}) · {progress.skipped} déjà présents · {progress.failed.length} en échec {progress.done && "· terminé"}
          </p>
        )}
        {progress.failed.length > 0 && (
          <div className="max-h-40 overflow-y-auto rounded-lg border border-red-500/20 p-2 text-[11px] text-red-300">
            {progress.failed.slice(0, 50).map((f) => <p key={f.key}>{f.key} — {f.error}</p>)}
          </div>
        )}
      </div>

      <div className="surface space-y-3 p-5 text-sm">
        <p className="font-semibold">2. Faire pointer les liens vers R2</p>
        <p className="text-muted-foreground">Disponible quand la copie est terminée sans aucun échec. Après ça, plus rien n'est téléchargé depuis Supabase.</p>
        <Button variant="outline" className="w-full" onClick={rewrite} loading={rewriting} disabled={!copyClean || copying || status.links.total === 0}>
          <Link2 /> Mettre à jour les liens
        </Button>
        {status.links.total === 0 && (
          <p className="flex items-center gap-1.5 text-xs text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> Aucun lien ne pointe plus vers Supabase.</p>
        )}
      </div>
    </div>
  );
}
