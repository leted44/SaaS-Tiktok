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
| Image briefs written by the AI (a setting inside the body is named by its tissue, never its skull or mouth: `INNER_SETTING` in `writing-rules.ts`) | `lib/ai/carousel-generator.ts` (`imageBrief`, `MOTIF`) | `lib/ai/script-generator.ts` (`SCENE_VISUAL_BRIEF`, `visualMotif`) |
| Opening image (scroll-stopper) | cover brief `coverImagePrompt` (`carousel-generator.ts`) | hook brief `hookVisualDescription` → `Script.hookVisual` (`script-generator.ts`, `pipeline/visuals.ts`) |
| Prompt composition, art direction, framing | `lib/carousel/art-direction.ts` (layout `bleed`/`band`) | same file (layout `frame`, purpose `video`) |
| Generation (check + correction off for every model: `AUTO_CORRECTION = false`, one call per image, "Refaire" for another) | `lib/carousel/ai-visuals.ts` → `lib/ai/checked-image.ts` | `lib/pipeline/ai-visuals.ts` → `lib/ai/checked-image.ts` |
| One image on its own (generate or redo a single scene/slide, following a neighbour's look) | slide image panel "Générer avec l'IA" → `generateSlideImageAction` (`carousels.ts`) | tile "Créer" / "Refaire" in `visuals-panel.tsx` → `generateProjectVisualsAiAction(…, onlyScene)`, `neighbourReference` in `pipeline/ai-visuals.ts` |
| Call-to-action scene image (a video's CTA reuses the last scene's still on its own layer, never drawn in a batch — `lib/pipeline/cta-image.ts`) | — (the carousel's last slide has no image) | tile "Même image que…" in `visuals-panel.tsx`; `generateProjectVisualsAiAction` |
| The first drawing kept when the automatic correction replaced it (`CheckedImage.draft`; "Remettre la 1re version"; dormant while `AUTO_CORRECTION` is off) | `slide.draftImage` in `carousel-editor.tsx` (`ImageControl`) | library entry "Scène N · 1re version" in `visuals-panel.tsx` (`drafts` of `generateProjectVisualsAiAction`) |
| Downloading one image | — (the carousel's "Télécharger les images" covers the slides) | download link on each tile and library entry in `visuals-panel.tsx` |
| Admin image model test (Nano Banana 2 / Pro / mix, and GPT Image 2 medium/high through fal.ai — `lib/ai/gpt-image.ts`, `image-models.ts`) | carousel editor (`ImageModelPicker`) | studio visuals panel (`ImageModelPicker`) |
| Structure for retention (short hook, payoff early, one-word question) and default length | `carousel-generator.ts` SYSTEM_PROMPT + `script-generator.ts` CAROUSEL_SCRIPT_RULES; 6 slides (`CONTENT_SLIDES` in `lib/carousel/schema.ts`) | `script-generator.ts` SCRIPT_SYSTEM_PROMPT (critic off: `CRITIC_ENABLED = false`, one pass for video and carousel alike); 20 s (`DEFAULT_DURATION_SEC` in `lib/scripts/options.ts`) |
| Closing ask (ONE action + the moment it will be needed + who to send it to, named by what they say; no drawn buttons or follow card) | last slide `ClosingSlide` in `components/carousel/slide.tsx` (text centred on top in Montserrat, cover photo lowered under it, accent on bookmark and rule, 👉 Twemoji, `shareTo`), fields `ctaTitle`/`ctaBody`/`ctaAction`/`ctaShareTo` in `carousel-generator.ts`; `CAROUSEL_SCRIPT_RULES` | spoken CTA rule in `script-generator.ts` SCRIPT_SYSTEM_PROMPT |
| Writing rules (no invented claims or promises) | `carousel-generator.ts` SYSTEM_PROMPT | `script-generator.ts` SCRIPT_SYSTEM_PROMPT (critic off; the code check `draftProblems` still flags rules to verify on the admin card) |
| Character sheet ("Image de référence", space or project) | `lib/characters.ts` → `Series.cast` in `lib/carousel/ai-visuals.ts`; block in carousel editor | `lib/characters.ts` → `generateSceneVisuals(…, cast)`; block in `visuals-panel.tsx` |
| Character sheet in words for the writers (`lib/ai/cast-reader.ts`, `characterSheetLine`) | `carousel-generator.ts` (`cast`), via `castTextFor` in `carousels.ts` | `script-generator.ts` `BrandContext.cast` + `series-generator.ts`, via `castTextFor` |
| Fil conducteur / series bible UI | carousel editor "Fil conducteur" | `components/studio/visuals-panel.tsx` "Fil conducteur" |
| Storage, cleanup, image reading | `lib/storage.ts`, `lib/storage-cleanup.ts`, `lib/ai/images.ts` (shared) | same |
| Voice-over (ElevenLabs Eleven v3 only, `VOICE_MODEL`; one setting, the tone) | — (carousels are read, not heard) | `lib/tts/elevenlabs.ts`, `components/studio/audio-panel.tsx`, `voice-tone.tsx` |
| Default art direction (the space's latest style) | `lib/space-style.ts` → `carousels.ts`, carousel editor `defaultStyle` | `lib/space-style.ts` → `video-visuals.ts`, studio `defaultVisualStyle` |
| Animating a still (Kling; motion written by Claude from the image + spoken line, `lib/ai/motion-prompt.ts`) | — (a carousel has no motion) | `server/actions/video-clips.ts`, grid in `visuals-panel.tsx` |
| "Copier la description", admin only (the app's full image prompt, to paste in the Gemini or ChatGPT app and import the result; `lib/ai/gemini-prompt.ts`, `components/shared/copy-for-gemini.tsx`) | slide image panel in `carousel-editor.tsx` (`geminiFor`) | empty tiles of the image grid in `visuals-panel.tsx` (briefs from `studio.tsx` `sceneBriefs`) |
| Admin test: slide drawn whole by GPT Image, text included (`slide.bakedText`; the slide is then that image alone; a text edit needs « Redessiner ») | `lib/carousel/baked-slide.ts` → `generateBakedSlidesAction` (`carousels.ts`); « Texte dans l'image » box in Visuels + per-slide buttons in `carousel-editor.tsx` | — (a video's text is its captions, timed to the voice) |
| Emoji (bundled Twemoji served to `next/og` from disk, `lib/carousel/emoji.ts`, `src/assets/emoji/twemoji`; kept in bodies and closing lines by `tidyEmoji`, stripped from titles/labels/briefs by `stripEmoji`) | writer rule in `carousel-generator.ts` SYSTEM_PROMPT (list markers, at most one per line, none in titles); slide route; 👉 on the closing slide | captions have their own `emojiBoost`; spoken text never carries emoji (the voice would read them); the cover route draws any typed in a title |
| Captions on/off (`captionStyle.enabled`; off renders no words — `build-props.ts`, `ShortVideo.tsx`, switch in `captions-panel.tsx`) | — (the carousel's text is the slides) | Sous-titres tab + autopilot template editor |
| Cover image with a catchy title (downloaded, set as the post's cover; title kept inside the profile grid's 3:4 crop; 4 faces, light title and word colours — `COVER_FONTS`, `COVER_COLORS`) | the carousel's own cover slide (`coverTitle`, `coverEmphasis` in `carousel-generator.ts`) | Export tab "Couverture": `components/studio/cover-panel.tsx` → `/api/projects/[id]/cover` (`video-cover.tsx`, `lib/video-cover.ts`); titles from `Script.coverTitles` (`script-generator.ts`), older scripts fall back to their hook lines |
| Results loop (screenshot reading, diagnosis, account lessons, reminders — all paid Claude calls, switched off: `RESULTS_ENABLED = false` in `lib/results/config.ts`; code and data kept) | same: button hidden in `carousel-editor.tsx`, lessons not injected in `carousel-generator.ts` | same: button hidden in `studio.tsx`, lessons not injected in `script-generator.ts`; `/lessons` page, sidebar link, reminders off |
| Getting the finished file | "Télécharger les images" / ZIP under the preview | ready card "Télécharger la vidéo" in `export-panel.tsx` + header button; Lambda `downloadBehavior` |

## Communication

The owner is a non-technical founder working from a phone, in French. Answer in
French, directly, with concrete numbered actions and how to check they worked.
Never ask for or echo secrets: credentials go straight into Vercel.
