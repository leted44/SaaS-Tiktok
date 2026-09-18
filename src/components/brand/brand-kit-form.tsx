"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Upload, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { updateBrandKit } from "@/server/actions/brand";
import { CAPTION_PRESETS, CAPTION_FONTS } from "@/lib/captions/presets";
import type { BrandKitInput } from "@/lib/validations";
import { cn } from "@/lib/utils";

interface Props {
  initial: BrandKitInput;
  voices: { id: string; name: string; premium: boolean; style: string }[];
  tracks: { id: string; name: string }[];
  premiumAllowed: boolean;
  watermarkForced: boolean;
}

export function BrandKitForm({ initial, voices, tracks, premiumAllowed, watermarkForced }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<BrandKitInput>(initial);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof BrandKitInput>(k: K, v: BrandKitInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function upload(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", "logo");
    const res = await fetch("/api/assets/upload", { method: "POST", body: fd });
    setUploading(false);
    if (!res.ok) return toast.error((await res.json()).error ?? "Upload failed");
    const { asset } = await res.json();
    set("watermarkUrl", asset.url.startsWith("http") ? asset.url : `${window.location.origin}${asset.url}`);
    toast.success("Watermark uploaded");
  }

  async function save() {
    setSaving(true);
    const res = await updateBrandKit(form);
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Brand kit saved");
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Identity</CardTitle><CardDescription>Name and color system used in captions, progress bars and on-screen text.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5"><Label>Workspace name</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
            <div className="grid gap-4 sm:grid-cols-3">
              {(["primaryColor", "secondaryColor", "accentColor"] as const).map((k) => (
                <div key={k} className="space-y-1.5">
                  <Label>{k.replace("Color", "")}</Label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={form[k]} onChange={(e) => set(k, e.target.value.toUpperCase())} className="h-10 w-12 cursor-pointer rounded-lg border border-white/10 bg-transparent p-1" />
                    <Input value={form[k]} onChange={(e) => set(k, e.target.value)} className="font-mono uppercase" />
                  </div>
                </div>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Font family</Label>
                <Select value={form.fontFamily} onValueChange={(v) => set("fontFamily", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CAPTION_FONTS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Default format</Label>
                <Select value={form.defaultAspect} onValueChange={(v) => set("defaultAspect", v as BrandKitInput["defaultAspect"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="VERTICAL">9:16 Vertical</SelectItem><SelectItem value="SQUARE">1:1 Square</SelectItem><SelectItem value="HORIZONTAL">16:9 Wide</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Caption style</CardTitle><CardDescription>Default kinetic caption preset for new projects.</CardDescription></CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3">
              {CAPTION_PRESETS.map((p) => (
                <button key={p.id} type="button" onClick={() => set("captionPreset", p.id)} className={cn("rounded-xl border p-3 text-left transition", form.captionPreset === p.id ? "border-primary/60 bg-primary/10 shadow-glow-sm" : "border-white/10 hover:border-white/20")}>
                  <div className="flex h-14 items-center justify-center rounded-lg bg-[linear-gradient(160deg,#2a1657,#0B0714)]">
                    <span style={{ fontFamily: p.style.fontFamily, fontWeight: p.style.fontWeight, color: p.style.textColor, textTransform: p.style.uppercase ? "uppercase" : "none", WebkitTextStroke: p.style.strokeWidth ? `1px ${p.style.strokeColor}` : undefined, textShadow: p.id === "neon" ? `0 0 12px ${p.style.highlightColor}` : "0 2px 6px rgba(0,0,0,.6)" }} className="text-lg">
                      Stop <span style={{ color: p.style.highlightMode === "box" ? "#fff" : p.style.highlightColor, background: p.style.highlightMode === "box" ? p.style.highlightColor : "transparent", padding: p.style.highlightMode === "box" ? "0 4px" : 0, borderRadius: 4 }}>scrolling</span>
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold">{p.name}</p>
                  <p className="text-[11px] text-muted-foreground">{p.description}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Audio defaults</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Default voice</Label>
              <Select value={form.defaultVoiceId} onValueChange={(v) => set("defaultVoiceId", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{voices.map((v) => <SelectItem key={v.id} value={v.id} disabled={v.premium && !premiumAllowed}>{v.name} — {v.style}{v.premium && !premiumAllowed ? " (Pro)" : ""}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Default music</Label>
              <Select value={form.defaultMusicId ?? "none"} onValueChange={(v) => set("defaultMusicId", v === "none" ? null : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{tracks.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Language</Label>
              <Select value={form.defaultLanguage} onValueChange={(v) => set("defaultLanguage", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{[["en", "English"], ["es", "Spanish"], ["fr", "French"], ["de", "German"], ["pt", "Portuguese"], ["it", "Italian"]].map(([id, l]) => <SelectItem key={id} value={id}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2">Watermark {watermarkForced && <span className="inline-flex items-center gap-1 text-xs font-normal text-amber-300"><Lock className="h-3 w-3" /> Free plan adds a ClipForge watermark</span>}</CardTitle><CardDescription>Upload a PNG logo to overlay on every render.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-[1fr_200px]">
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input value={form.watermarkUrl ?? ""} onChange={(e) => set("watermarkUrl", e.target.value)} placeholder="https://…/logo.png" />
                <input ref={fileRef} type="file" accept="image/png,image/webp,image/svg+xml" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
                <Button type="button" variant="secondary" loading={uploading} onClick={() => fileRef.current?.click()}><Upload /> Upload</Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Position</Label>
                  <Select value={form.watermarkPosition} onValueChange={(v) => set("watermarkPosition", v as BrandKitInput["watermarkPosition"])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{["top-left", "top-right", "bottom-left", "bottom-right"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between"><Label>Opacity</Label><span className="text-xs">{Math.round(form.watermarkOpacity * 100)}%</span></div>
                  <Slider value={[form.watermarkOpacity]} min={0.1} max={1} step={0.05} onValueChange={([v]) => set("watermarkOpacity", v)} />
                </div>
              </div>
            </div>
            <div className="relative aspect-[9/16] w-full overflow-hidden rounded-lg border border-white/10 bg-[linear-gradient(160deg,#2a1657,#0B0714)]">
              {form.watermarkUrl && (
                <img src={form.watermarkUrl} alt="" style={{ opacity: form.watermarkOpacity }} className={cn("absolute w-16", form.watermarkPosition.includes("top") ? "top-3" : "bottom-3", form.watermarkPosition.includes("left") ? "left-3" : "right-3")} />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Voice & audience</CardTitle><CardDescription>Injected into every AI script prompt.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Tone of voice</Label><Textarea rows={4} value={form.toneOfVoice ?? ""} onChange={(e) => set("toneOfVoice", e.target.value || null)} placeholder="Direct, slightly irreverent, no corporate jargon. Speak like a friend who knows more than you." /></div>
            <div className="space-y-1.5"><Label>Target audience</Label><Textarea rows={4} value={form.targetAudience ?? ""} onChange={(e) => set("targetAudience", e.target.value || null)} placeholder="Ambitious 22-35 y/o professionals who want to start a side business." /></div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <Card>
          <CardHeader><CardTitle>Preview</CardTitle></CardHeader>
          <CardContent>
            <div className="relative aspect-[9/16] overflow-hidden rounded-xl border border-white/10" style={{ background: `linear-gradient(160deg, ${form.primaryColor} 0%, #0B0714 70%)` }}>
              <div className="absolute inset-0 flex items-center justify-center p-4 text-center">
                <span className="text-2xl font-black uppercase text-white [text-shadow:0_3px_10px_rgba(0,0,0,.6)]" style={{ fontFamily: form.fontFamily }}>
                  Your <span style={{ color: form.accentColor }}>brand</span> here
                </span>
              </div>
              <div className="absolute inset-x-0 bottom-0 h-1.5" style={{ background: form.primaryColor, width: "60%" }} />
            </div>
          </CardContent>
        </Card>
        <Button className="w-full" variant="gradient" size="lg" onClick={save} loading={saving}><Save /> Save brand kit</Button>
      </div>
    </div>
  );
}
