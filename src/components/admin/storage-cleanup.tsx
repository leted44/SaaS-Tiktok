"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { readJson } from "@/components/admin/read-json";
import type { CleanupReport } from "@/lib/storage-cleanup";

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} Mo`;

/**
 * The storage cleanup, seen from the admin page: what it would remove right
 * now, when it last ran on its own, and a button to run it — the way to
 * confirm a run the daily one held back because it would remove a lot.
 */
export function StorageCleanup() {
  const [report, setReport] = useState<CleanupReport | null>(null);
  const [lastRun, setLastRun] = useState<{ at: string; note: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function analyse() {
    setError(null);
    const res = await fetch("/api/admin/storage-cleanup", { cache: "no-store" });
    const data = await readJson(res);
    if (!res.ok) return setError(data.error ?? `HTTP ${res.status}`);
    setReport(data.report);
    setLastRun(data.lastRun);
  }

  useEffect(() => {
    analyse().catch((err) => setError(`Impossible d'analyser le stockage : ${err instanceof Error ? err.message : "erreur réseau"}`));
  }, []);

  async function run() {
    if (!report) return;
    if (!confirm(`Supprimer ${report.unusedFiles} fichier(s) inutilisé(s) (${mb(report.unusedBytes)}) et ${report.oldRenders} ancien(s) rendu(s) ? C'est définitif.`)) return;
    setRunning(true);
    try {
      const res = await fetch("/api/admin/storage-cleanup", { method: "POST" });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const r = data.report as CleanupReport;
      toast.success(`${r.deletedFiles} fichier(s) supprimé(s) (${mb(r.deletedBytes)})${r.complete ? "" : " — pas terminé, relance"}.`);
      await analyse();
    } catch (err) {
      toast.error(`Échec : ${err instanceof Error ? err.message : "erreur inconnue"}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="surface space-y-3 p-5 text-sm">
      <p className="font-semibold">Nettoyage du stockage</p>
      <p className="text-muted-foreground">
        Chaque jour, les fichiers que plus rien n'utilise depuis 30 jours sont supprimés (images remplacées, clips et rendus remplacés, restes de projets). Supprimer un projet efface aussi ses fichiers, tout de suite.
      </p>
      {error && <p className="text-red-300">{error}</p>}
      {!report && !error && <p className="text-muted-foreground">Analyse…</p>}
      {report && (
        <div className="space-y-1">
          <p>Stockage actuel : <span className="font-semibold">{report.files} fichiers · {mb(report.bytes)}</span></p>
          <p>Inutilisés depuis plus de 30 jours : <span className="font-semibold">{report.unusedFiles} fichiers · {mb(report.unusedBytes)}</span></p>
          <p>Anciens rendus remplacés : <span className="font-semibold">{report.oldRenders}</span></p>
          <p className="text-xs text-muted-foreground">
            Dernier passage automatique : {lastRun ? new Date(lastRun.at).toLocaleString("fr-FR") : "jamais"}
            {lastRun?.note && ` — en attente de ta confirmation (beaucoup de fichiers à supprimer d'un coup)`}
          </p>
        </div>
      )}
      <Button variant="outline" className="w-full" onClick={run} loading={running} disabled={!report || (report.unusedFiles === 0 && report.oldRenders === 0)}>
        <Trash2 /> Nettoyer maintenant
      </Button>
    </div>
  );
}
