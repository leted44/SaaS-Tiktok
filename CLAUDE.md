# VidiSprint — working rules

VidiSprint makes two formats from the same project: **short videos** (studio,
`src/components/studio`, `src/lib/pipeline`, `src/server/actions/video-*.ts`)
and **photo carousels** (`src/components/carousel`, `src/lib/carousel`,
`src/server/actions/carousels.ts`). Both share the script, the AI image chain
and the storage.

## Carousel ↔ video parity (the owner's standing rule)

Every improvement made to one format is weighed for the other **in the same
piece of work**, never left for later:

1. Before calling a change done, list which part of the other format does the
   same job, and check whether the change applies there.
2. When it applies, make it in both, in the same commit or the one right after.
3. When it is genuinely format-specific (a slide template, video captions,
   Kling animation…), say so explicitly in the report to the owner.
4. When unsure whether it should carry over, ask the owner before finishing —
   never stay silent about it.
5. The report to the owner always says, for each change, "carrousel : fait /
   vidéo : fait" (or why not).

Counterparts to check every time:

| Concern | Carousel | Video |
| --- | --- | --- |
| Image briefs written by the AI | `lib/ai/carousel-generator.ts` (`imageBrief`, `MOTIF`) | `lib/ai/script-generator.ts` (`SCENE_VISUAL_BRIEF`, `visualMotif`) |
| Opening image (scroll-stopper) | cover brief `coverImagePrompt` (`carousel-generator.ts`) | hook brief `hookVisualDescription` → `Script.hookVisual` (`script-generator.ts`, `pipeline/visuals.ts`) |
| Prompt composition, art direction, framing | `lib/carousel/art-direction.ts` (layout `bleed`/`band`) | same file (layout `frame`, purpose `video`) |
| Generation + check + correction | `lib/carousel/ai-visuals.ts` → `lib/ai/checked-image.ts` | `lib/pipeline/ai-visuals.ts` → `lib/ai/checked-image.ts` |
| One image on its own (generate or redo a single scene/slide, following a neighbour's look) | slide image panel "Générer avec l'IA" → `generateSlideImageAction` (`carousels.ts`) | tile "Créer" / "Refaire" in `visuals-panel.tsx` → `generateProjectVisualsAiAction(…, onlyScene)`, `neighbourReference` in `pipeline/ai-visuals.ts` |
| Admin image model test (Nano Banana 2 / Pro / mix, and GPT Image 2 medium/high through fal.ai — `lib/ai/gpt-image.ts`, `image-models.ts`) | carousel editor (`ImageModelPicker`) | studio visuals panel (`ImageModelPicker`) |
| Structure for retention (short hook, payoff early, one-word question) and default length | `carousel-generator.ts` SYSTEM_PROMPT + `script-generator.ts` CAROUSEL_SCRIPT_RULES; 6 slides (`CONTENT_SLIDES` in `lib/carousel/schema.ts`) | `script-generator.ts` SCRIPT_SYSTEM_PROMPT + critic; 20 s (`DEFAULT_DURATION_SEC` in `lib/scripts/options.ts`) |
| Writing rules (no invented claims or promises) | `carousel-generator.ts` SYSTEM_PROMPT | `script-generator.ts` SCRIPT_SYSTEM_PROMPT + critic |
| Character sheet ("Image de référence", space or project) | `lib/characters.ts` → `Series.cast` in `lib/carousel/ai-visuals.ts`; block in carousel editor | `lib/characters.ts` → `generateSceneVisuals(…, cast)`; block in `visuals-panel.tsx` |
| Character sheet in words for the writers (`lib/ai/cast-reader.ts`, `characterSheetLine`) | `carousel-generator.ts` (`cast`), via `castTextFor` in `carousels.ts` | `script-generator.ts` `BrandContext.cast` + `series-generator.ts`, via `castTextFor` |
| Fil conducteur / series bible UI | carousel editor "Fil conducteur" | `components/studio/visuals-panel.tsx` "Fil conducteur" |
| Storage, cleanup, image reading | `lib/storage.ts`, `lib/storage-cleanup.ts`, `lib/ai/images.ts` (shared) | same |
| Voice-over (ElevenLabs Eleven v3 only, `VOICE_MODEL`; one setting, the tone) | — (carousels are read, not heard) | `lib/tts/elevenlabs.ts`, `components/studio/audio-panel.tsx`, `voice-tone.tsx` |
| Default art direction (the space's latest style) | `lib/space-style.ts` → `carousels.ts`, carousel editor `defaultStyle` | `lib/space-style.ts` → `video-visuals.ts`, studio `defaultVisualStyle` |
| Animating a still (Kling; motion written by Claude from the image + spoken line, `lib/ai/motion-prompt.ts`) | — (a carousel has no motion) | `server/actions/video-clips.ts`, grid in `visuals-panel.tsx` |
| "Copier la description" (the app's full image prompt, to paste in the Gemini or ChatGPT app and import the result; `lib/ai/gemini-prompt.ts`, `components/shared/copy-for-gemini.tsx`) | slide image panel in `carousel-editor.tsx` (`geminiFor`) | empty tiles of the image grid in `visuals-panel.tsx` (briefs from `studio.tsx` `sceneBriefs`) |
| Getting the finished file | "Télécharger les images" / ZIP under the preview | ready card "Télécharger la vidéo" in `export-panel.tsx` + header button; Lambda `downloadBehavior` |

## Communication

The owner is a non-technical founder working from a phone, in French. Answer in
French, directly, with concrete numbered actions and how to check they worked.
Never ask for or echo secrets: credentials go straight into Vercel.
