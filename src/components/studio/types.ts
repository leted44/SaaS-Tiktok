import type { VideoLook } from "@/lib/space-kit";
import type { CoverTitle } from "@/lib/video-cover";
import type { CaptionStyle, VisualLayer, VisualPoolItem, BackgroundStyle, Scene } from "@/lib/validations";
import type { ShortVideoProps } from "@/lib/render/props";
import type { SocialCopy } from "@/lib/social/captions";
import type { ReviewReport, ReviewTally } from "@/lib/ai/review-report";
import type { CharacterReferenceState } from "@/components/shared/character-reference";

export type { ReviewTally };

export interface StudioProject {
  id: string;
  title: string;
  status: string;
  aspectRatio: "VERTICAL" | "SQUARE" | "HORIZONTAL";
  targetDurationSec: number;
  topic: string | null;
  niche: string | null;
  voiceId: string | null;
  musicTrackId: string | null;
  musicUrl: string | null;
  musicName: string | null;
  musicVolume: number;
  musicStartMs: number;
  musicBpm: number | null;
  musicBeatOffsetMs: number | null;
  beatSync: boolean;
  captionStyle: CaptionStyle;
  visualLayers: VisualLayer[];
  visualPool: VisualPoolItem[];
  backgroundStyle: BackgroundStyle;
  visualStyle: string | null;
  /** The style shown while visualStyle is unset: its space's (lib/space-style), else the app default — the one the server will draw with. */
  defaultVisualStyle: string;
  visualMotif: string;
  postedAt: string | null;
  postedPlatforms: string[];
  /** The character sheet its AI images are drawn with (lib/characters). */
  characterReference: CharacterReferenceState;
  /** Its space's saved look (lib/space-kit) and voice; null outside a space. */
  spaceLook: { spaceName: string; voiceId: string | null; look: VideoLook | null } | null;
}

export interface StudioScript {
  id: string;
  version: number;
  title: string;
  hook: string;
  /** The AI image brief of the hook, when the script has its own. */
  hookVisual: string | null;
  alternativeHooks: string[];
  /** Titles for the video's cover (lib/video-cover); null on scripts written before covers. */
  coverTitles: CoverTitle[] | null;
  scenes: Scene[];
  callToAction: string;
  hashtags: string[];
  socialCopy: SocialCopy;
  viralityScore: number;
  hookScore: number;
  retentionScore: number;
  clarityScore: number;
  scoreRationale: string | null;
  estimatedDurationSec: number;
  wordCount: number;
  createdAt: string;
  /** What the critic pass changed — admin only, null otherwise and on older scripts. */
  review: ReviewReport | null;
}

export interface StudioVoiceover {
  id: string;
  audioUrl: string | null;
  durationMs: number | null;
  voiceId: string;
  provider: string;
  createdAt: string;
}

export interface RenderTimingsView {
  totalMs: number | null;
  renderFramesMs: number | null;
  encodeMs: number | null;
  combineMs: number | null;
  chunks: number;
  lambdasInvoked: number;
  retries: number;
  slowestChunk: { frames: [number, number]; ms: number } | null;
}

export interface StudioRender {
  id: string;
  status: string;
  timings: RenderTimingsView | null;
  progress: number;
  step: string;
  outputUrl: string | null;
  thumbnailUrl: string | null;
  error: string | null;
  createdAt: string;
  width: number;
  height: number;
  creditsCharged: number;
}

export interface StudioProps {
  /** The project is so far a carousel: its script is the carousel's source, not a video left half-made. */
  carouselOnly?: boolean;
  project: StudioProject;
  scripts: StudioScript[];
  activeScriptId: string | null;
  /** The critic pass's record on the latest video scripts — admin only. */
  reviewTally: ReviewTally | null;
  voiceover: StudioVoiceover | null;
  renders: StudioRender[];
  previewProps: ShortVideoProps | null;
  user: { credits: number; plan: string; admin: boolean };
  planLimits: {
    watermark: boolean;
    maxResolution: "720p" | "1080p" | "4K";
    premiumVoices: boolean;
    voiceCloning: boolean;
    autopilot: boolean;
    costs: { "720p": number; "1080p": number; "4K": number; voicePer30s: number; voiceClone: number; socialCopy: number; script: number; aiImage: number; videoClipStandard: number; videoClipStandardLong: number; videoClipPro: number; videoClipProLong: number };
  };
  voices: { id: string; name: string; style: string; gender: string; language: string; premium: boolean }[];
  customVoice: { name: string; sampleUrl: string } | null;
  tracks: { id: string; name: string; mood: string; url: string; premium: boolean }[];
  integrations: { ai: boolean; tts: boolean; stock: boolean; aiImages: boolean; videoClips: boolean };
}

export interface EditorState {
  captionStyle: CaptionStyle;
  visualLayers: VisualLayer[];
  visualPool: VisualPoolItem[];
  backgroundStyle: BackgroundStyle;
  musicTrackId: string | null;
  musicUrl: string | null;
  musicName: string | null;
  musicVolume: number;
  musicStartMs: number;
  musicBpm: number | null;
  musicBeatOffsetMs: number | null;
  beatSync: boolean;
  voiceId: string | null;
  visualStyle: string | null;
  visualMotif: string;
}
