import type { CaptionStyle, VisualLayer, BackgroundStyle, Scene } from "@/lib/validations";
import type { ShortVideoProps } from "@/lib/render/props";
import type { SocialCopy } from "@/lib/social/captions";

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
  captionStyle: CaptionStyle;
  visualLayers: VisualLayer[];
  backgroundStyle: BackgroundStyle;
}

export interface StudioScript {
  id: string;
  version: number;
  title: string;
  hook: string;
  alternativeHooks: string[];
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
  project: StudioProject;
  scripts: StudioScript[];
  activeScriptId: string | null;
  voiceover: StudioVoiceover | null;
  renders: StudioRender[];
  previewProps: ShortVideoProps | null;
  user: { credits: number; plan: string };
  planLimits: { watermark: boolean; maxResolution: "720p" | "1080p" | "4K"; premiumVoices: boolean; voiceCloning: boolean; costs: { "720p": number; "1080p": number; "4K": number; voicePer30s: number; voiceClone: number; socialCopy: number } };
  voices: { id: string; name: string; style: string; gender: string; language: string; premium: boolean }[];
  customVoice: { name: string; sampleUrl: string } | null;
  tracks: { id: string; name: string; mood: string; url: string; premium: boolean }[];
  integrations: { ai: boolean; tts: boolean; stock: boolean };
}

export interface EditorState {
  captionStyle: CaptionStyle;
  visualLayers: VisualLayer[];
  backgroundStyle: BackgroundStyle;
  musicTrackId: string | null;
  musicUrl: string | null;
  musicName: string | null;
  musicVolume: number;
  voiceId: string | null;
}
