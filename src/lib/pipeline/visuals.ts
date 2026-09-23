import { nanoid } from "nanoid";
import type { Project, Script, Voiceover, Workspace } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildShortVideoProps } from "@/lib/render/build-props";
import { scenesSchema, parseJson, type VisualLayer, type VisualPoolItem } from "@/lib/validations";
import { stockCandidates, type StockResult } from "@/lib/stock/search";
import { integrations } from "@/lib/env";

/**
 * The search words for each scene of the composition. The hook and the call to
 * action have no b-roll suggestion of their own, so they borrow the nearest
 * scene's — the same mapping the studio uses.
 */
export function sceneQueries(compositionSceneCount: number, script: Pick<Script, "scenes">): string[] {
  const scriptScenes = parseJson(scenesSchema, script.scenes, []);
  const last = compositionSceneCount - 1;
  return Array.from({ length: compositionSceneCount }, (_, i) => {
    if (i === 0) return scriptScenes[0]?.brollQuery ?? "";
    if (i === last) return scriptScenes[scriptScenes.length - 1]?.brollQuery ?? "";
    return scriptScenes[i - 1]?.brollQuery ?? "";
  });
}

/** One stock pick per scene, never the same clip twice, from candidates listed per scene. */
export function pickPerScene(candidates: StockResult[][]): (StockResult | null)[] {
  const used = new Set<string>();
  return candidates.map((list) => {
    const pick = list.find((c) => !used.has(c.url)) ?? null;
    if (pick) used.add(pick.url);
    return pick;
  });
}

/**
 * Put a stock visual on every scene of a project — the server-side counterpart
 * of "Remplir toutes les scènes" in the studio, for a video nobody is sitting
 * in front of. Layers are laid on the unsnapped scene boundaries, exactly as
 * the studio stores them, so beat sync still moves them at render time.
 *
 * Returns how many scenes got a visual. A scene with no match keeps the
 * animated background, which is a finished look on its own.
 */
export async function fillProjectVisuals(project: Project & { workspace: Workspace }, script: Script, voiceover: Voiceover | null): Promise<number> {
  if (!integrations.stock()) return 0;
  const props = buildShortVideoProps({ project, script, voiceover, workspace: project.workspace, resolution: "1080p", watermark: false, snapCuts: false });
  const queries = sceneQueries(props.scenes.length, script);

  const candidates = await Promise.all(queries.map((q) => (q.trim() ? stockCandidates(q, "video", 4) : Promise.resolve([]))));
  const picks = pickPerScene(candidates);

  const layers: VisualLayer[] = [];
  const pool: VisualPoolItem[] = [];
  picks.forEach((pick, i) => {
    const scene = props.scenes[i];
    if (!pick || !scene) return;
    layers.push({ id: nanoid(8), type: pick.type, src: pick.url, startMs: scene.startMs, endMs: scene.endMs, fit: "cover", kenBurns: pick.type === "video" ? "none" : "in", opacity: 1, sceneIndex: i });
    pool.push({ id: nanoid(8), type: pick.type, src: pick.url, thumbnailUrl: pick.thumbnailUrl, label: pick.author });
  });

  await prisma.project.update({ where: { id: project.id }, data: { visualLayers: layers, visualPool: pool } });
  return layers.length;
}
