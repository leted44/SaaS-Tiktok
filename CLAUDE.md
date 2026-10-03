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
| Admin image model test | carousel editor (`ImageModelPicker`) | studio visuals panel (`ImageModelPicker`) |
| Writing rules (no invented claims or promises) | `carousel-generator.ts` SYSTEM_PROMPT | `script-generator.ts` SCRIPT_SYSTEM_PROMPT + critic |
| Fil conducteur / series bible UI | carousel editor "Fil conducteur" | `components/studio/visuals-panel.tsx` "Fil conducteur" |
| Storage, cleanup, image reading | `lib/storage.ts`, `lib/storage-cleanup.ts`, `lib/ai/images.ts` (shared) | same |
| Voice-over (ElevenLabs; Eleven v3 default, standard for custom speed) | — (carousels are read, not heard) | `lib/tts/elevenlabs.ts`, `components/studio/audio-panel.tsx` |

## Communication

The owner is a non-technical founder working from a phone, in French. Answer in
French, directly, with concrete numbered actions and how to check they worked.
Never ask for or echo secrets: credentials go straight into Vercel.
