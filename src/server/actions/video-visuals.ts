"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/auth";
import { buildShortVideoProps } from "@/lib/render/build-props";
import { sceneVisualDescriptions } from "@/lib/pipeline/visuals";
import { projectCast } from "@/lib/characters";
import { spaceVisualStyle } from "@/lib/space-style";
import { existingSceneReference, generateSceneVisuals, neighbourReference, videoAspect, type SceneTarget } from "@/lib/pipeline/ai-visuals";
import { ctaCopyOf, ctaSceneIndex } from "@/lib/pipeline/cta-image";
import { chargeCredits, refundCredits } from "@/lib/credits";
import { isAdmin, CREDIT_COSTS } from "@/lib/plans";
import { DEFAULT_VISUAL_STYLE, VISUAL_STYLES, type VisualStyle } from "@/lib/carousel/art-direction";
import { CAPTION_PRESET_FOR_VISUAL_STYLE, presetStyle } from "@/lib/captions/presets";
import { captionStyleSchema, visualLayersSchema, type CaptionStyle, type VisualLayer } from "@/lib/validations";
import { integrations } from "@/lib/env";
import { asImageModelChoice, DEFAULT_IMAGE_MODEL } from "@/lib/ai/image-models";
import { guard, type ActionResult } from "@/server/action-result";

const asStyle = (value: unknown): VisualStyle | null => ((VISUAL_STYLES as readonly unknown[]).includes(value) ? (value as VisualStyle) : null);

/**
 * AI visuals for a video's scenes, written from its own art direction — the
 * video counterpart of `generateCarouselVisualsAction`.
 *
 * "missing" only fills scenes with no visual at all: the same convention the
 * stock "Remplir toutes les scènes" already uses, so a scene the user filled
 * by hand — stock or their own upload — is never silently replaced. "all"
 * regenerates every scene with a description, the video's own version of the
 * carousel's "Tout régénérer" (the studio gates it behind a confirmation,
 * same as there). Credits are taken for every image up front and refunded
 * one by one for those that fail.
 */
export async function generateProjectVisualsAiAction(
  projectId: string,
  mode: "missing" | "all" = "missing",
  imageModel?: string,
  /** Draw this scene alone — replacing its current image — and leave every other scene untouched. */
  onlyScene?: number,
): Promise<ActionResult<{ layers: VisualLayer[]; visualStyle: string; generated: number; failed: number; creditsLeft: number; captionStyle: CaptionStyle | null; ctaFilled: boolean }>> {
  const started = Date.now();
  return guard(async () => {
    const user = await requireDbUser();
    if (!integrations.aiImages()) throw new Error("La génération d'images IA n'est pas configurée.");

    const project = await prisma.project.findFirstOrThrow({ where: { id: projectId, userId: user.id }, include: { workspace: true } });
    if (!project.activeScriptId) throw new Error("Ce projet n'a pas encore de script.");
    const script = await prisma.script.findFirstOrThrow({ where: { id: project.activeScriptId, projectId } });
    const voiceover = await prisma.voiceover.findFirst({ where: { projectId, scriptId: script.id, status: "READY" }, orderBy: { createdAt: "desc" } });

    const visualStyle = asStyle(project.visualStyle) ?? (await spaceVisualStyle(user.id, project.spaceId)) ?? DEFAULT_VISUAL_STYLE;
    // Only a project's first-ever style pick also switches its captions — matching
    // the carousel's own template auto-pick at creation, never overriding a caption
    // look chosen afterwards, deliberately, once AI visuals are already in use.
    const isFirstStyle = project.visualStyle === null;
    const motif = project.visualMotif ?? "";
    const currentLayers = visualLayersSchema.parse(project.visualLayers ?? []);

    const props = buildShortVideoProps({ project, script, voiceover, workspace: project.workspace, resolution: "1080p", watermark: false, snapCuts: false });
    const descriptions = sceneVisualDescriptions(props.scenes.length, script);
    const hasLayer = new Set(currentLayers.map((l) => l.sceneIndex).filter((i) => i !== undefined));

    if (onlyScene !== undefined && (!Number.isInteger(onlyScene) || onlyScene < 0 || onlyScene >= props.scenes.length)) throw new Error("Cette scène n'existe pas.");
    // The CTA is never drawn in a batch: it reuses the last scene's image (lib/pipeline/cta-image).
    const cta = ctaSceneIndex(props.scenes.length);
    const targets: SceneTarget[] = props.scenes
      .map((scene, index) => ({ index, startMs: scene.startMs, endMs: scene.endMs, description: descriptions[index]?.trim() ?? "", intent: scene.text }))
      .filter((t) => t.description && (onlyScene !== undefined ? t.index === onlyScene : t.index !== cta && (mode === "all" || !hasLayer.has(t.index))));
    if (onlyScene !== undefined && !targets.length) throw new Error("Cette scène n'a pas de description d'image. Ajoute une image à la main, ou régénère le script.");

    /** The CTA's copy of the last scene's image, in a batch: when it has none yet, or on "all". */
    const withCta = (layers: VisualLayer[]): { layers: VisualLayer[]; filled: boolean } => {
      if (onlyScene !== undefined || cta === null || (mode !== "all" && layers.some((l) => l.sceneIndex === cta))) return { layers, filled: false };
      const copy = ctaCopyOf(layers, props.scenes);
      return copy ? { layers: [...layers.filter((l) => l.sceneIndex !== cta), copy], filled: true } : { layers, filled: false };
    };

    if (!targets.length) {
      const only = withCta(currentLayers);
      if (only.filled) await prisma.project.update({ where: { id: projectId }, data: { visualLayers: only.layers, visualStyle } });
      if (only.filled) revalidatePath(`/studio/${projectId}`);
      return { layers: only.layers, visualStyle, generated: 0, failed: 0, creditsLeft: user.credits, captionStyle: null, ctaFilled: only.filled };
    }

    const unit = isAdmin(user.role) ? 0 : CREDIT_COSTS.AI_IMAGE;
    const total = unit * targets.length;
    let creditsLeft = total > 0 ? await chargeCredits(user.id, total, "SCRIPT_GENERATION", `${targets.length} visuels vidéo générés par IA`) : user.credits;

    const [reference, cast] = await Promise.all([
      onlyScene !== undefined ? neighbourReference(currentLayers, visualStyle, user.id, onlyScene) : existingSceneReference(currentLayers, visualStyle, user.id),
      projectCast(projectId, user.id),
    ]);
    const outcomes = await generateSceneVisuals(user.id, targets, visualStyle, motif, videoAspect(project.aspectRatio), reference, started + 170_000,
      // The image model test is the admin's alone, as on the carousel; clients get Nano Banana 2.
      isAdmin(user.role) ? asImageModelChoice(imageModel) : DEFAULT_IMAGE_MODEL,
      cast);
    const failures = outcomes.filter((o) => !o.layer);
    if (failures.length && unit > 0) {
      creditsLeft = await refundCredits(user.id, unit * failures.length, `Remboursement — ${failures.length} visuel${failures.length > 1 ? "s" : ""} vidéo non généré${failures.length > 1 ? "s" : ""}`);
    }
    const generated = outcomes.length - failures.length;
    if (!generated) throw new Error(failures[0]?.error ?? "Aucun visuel n'a pu être généré. Réessaie dans un instant.");

    const bySceneIndex = new Map(outcomes.filter((o) => o.layer).map((o) => [o.index, o.layer!]));
    const drawn = [...currentLayers.filter((l) => l.sceneIndex === undefined || !bySceneIndex.has(l.sceneIndex)), ...bySceneIndex.values()];
    const { layers, filled: ctaFilled } = withCta(drawn);

    const currentCaptionStyle = captionStyleSchema.safeParse(project.captionStyle).success ? captionStyleSchema.parse(project.captionStyle) : null;
    const captionStyle = isFirstStyle ? presetStyle(CAPTION_PRESET_FOR_VISUAL_STYLE[visualStyle], currentCaptionStyle?.position) : undefined;

    await prisma.project.update({ where: { id: projectId }, data: { visualLayers: layers, visualStyle, ...(captionStyle ? { captionStyle } : {}) } });
    revalidatePath(`/studio/${projectId}`);
    return { layers, visualStyle, generated, failed: failures.length, creditsLeft, captionStyle: captionStyle ?? null, ctaFilled };
  });
}
